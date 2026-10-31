// Drawing a selection bar from its memory: its parts made once, the count, the names, the offer for all matching rows,
// the actions and their rules; saying the count; unticking; and syncing the memory with the rows.

import { rowSelect } from '../row-select.js';
import { getStrings } from '../strings.js';
import { BOX, SELECTION_EVENT, SELECTION_MATCHING_EVENT, SELECTION_NAMES, SELECTION_SAY_MS, make, readSources } from './model.js';

/** @typedef {import('./model.js').Memory} Memory */
/** @typedef {import('./model.js').SelectionItem} SelectionItem */

/** @param {HTMLElement} bar @param {Memory} memory */
export function parts(bar, memory) {
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
export function draw(bar, memory) {
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
export function say(bar, memory, text) {
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
export function untick(memory) {
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
export function sync(bar, memory) {
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

