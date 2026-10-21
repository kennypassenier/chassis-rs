// The selection bar [kpadopt5; homelab's `.sk-batch`, kyu's dead-letter requeue, JobTracker's list].
//
// A bar that is there as soon as rows are ticked: how many, which ones, the
// page's actions for them, and a way to untick everything. It extends the data
// table's actions slot (`data-kp-datatable-actions`) into a bar of its own that
// also serves a list of cards or a board.
//
//   <div class="kp-selection" data-kp-selection data-kp-selection-for="orders">
//       <div class="kp-selection__actions">
//           <button class="kp-button" data-kp-selection-action="requeue">Requeue</button>
//           <button class="kp-button kp-button--destructive" data-kp-selection-action="delete">Delete</button>
//       </div>
//   </div>
//
// The module adds the count ("3 selected", exact, in the width of the next
// digit), the names (wrapping, "+4 more" with the exact number, never cut with
// an ellipsis), the button that unticks all (also Esc) and, on a narrow bar,
// the Actions button that holds the page's buttons. It is fed by the boxes
// (`data-kp-select-row`) of the element it is for, through their `change`
// events and the data table's `kp-datatable-select`, or by setSelection().
//
// Options, as attributes and as the second argument of attachSelectionBars():
//
//   data-kp-selection-for    ids of the table(s) or list(s) it serves, space separated; default the nearest
//   data-kp-placement        `sticky-top` (default) | `inline` | `floating-bottom`
//   data-kp-selection-names  `names` (default) | `count`
//   data-kp-selection-max    how many names before "+N more" (default 6)
//   data-kp-select-matching  how many rows match in all (the page counts them): the bar offers "Select all 312 that match"
//   data-kp-undo-ms          read by the page's undo (default 6000); the bar only carries it in the action event
//
// The bar keeps its place whether or not anything is ticked: it slides over a
// space it holds (inline and sticky-top) or floats up from the foot
// (floating-bottom), so the list under it never jumps. A press on a button
// marked `data-kp-selection-action` fires `kp-selection-action` on the bar with
// what is ticked. An action that is running calls setSelectionBusy(), one that
// some rows refused calls setSelectionResult(), and setSelectionRules() turns
// an action off, with the reason, for a selection it does not fit.

import { getStrings } from './strings.js';
import { rowSelect } from './row-select.js';

/** The bars this module looks after. */
export const SELECTION = '[data-kp-selection]';
/** The boxes it reads. */
const BOX = '[data-kp-select-row]';
/** Fired on the bar when what is selected changed: `{ keys, items, count, matching }`. */
export const SELECTION_EVENT = 'kp-selection-change';
/** Fired on the bar when the reader unticked all with its button or Esc: `{ keys }` (the ones that were selected). */
export const SELECTION_CLEAR_EVENT = 'kp-selection-clear';
/** Fired on the bar when the offer for all matching rows is taken or given back: `{ matching, total }`. */
export const SELECTION_MATCHING_EVENT = 'kp-selection-matching';
/** Fired on the bar, cancelable, when a button marked `data-kp-selection-action` is pressed: `{ action, button, keys, items, matching, undoMs }`. */
export const SELECTION_ACTION_EVENT = 'kp-selection-action';
/** The names shown before "+N more". */
export const SELECTION_NAMES = 6;
/** How long the bar waits for a burst of ticks before it says the count [ms]. */
export const SELECTION_SAY_MS = 350;

/** @typedef {{ key: string, label: string }} SelectionItem */

/**
 * @typedef {object} SelectionOptions
 * @property {'sticky-top' | 'inline' | 'floating-bottom'} [placement]
 * @property {'names' | 'count'} [names]
 * @property {number} [maxNames]
 * @property {number} [matching]
 */

/**
 * @typedef {object} Memory
 * @property {HTMLElement[]} sources
 * @property {SelectionItem[]} items
 * @property {Set<string>} known every key the sources had at the last read
 * @property {boolean} manual fed by setSelection()
 * @property {number} matchingTotal
 * @property {boolean} matching
 * @property {boolean} namesOpen
 * @property {string} busy
 * @property {{ done: number, total: number } | null} progress how far a running action is, "3 of 7 done" [wish-1120]
 * @property {Record<string, (items: SelectionItem[]) => string | null>} rules
 * @property {number} sayTimer
 * @property {() => void} refresh
 */

/** @type {WeakMap<HTMLElement, Memory>} */
const MEMORY = new WeakMap();

/** @param {Document} doc @param {string} className @param {string} [tag] */
const make = (doc, className, tag = 'div') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/** @param {HTMLElement} row */
const labelOf = (row) => {
    const box = row.querySelector(BOX);
    const named = row.dataset.kpRowLabel ?? box?.getAttribute('aria-label')?.replace(/^select\s+/i, '');
    return (named ?? row.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
};
/** @param {Element} box @returns {HTMLElement | null} */
const rowOf = (box) => /** @type {HTMLElement | null} */ (box.closest('[data-kp-row-key], tr, li, [role="row"]'));
/** @param {HTMLElement} row @param {number} index */
const keyOf = (row, index) =>
    row.dataset.kpRowKey ?? (row.id || /** @type {HTMLInputElement | null} */ (row.querySelector(BOX))?.value || `row-${index}`);

/**
 * The elements a bar serves.
 * @param {HTMLElement} bar
 * @returns {HTMLElement[]}
 */
function sourcesOf(bar) {
    const doc = bar.ownerDocument;
    const named = (bar.getAttribute('data-kp-selection-for') ?? '').split(/\s+/).filter(Boolean);
    if (named.length) return /** @type {HTMLElement[]} */ (named.map((id) => doc.getElementById(id)).filter((el) => el !== null));
    // The nearest: the first ancestor that holds select boxes.
    for (let up = bar.parentElement; up; up = up.parentElement) if (up.querySelector(BOX)) return [up];
    return [];
}

/** Whether `row` is on the page and not folded away by a filter. @param {HTMLElement} row */
const shownRow = (row) => !row.hidden && !row.closest('[hidden]');

/**
 * Read what is ticked in the sources.
 * @param {Memory} memory
 */
function readSources(memory) {
    /** @type {Map<string, SelectionItem>} */
    const items = new Map();
    const known = new Set();
    let shown = 0;
    let shownTicked = 0;
    let index = 0;
    for (const source of memory.sources) {
        for (const box of /** @type {NodeListOf<HTMLInputElement>} */ (source.querySelectorAll(BOX))) {
            const row = rowOf(box);
            if (!row) continue;
            const key = keyOf(row, index++);
            known.add(key);
            const on = shownRow(row);
            if (on && !box.disabled) {
                shown += 1;
                if (box.checked) shownTicked += 1;
            }
            if (box.checked && !items.has(key)) items.set(key, { key, label: labelOf(row) });
        }
    }
    return { items: [...items.values()], known, shown, shownTicked };
}

/** @param {HTMLElement} bar @param {Memory} memory */
function parts(bar, memory) {
    const doc = bar.ownerDocument;
    let panel = /** @type {HTMLElement | null} */ (bar.querySelector(':scope > .kp-selection__panel'));
    if (panel)
        return /** @type {{ panel: HTMLElement, count: HTMLElement, names: HTMLElement, offer: HTMLElement, result: HTMLElement, actions: HTMLElement, toggle: HTMLButtonElement, clear: HTMLButtonElement, live: HTMLElement }} */ ({
            panel,
            count: panel.querySelector('.kp-selection__count'),
            names: panel.querySelector('.kp-selection__names'),
            offer: panel.querySelector('.kp-selection__offer'),
            result: panel.querySelector('.kp-selection__result'),
            actions: panel.querySelector('.kp-selection__actions'),
            toggle: panel.querySelector('.kp-selection__toggle'),
            clear: panel.querySelector('.kp-selection__clear'),
            live: bar.querySelector(':scope > .kp-selection__live'),
        });
    const strings = getStrings();
    let actions = /** @type {HTMLElement | null} */ (bar.querySelector(':scope > .kp-selection__actions'));
    if (!actions) {
        actions = make(doc, 'kp-selection__actions');
        for (const child of [...bar.children]) if (child.matches('.kp-button, button')) actions.append(child);
    }
    panel = make(doc, 'kp-selection__panel');
    const id = bar.id || (bar.id = `kp-selection-${Math.random().toString(36).slice(2, 7)}`);
    const count = make(doc, 'kp-selection__count', 'p');
    const names = make(doc, 'kp-selection__names', 'p');
    const offer = make(doc, 'kp-selection__offer', 'p');
    const result = make(doc, 'kp-selection__result', 'p');
    const toggle = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-selection__toggle', 'button'));
    toggle.type = 'button';
    toggle.textContent = strings.selectionActions;
    toggle.setAttribute('aria-expanded', 'false');
    actions.id ||= `${id}-actions`;
    toggle.setAttribute('aria-controls', actions.id);
    const clear = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-button--ghost kp-selection__clear', 'button'));
    clear.type = 'button';
    clear.textContent = strings.selectionClear;
    clear.title = strings.selectionClearTitle;
    const live = make(doc, 'kp-sr-only kp-selection__live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    panel.append(count, names, offer, result, toggle, actions, clear);
    bar.replaceChildren(panel, live);
    bar.setAttribute('role', 'region');
    if (!bar.hasAttribute('aria-label') && !bar.hasAttribute('aria-labelledby')) bar.setAttribute('aria-label', strings.selectionLabel);
    void memory;
    return { panel, count, names, offer, result, actions, toggle, clear, live };
}

/** @param {HTMLElement} bar @param {Memory} memory */
function draw(bar, memory) {
    const strings = getStrings();
    const p = parts(bar, memory);
    const { items } = memory;
    const total = memory.matching ? memory.matchingTotal : items.length;
    const empty = items.length === 0 && !memory.matching;
    bar.setAttribute('data-kp-selection-state', memory.busy ? 'busy' : empty ? 'empty' : 'selected');
    p.panel.toggleAttribute('inert', empty);
    p.panel.setAttribute('aria-hidden', String(empty));
    bar.toggleAttribute('aria-busy', Boolean(memory.busy));

    // The count keeps the room of the digit after it: tabular figures, reserved by the ch of the longest.
    if (memory.busy) {
        p.count.replaceChildren();
        const wheel = make(bar.ownerDocument, 'kp-spinner', 'span');
        wheel.setAttribute('aria-hidden', 'true');
        const words = make(bar.ownerDocument, 'kp-selection__busy', 'span');
        words.textContent = strings.selectionBusy(memory.busy);
        p.count.append(wheel, words);
        if (memory.progress) {
            const far = make(bar.ownerDocument, 'kp-selection__progress', 'span');
            far.textContent = strings.selectionProgress(memory.progress.done, memory.progress.total);
            p.count.append(far);
        }
    } else {
        p.count.textContent = memory.matching ? strings.selectionMatchingOn(memory.matchingTotal) : strings.selectionCount(items.length);
    }
    p.count.style.setProperty('--kp-selection-digits', String(String(Math.max(total, 99)).length));

    // Names, wrapping; the rest as "+N more" with its number, which opens the whole list.
    const nameMode = (bar.getAttribute('data-kp-selection-names') ?? 'names') === 'count' ? 'count' : 'names';
    const max = Number(bar.getAttribute('data-kp-selection-max')) || SELECTION_NAMES;
    p.names.hidden = nameMode === 'count' || items.length === 0 || memory.matching;
    if (!p.names.hidden) {
        const open = memory.namesOpen;
        const doc = bar.ownerDocument;
        const list = open ? items : items.slice(0, max);
        const nodes = /** @type {Node[]} */ ([]);
        list.forEach((item, i) => {
            const name = make(doc, 'kp-selection__name', 'span');
            name.textContent = item.label + (i < list.length - 1 || items.length > list.length ? ',' : '');
            nodes.push(name);
        });
        if (items.length > max) {
            const more = /** @type {HTMLButtonElement} */ (make(doc, 'kp-selection__more', 'button'));
            more.type = 'button';
            more.setAttribute('aria-expanded', String(open));
            more.textContent = open ? strings.selectionFewer : strings.selectionMore(items.length - max);
            nodes.push(more);
        }
        p.names.replaceChildren(...nodes);
    }

    // The offer for the rows beyond what is shown.
    const { shown, shownTicked } = memory.sources.length ? readSources(memory) : { shown: 0, shownTicked: 0 };
    const offerable = memory.matchingTotal > items.length && shown > 0 && shownTicked === shown && !memory.matching;
    p.offer.hidden = !(offerable || memory.matching);
    if (!p.offer.hidden) {
        const button = /** @type {HTMLButtonElement} */ (
            make(bar.ownerDocument, 'kp-button kp-button--ghost kp-button--sm kp-selection__take', 'button')
        );
        button.type = 'button';
        button.textContent = memory.matching ? strings.selectionOnlyShown(shown) : strings.selectionMatching(memory.matchingTotal);
        button.setAttribute('data-kp-selection-take', memory.matching ? 'off' : 'on');
        p.offer.replaceChildren(button);
    }

    // The actions: off, with their reason, for a selection they do not fit.
    const reasons = [];
    for (const button of /** @type {NodeListOf<HTMLElement>} */ (p.actions.querySelectorAll('[data-kp-selection-action]'))) {
        const id = button.getAttribute('data-kp-selection-action') ?? '';
        const reason = memory.busy ? '' : (memory.rules[id]?.(items) ?? '');
        const off = Boolean(memory.busy) || Boolean(reason);
        button.toggleAttribute('data-kp-selection-off', off);
        if (off) button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
        if (reason) {
            button.setAttribute('data-kp-disabled-reason', reason);
            button.title = reason;
            reasons.push(reason);
        } else {
            button.removeAttribute('data-kp-disabled-reason');
            if (button.title && button.hasAttribute('data-kp-selection-titled')) button.removeAttribute('title');
        }
        if (reason) button.setAttribute('data-kp-selection-titled', '');
    }
    p.result.hidden = reasons.length === 0 && !p.result.hasAttribute('data-kp-selection-result');
    if (reasons.length && !p.result.hasAttribute('data-kp-selection-result')) {
        p.result.textContent = reasons.join('. ');
        p.result.setAttribute('data-kp-selection-reasons', '');
    } else if (!reasons.length && p.result.hasAttribute('data-kp-selection-reasons')) {
        p.result.removeAttribute('data-kp-selection-reasons');
        p.result.textContent = '';
        p.result.hidden = true;
    }
    p.clear.disabled = Boolean(memory.busy);
}

/** @param {HTMLElement} bar @param {Memory} memory @param {string} text */
function say(bar, memory, text) {
    const live = /** @type {HTMLElement | null} */ (bar.querySelector(':scope > .kp-selection__live'));
    if (!live) return;
    const view = bar.ownerDocument.defaultView;
    view?.clearTimeout(memory.sayTimer);
    memory.sayTimer = view?.setTimeout(() => (live.textContent = text), SELECTION_SAY_MS) ?? 0;
}

/**
 * Unticks every box of the sources, the way a click would.
 * @param {Memory} memory
 */
function untick(memory) {
    for (const source of memory.sources) {
        const keys = rowSelect(source);
        if (keys) {
            keys.clear();
            continue;
        }
        for (const box of /** @type {NodeListOf<HTMLInputElement>} */ (source.querySelectorAll(BOX))) {
            if (!box.checked || box.disabled) continue;
            box.checked = false;
            box.dispatchEvent(new Event('change', { bubbles: true }));
        }
        for (const all of source.querySelectorAll('[data-kp-select-all]')) {
            const box = /** @type {HTMLInputElement} */ (all);
            box.checked = false;
            box.indeterminate = false;
        }
    }
}

/**
 * Draw the bar from what is selected now.
 * @param {HTMLElement} bar
 * @param {Memory} memory
 */
function sync(bar, memory) {
    const strings = getStrings();
    const before = memory.items;
    if (!memory.manual) {
        const read = readSources(memory);
        const dropped = before.filter((item) => !read.known.has(item.key)).length;
        memory.items = read.items;
        memory.known = read.known;
        if (dropped > 0) say(bar, memory, strings.selectionDropped(dropped));
        else if (read.items.length !== before.length)
            say(bar, memory, read.items.length === 0 ? strings.selectionCleared : strings.selectionCount(read.items.length));
        // Taking the offer holds only while every row shown is ticked.
        if (memory.matching && (read.shown === 0 || read.shownTicked < read.shown)) {
            memory.matching = false;
            bar.dispatchEvent(new CustomEvent(SELECTION_MATCHING_EVENT, { bubbles: true, detail: { matching: false, total: memory.matchingTotal } }));
        }
    }
    if (memory.items.length === 0) memory.namesOpen = false;
    const changed = before.length !== memory.items.length || before.some((item, i) => item.key !== memory.items[i]?.key);
    draw(bar, memory);
    if (changed) {
        // The marks of an earlier refusal belong to the selection that was.
        for (const mark of bar.ownerDocument.querySelectorAll('[data-kp-refused]')) {
            mark.removeAttribute('data-kp-refused');
            mark.querySelector(':scope .kp-selection__refusal')?.remove();
        }
        const result = bar.querySelector('.kp-selection__result');
        if (result?.hasAttribute('data-kp-selection-result')) {
            result.removeAttribute('data-kp-selection-result');
            result.textContent = '';
            /** @type {HTMLElement} */ (result).hidden = true;
        }
        bar.dispatchEvent(
            new CustomEvent(SELECTION_EVENT, {
                bubbles: true,
                detail: {
                    keys: memory.items.map((i) => i.key),
                    items: memory.items,
                    count: memory.matching ? memory.matchingTotal : memory.items.length,
                    matching: memory.matching,
                },
            }),
        );
    }
}

/**
 * @param {HTMLElement} bar
 * @param {SelectionOptions} options
 * @returns {() => void}
 */
function attachOne(bar, options) {
    if (MEMORY.has(bar)) return () => undefined;
    const doc = bar.ownerDocument;
    const placement = options.placement ?? bar.getAttribute('data-kp-placement') ?? 'sticky-top';
    bar.setAttribute('data-kp-placement', ['inline', 'floating-bottom'].includes(placement) ? placement : 'sticky-top');
    if (options.names) bar.setAttribute('data-kp-selection-names', options.names);
    if (options.maxNames) bar.setAttribute('data-kp-selection-max', String(options.maxNames));
    const matchingTotal = Number(options.matching ?? bar.getAttribute('data-kp-select-matching')) || 0;
    /** @type {Memory} */
    const memory = {
        sources: sourcesOf(bar),
        items: [],
        known: new Set(),
        manual: false,
        matchingTotal,
        matching: false,
        namesOpen: false,
        busy: '',
        progress: null,
        rules: {},
        sayTimer: 0,
        refresh: () => sync(bar, memory),
    };
    MEMORY.set(bar, memory);
    parts(bar, memory);

    // A page that changes the bar's options later is heard at once.
    const view0 = doc.defaultView;
    const optionWatch =
        view0 && 'MutationObserver' in view0
            ? new view0.MutationObserver(() => {
                  memory.matchingTotal = Number(bar.getAttribute('data-kp-select-matching')) || 0;
                  if (!memory.matchingTotal) memory.matching = false;
                  draw(bar, memory);
              })
            : null;
    optionWatch?.observe(bar, { attributes: true, attributeFilter: ['data-kp-selection-names', 'data-kp-selection-max', 'data-kp-select-matching'] });

    let queued = false;
    const refresh = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
            queued = false;
            sync(bar, memory);
        });
    };
    /** @param {Event} event */
    const onSourceEvent = (event) => {
        if (event.type === 'change' && !(event.target instanceof Element && event.target.matches(`${BOX}, [data-kp-select-all]`))) return;
        if (memory.manual) return;
        refresh();
    };
    for (const source of memory.sources) {
        source.addEventListener('change', onSourceEvent);
        source.addEventListener('kp-datatable-select', onSourceEvent);
        source.addEventListener('kp-rows-select', onSourceEvent);
    }
    // A refresh draws rows again: read them again.
    const view = doc.defaultView;
    const watchers = view && 'MutationObserver' in view ? memory.sources.map((s) => new view.MutationObserver(refresh)) : [];
    watchers.forEach((w, i) => w.observe(memory.sources[i], { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }));

    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('.kp-selection__clear')) {
            const keys = memory.items.map((i) => i.key);
            memory.matching = false;
            if (memory.manual) {
                memory.items = [];
                draw(bar, memory);
                bar.dispatchEvent(new CustomEvent(SELECTION_EVENT, { bubbles: true, detail: { keys: [], items: [], count: 0, matching: false } }));
            } else untick(memory);
            bar.dispatchEvent(new CustomEvent(SELECTION_CLEAR_EVENT, { bubbles: true, detail: { keys } }));
            return;
        }
        const more = target.closest('.kp-selection__more');
        if (more) {
            memory.namesOpen = !memory.namesOpen;
            draw(bar, memory);
            /** @type {HTMLElement | null} */ (bar.querySelector('.kp-selection__more'))?.focus();
            return;
        }
        const take = target.closest('[data-kp-selection-take]');
        if (take) {
            memory.matching = take.getAttribute('data-kp-selection-take') === 'on';
            draw(bar, memory);
            bar.dispatchEvent(
                new CustomEvent(SELECTION_MATCHING_EVENT, { bubbles: true, detail: { matching: memory.matching, total: memory.matchingTotal } }),
            );
            say(
                bar,
                memory,
                memory.matching ? getStrings().selectionMatchingOn(memory.matchingTotal) : getStrings().selectionCount(memory.items.length),
            );
            /** @type {HTMLElement | null} */ (bar.querySelector('.kp-selection__take'))?.focus();
            return;
        }
        const toggle = target.closest('.kp-selection__toggle');
        if (toggle) {
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(open));
            bar.toggleAttribute('data-kp-selection-open', open);
            return;
        }
        const button = /** @type {HTMLElement | null} */ (target.closest('[data-kp-selection-action]'));
        if (button) {
            if (button.getAttribute('aria-disabled') === 'true') {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            bar.dispatchEvent(
                new CustomEvent(SELECTION_ACTION_EVENT, {
                    bubbles: true,
                    cancelable: true,
                    detail: {
                        action: button.getAttribute('data-kp-selection-action') ?? '',
                        button,
                        keys: memory.items.map((i) => i.key),
                        items: memory.items,
                        matching: memory.matching,
                        undoMs: Number(bar.getAttribute('data-kp-undo-ms') ?? 6000),
                    },
                }),
            );
        }
    };
    /** Esc unticks all while the focus is in the bar or its list. @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented || memory.items.length === 0 || memory.busy) return;
        const target = event.target instanceof Node ? event.target : null;
        const inside = target !== null && (bar.contains(target) || memory.sources.some((s) => s.contains(target)));
        if (!inside || (target instanceof Element && target.closest('input:not([data-kp-select-row]), textarea, select, dialog[open]'))) return;
        // The row keys (js/row-select.js) handle Esc inside a list themselves.
        if (target instanceof Element && memory.sources.some((s) => rowSelect(s) && s.contains(target))) return;
        event.preventDefault();
        bar.querySelector('.kp-selection__clear')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    bar.addEventListener('click', onClick);
    doc.addEventListener('keydown', onKey);
    sync(bar, memory);
    return () => {
        bar.removeEventListener('click', onClick);
        doc.removeEventListener('keydown', onKey);
        for (const source of memory.sources) {
            source.removeEventListener('change', onSourceEvent);
            source.removeEventListener('kp-datatable-select', onSourceEvent);
            source.removeEventListener('kp-rows-select', onSourceEvent);
        }
        watchers.forEach((w) => w.disconnect());
        optionWatch?.disconnect();
        MEMORY.delete(bar);
    };
}

/**
 * Give every selection bar under `root` its parts and its source.
 * @param {ParentNode} [root]
 * @param {SelectionOptions} [options]
 * @returns {() => void} detach
 */
export function attachSelectionBars(root = document, options = {}) {
    const bars = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(SELECTION) ? [root] : []),
        ...root.querySelectorAll(SELECTION),
    ]);
    const undo = bars.map((bar) => attachOne(bar, options));
    return () => undo.forEach((u) => u());
}

/**
 * Feed the bar by hand, for a list that has no boxes to read (a board, a server's selection). The bar then ignores the boxes.
 * @param {HTMLElement} bar
 * @param {readonly (string | SelectionItem)[]} items the keys, or keys with the names to show
 * @param {{ matching?: number }} [options] `matching`: how many rows match in all, for the offer beyond these
 */
export function setSelection(bar, items, options = {}) {
    const memory = MEMORY.get(bar);
    if (!memory) return;
    memory.manual = true;
    if (options.matching !== undefined) memory.matchingTotal = options.matching;
    memory.items = items.map((i) => (typeof i === 'string' ? { key: i, label: i } : i));
    sync(bar, memory);
}

/**
 * What the bar holds now.
 * @param {HTMLElement} bar
 * @returns {{ keys: string[], items: SelectionItem[], count: number, matching: boolean }}
 */
export function getSelection(bar) {
    const memory = MEMORY.get(bar);
    if (!memory) return { keys: [], items: [], count: 0, matching: false };
    return {
        keys: memory.items.map((i) => i.key),
        items: memory.items,
        count: memory.matching ? memory.matchingTotal : memory.items.length,
        matching: memory.matching,
    };
}

/**
 * Say an action is running ("Backing up 3…"), or that it is done (no words). The buttons stop answering, the count gives way to the words in its own room.
 * @param {HTMLElement} bar
 * @param {string | null} [words] `null` or an empty string ends it
 */
export function setSelectionBusy(bar, words = '') {
    const memory = MEMORY.get(bar);
    if (!memory) return;
    memory.busy = words ? words : '';
    memory.progress = null;
    const live = bar.querySelector(':scope > .kp-selection__live');
    if (live && memory.busy) live.textContent = memory.busy;
    draw(bar, memory);
}

/**
 * Say how far a running action is, between its start and its end: "3 of 7 done" beside the busy words [wish-1120, homelab 112].
 * Call it after setSelectionBusy(); on a bar that is not busy it starts the busy state with the package's own words. The end is
 * still setSelectionBusy(bar, '') or setSelectionResult(), which take the progress away. A screen reader hears every quarter
 * (and the last) from the polite region, not every row. `done` is clamped to 0..`total`.
 * @param {HTMLElement} bar
 * @param {{ done: number, total: number }} progress
 */
export function setSelectionProgress(bar, progress) {
    const memory = MEMORY.get(bar);
    if (!memory) return;
    const total = Math.max(0, Math.floor(progress.total));
    const done = Math.min(total, Math.max(0, Math.floor(progress.done)));
    const before = memory.progress;
    if (!memory.busy) memory.busy = getStrings().selectionBusy('');
    memory.progress = { done, total };
    const quarter = (/** @type {number} */ n) => (total > 0 ? Math.floor((n / total) * 4) : 0);
    const live = bar.querySelector(':scope > .kp-selection__live');
    if (live && (!before || quarter(done) > quarter(before.done) || done === total)) live.textContent = getStrings().selectionProgress(done, total);
    draw(bar, memory);
}

/**
 * Say how an action ended when some rows refused it: "2 done, 1 refused: why", with a mark on each refused row.
 * @param {HTMLElement} bar
 * @param {{ done: number, refused: readonly { key: string, reason: string }[] }} result
 */
export function setSelectionResult(bar, result) {
    const memory = MEMORY.get(bar);
    if (!memory) return;
    const strings = getStrings();
    memory.busy = '';
    memory.progress = null;
    draw(bar, memory);
    const p = parts(bar, memory);
    const why = [...new Set(result.refused.map((r) => r.reason))].join('; ');
    p.result.textContent = result.refused.length
        ? `${strings.selectionResult(result.done, result.refused.length)}: ${why}`
        : strings.selectionResult(result.done, 0);
    p.result.removeAttribute('data-kp-selection-reasons');
    p.result.setAttribute('data-kp-selection-result', result.refused.length ? 'refused' : 'done');
    p.result.hidden = false;
    for (const source of memory.sources) {
        let index = 0;
        for (const box of source.querySelectorAll(BOX)) {
            const row = rowOf(box);
            if (!row) continue;
            const refusal = result.refused.find((r) => r.key === keyOf(row, index++));
            if (!refusal) continue;
            row.setAttribute('data-kp-refused', refusal.reason);
            if (!row.querySelector('.kp-selection__refusal')) {
                const note = row.ownerDocument.createElement('small');
                note.className = 'kp-selection__refusal';
                note.textContent = refusal.reason;
                const cell = row.matches('tr') ? (row.querySelector(':scope > th, :scope > td:nth-child(2)') ?? row.lastElementChild) : row;
                cell?.append(note);
            }
        }
    }
    const live = bar.querySelector(':scope > .kp-selection__live');
    if (live) live.textContent = p.result.textContent;
}

/**
 * Turn an action off, with the reason, for a selection it does not fit: the function answers the reason ("2 of 3 can be updated") or an empty string.
 * @param {HTMLElement} bar
 * @param {Record<string, (items: SelectionItem[]) => string | null>} rules by the action's id (`data-kp-selection-action`)
 */
export function setSelectionRules(bar, rules) {
    const memory = MEMORY.get(bar);
    if (!memory) return;
    memory.rules = rules;
    draw(bar, memory);
}
