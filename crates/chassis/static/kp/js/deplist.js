// The dependency list: rows "A → B" that say what needs what, numbered in the order things must go [kpadopt6-ops; homelab's
// "who notices this app" rows, `uf-dep`, `whoNotices` in js/updateflow.js].
//
//   <div class="kp-deplist" data-kp-deplist data-kp-dep-link="/stacks/{name}"></div>
//   setDeplist(el, [{ from: 'paperless', to: 'postgres' }, { from: 'paperless', to: 'redis', state: 'stopped' }]);
//
// A small list a reader can scan, which a graph (a picture) and a step list (progress) are not. Each row is one fixed grid:
// the number, the thing that needs, the arrow, the thing needed, and its state, in the same columns in every row and every
// state, so a name never sits under a neighbour's shorter number. Each name carries the package's identity mark. Options, as
// attributes on the list and as the third argument of setDeplist():
//
//   data-kp-dep-order        `numbers` (default: rows stand in the order things must go, numbered 1, 2, 3 …; Kenny,
//                            2026-10-17: "Ja, met nummers") or `none` (the order given)
//   data-kp-dep-direction    `from-needs-to` (default: "paperless needs postgres") or `from-reaches-to`
//   data-kp-dep-group        `none` (default), `by-to` or `by-from`: rows grouped under a heading (with numbers the rows follow
//                            one order, so grouping stays off)
//   data-kp-dep-arrow        the arrow's glyph (default →)
//   data-kp-dep-states       a state beside each needed thing, in words and a tone (running, stopped, unknown)
//   data-kp-dep-collapse     past this many rows the first show with "Show all 23" (default 8; the number is exact)
//   data-kp-dep-link         a template for each name's own page, `{name}` for the name
//   data-kp-dep-self         `hide` (default: a thing never lists itself) or `show`
//   data-kp-dep-empty        the sentence for a list with nothing in it
//   data-kp-dep-heading      the heading, `{n}` for the exact count ("{n} stacks reach these apps"); default a count
//   data-kp-dep-copy         a button that copies the rows as text ("paperless -> postgres")
//   data-kp-dep-rows         the least rows the list stands as high as, for its states (default 3)
//
// A cycle (paperless needs redis needs paperless) is never looped: it is one destructive row at the top, unnumbered, naming
// each thing in it. Loading is the busy card over placeholder rows, empty the package's empty plate (nothing is wrong: no
// action), failed the failed plate with a normal Retry (`kp-deplist-retry`), each filling the height the list has with rows.
// Nothing runs on import.

import { setIdmark } from './idmark.js';
import { getStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';
import { statePlate } from './state-plate.js';
import { runFlashButton } from './flash.js';

/** The lists this module draws. */
export const DEPLIST = '[data-kp-deplist]';
/** Fired on the list when its Retry is pressed. */
export const DEPLIST_RETRY_EVENT = 'kp-deplist-retry';
/** How many rows show before "Show all". */
export const DEPLIST_COLLAPSE = 8;

/**
 * @typedef {object} DepItem
 * @property {string} from the thing that needs
 * @property {string} to the thing needed
 * @property {string} [label] a word for the link between them
 * @property {'running' | 'stopped' | 'unknown'} [state] the state of the needed thing
 */

/**
 * @typedef {object} DepRow
 * @property {DepItem} item
 * @property {number | null} number its place in the order things must go (null when unnumbered)
 */

/**
 * The rows in the order things must go: a row stands after the rows of the things it needs (a thing's depth is one more than the
 * deepest thing it needs that is itself listed as needing something), numbered from 1. Rows in a cycle are not ordered: they
 * come back as `cycles`, each a path of names.
 *
 * @param {readonly DepItem[]} items
 * @param {{ numbers?: boolean }} [options]
 * @returns {{ rows: DepRow[], cycles: string[][] }}
 */
export function orderDependencies(items, { numbers = true } = {}) {
    /** @type {Map<string, string[]>} */
    const needs = new Map();
    for (const { from, to } of items) needs.set(from, [...(needs.get(from) ?? []), to]);
    /** @type {Map<string, number>} */
    const depth = new Map();
    /** @type {Set<string>} */
    const onPath = new Set();
    /** @type {Set<string>} */
    const inCycle = new Set();
    /** @type {string[][]} */
    const cycles = [];
    /** @param {string} name @param {string[]} path @returns {number} */
    const walk = (name, path) => {
        if (depth.has(name)) return /** @type {number} */ (depth.get(name));
        if (onPath.has(name)) {
            const loop = path.slice(path.indexOf(name));
            if (!loop.some((n) => inCycle.has(n))) cycles.push(loop);
            for (const n of loop) inCycle.add(n);
            return 0;
        }
        onPath.add(name);
        let deepest = -1;
        for (const to of needs.get(name) ?? []) deepest = Math.max(deepest, needs.has(to) ? walk(to, [...path, name]) : -1);
        onPath.delete(name);
        depth.set(name, deepest + 1);
        return deepest + 1;
    };
    for (const name of needs.keys()) walk(name, []);
    const whole = items.map((item, at) => ({ item, at, d: depth.get(item.from) ?? 0, cyc: inCycle.has(item.from) && inCycle.has(item.to) }));
    const ordered = whole.filter((r) => !r.cyc);
    if (numbers) ordered.sort((a, b) => a.d - b.d || a.at - b.at);
    return { rows: ordered.map((r, i) => ({ item: r.item, number: numbers ? i + 1 : null })), cycles };
}

/** The rows as plain text, one per line: "paperless -> postgres". @param {readonly DepItem[]} items */
export const depText = (items) => items.map((i) => `${i.from} -> ${i.to}`).join('\n');

/**
 * @typedef {object} DeplistHandle
 * @property {HTMLElement} element
 * @property {(items: readonly DepItem[]) => void} set draw the rows (clears any state)
 * @property {(state: 'ready' | 'loading' | 'empty' | 'error', options?: { message?: string }) => void} setState
 * @property {() => DepRow[]} rows the rows as drawn
 */

/** @type {WeakMap<Element, DeplistHandle>} */
const HANDLES = new WeakMap();

/**
 * The handle of a list.
 * @param {Element} el
 * @returns {DeplistHandle | null}
 */
export function deplist(el) {
    return HANDLES.get(el) ?? null;
}

/** @param {Document} doc @param {string} tag @param {string} className */
const made = (doc, tag, className) => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
};

/**
 * @param {HTMLElement} el
 * @returns {() => void}
 */
function attachOne(el) {
    if (HANDLES.has(el)) return () => undefined;
    const doc = el.ownerDocument;
    /** @type {(() => void)[]} */
    const undo = [];
    el.classList.add('kp-deplist');
    el.setAttribute('role', 'group');
    undo.push(() => el.classList.remove('kp-deplist'));

    const heading = made(doc, 'p', 'kp-deplist__heading');
    heading.setAttribute('aria-live', 'polite');
    const body = made(doc, 'div', 'kp-deplist__body');
    const list = made(doc, 'ol', 'kp-deplist__list');
    list.setAttribute('role', 'list');
    const foot = made(doc, 'div', 'kp-deplist__foot');
    body.append(list);
    el.replaceChildren(heading, body, foot);
    undo.push(() => el.replaceChildren());

    /** @type {readonly DepItem[]} */
    let items = [];
    /** @type {'ready' | 'loading' | 'empty' | 'error'} */
    let state = 'ready';
    let stateMessage = '';
    let expanded = false;
    /** @type {DepRow[]} */
    let drawn = [];
    /** @type {import('./busy-card.js').BusyCard | null} */
    let busy = null;
    /** @type {HTMLElement | null} */
    let plate = null;

    const attr = (/** @type {string} */ name, /** @type {string} */ fallback) => el.getAttribute(name) ?? fallback;

    /** @param {string} name @param {boolean} [needed] */
    const nameNode = (name, needed = false) => {
        const link = el.getAttribute('data-kp-dep-link');
        const holder = link ? made(doc, 'a', 'kp-deplist__name') : made(doc, 'span', 'kp-deplist__name');
        if (needed) holder.classList.add('kp-deplist__name--to');
        if (holder instanceof HTMLAnchorElement && link) holder.href = link.replace('{name}', encodeURIComponent(name));
        const mark = made(doc, 'span', 'kp-idmark kp-idmark--xs');
        setIdmark(mark, name);
        holder.append(mark, made(doc, 'span', 'kp-deplist__text'));
        /** @type {HTMLElement} */ (holder.lastElementChild).textContent = name;
        return holder;
    };

    const draw = () => {
        const s = getStrings();
        const numbers = attr('data-kp-dep-order', 'numbers') !== 'none';
        const self = attr('data-kp-dep-self', 'hide') === 'show';
        const reaches = attr('data-kp-dep-direction', 'from-needs-to') === 'from-reaches-to';
        const arrow = attr('data-kp-dep-arrow', '→');
        const withStates = el.hasAttribute('data-kp-dep-states');
        const collapse = Math.max(1, Number(attr('data-kp-dep-collapse', String(DEPLIST_COLLAPSE))) || DEPLIST_COLLAPSE);
        const group = numbers ? 'none' : attr('data-kp-dep-group', 'none');
        const shown = items.filter((i) => self || i.from !== i.to);
        const { rows, cycles } = orderDependencies(shown, { numbers });
        drawn = rows;
        let total = rows.length + cycles.length;

        // The heading is the exact count, whatever is folded.
        const template = el.getAttribute('data-kp-dep-heading');
        heading.textContent =
            state === 'ready' || state === 'empty' ? (template ? template.replace('{n}', String(total)) : s.deplistCount(total)) : s.deplistReading;

        list.replaceChildren();
        list.removeAttribute('aria-busy');
        busy?.remove();
        busy = null;
        plate?.remove();
        plate = null;
        list.hidden = false;
        if (list.parentElement !== body) body.append(list);
        list.dataset.kpCols = numbers ? 'numbered' : 'plain';
        el.style.setProperty('--kp-deplist-arrow', `'${arrow.replace(/'/g, '')}'`);
        foot.replaceChildren();
        el.setAttribute('data-kp-state', state);
        body.style.removeProperty('min-block-size');
        el.style.setProperty('--kp-deplist-min-rows', String(Math.max(1, Number(attr('data-kp-dep-rows', '3')) || 3)));

        /** @param {DepItem} item @param {number | null} no */
        const rowFor = (item, no) => {
            const li = made(doc, 'li', 'kp-deplist__row');
            if (numbers) {
                const n = made(doc, 'span', 'kp-deplist__no');
                n.textContent = no === null ? '' : String(no);
                li.append(n);
            }
            const arrowNode = made(doc, 'span', 'kp-deplist__arrow');
            arrowNode.setAttribute('aria-hidden', 'true');
            arrowNode.textContent = arrow;
            li.append(nameNode(item.from), arrowNode, nameNode(item.to, true));
            if (withStates) {
                const word = item.state === 'running' ? s.deplistRunning : item.state === 'stopped' ? s.deplistStopped : s.deplistUnknown;
                const badge = made(
                    doc,
                    'span',
                    `kp-badge kp-deplist__state${item.state === 'running' ? ' kp-badge--success' : item.state === 'stopped' ? ' kp-badge--destructive' : ''}`,
                );
                badge.textContent = word;
                li.append(badge);
            }
            const spoken = made(doc, 'span', 'kp-sr-only');
            spoken.textContent = `, ${reaches ? s.deplistReaches(item.from, item.to) : s.deplistNeeds(item.from, item.to)}`;
            li.append(spoken);
            if (item.label) li.title = item.label;
            return li;
        };

        if (state === 'loading') {
            list.setAttribute('aria-busy', 'true');
            for (let i = 0; i < 3; i++) {
                const ghost = made(doc, 'li', 'kp-deplist__row kp-deplist__row--ghost');
                ghost.setAttribute('aria-hidden', 'true');
                ghost.append(made(doc, 'span', 'kp-skeleton kp-deplist__bone'));
                list.append(ghost);
            }
            busy = openBusyCard(body, { words: s.deplistLoading, area: () => [body], className: 'kp-deplist__busy', arrive: true });
            return;
        }
        if (state === 'error') {
            plate = statePlate(doc, {
                kind: 'error',
                title: s.deplistFailed,
                text: stateMessage || s.deplistFailedText,
                actionLabel: s.deplistRetry,
                onAction: () => el.dispatchEvent(new CustomEvent(DEPLIST_RETRY_EVENT, { bubbles: true })),
            });
            body.prepend(plate);
            list.hidden = true;
            return;
        }
        list.hidden = false;
        if (total === 0 || state === 'empty') {
            plate = statePlate(doc, { kind: 'empty', title: el.getAttribute('data-kp-dep-empty') ?? s.deplistEmpty });
            body.prepend(plate);
            list.hidden = true;
            return;
        }

        for (const cycle of cycles) {
            const li = made(doc, 'li', 'kp-deplist__row kp-deplist__row--cycle');
            const alert = made(doc, 'span', 'kp-alert kp-alert--destructive kp-deplist__cycle');
            alert.setAttribute('role', 'alert');
            for (const [i, name] of [...cycle, cycle[0]].entries()) {
                if (i > 0) alert.append(' ', s.deplistNeedsWord, ' ');
                alert.append(nameNode(name));
            }
            li.append(alert);
            list.append(li);
        }
        /** @type {string | null} */
        let current = null;
        /** @type {HTMLElement[]} */
        const rowEls = [];
        const grouped =
            group === 'by-to' || group === 'by-from'
                ? [...rows].sort((a, b) => (group === 'by-to' ? a.item.to : a.item.from).localeCompare(group === 'by-to' ? b.item.to : b.item.from))
                : rows;
        for (const row of grouped) {
            if (group !== 'none') {
                const key = group === 'by-to' ? row.item.to : row.item.from;
                if (key !== current) {
                    current = key;
                    const head = made(doc, 'li', 'kp-deplist__group');
                    head.setAttribute('role', 'presentation');
                    head.append(nameNode(key));
                    list.append(head);
                }
            }
            const li = rowFor(row.item, row.number);
            rowEls.push(li);
            list.append(li);
        }
        // Past the fold the first rows show with an exact "Show all 23".
        const folded = rowEls.length > collapse && !expanded;
        rowEls.forEach((li, i) => (li.hidden = folded && i >= collapse));
        if (rowEls.length > collapse) {
            const more = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--ghost kp-deplist__more'));
            more.type = 'button';
            more.setAttribute('aria-expanded', String(!folded));
            more.textContent = folded ? s.deplistMore(rowEls.length) : s.deplistFewer;
            more.addEventListener('click', () => {
                expanded = !expanded;
                draw();
                /** @type {HTMLElement | null} */ (el.querySelector('.kp-deplist__more'))?.focus();
            });
            foot.append(more);
        }
        if (el.hasAttribute('data-kp-dep-copy')) {
            const copy = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--ghost kp-deplist__copy'));
            copy.type = 'button';
            copy.textContent = s.deplistCopy;
            copy.setAttribute('data-kp-flash-words', s.deplistCopied);
            copy.addEventListener('click', () => {
                void runFlashButton(copy, async () => {
                    await navigator.clipboard.writeText(depText(rows.map((r) => r.item)));
                    return s.deplistCopied;
                });
            });
            foot.append(copy);
        }
    };

    // The height the list has with its rows is kept for the states that stand in for them.
    /** @param {'ready' | 'loading' | 'empty' | 'error'} next */
    const go = (next) => {
        if (state === 'ready' && next !== 'ready' && list.offsetHeight > 0) body.dataset.kpKeep = String(list.offsetHeight);
        state = next;
        draw();
        if (state !== 'ready' && state !== 'loading' && body.dataset.kpKeep) body.style.setProperty('min-block-size', `${body.dataset.kpKeep}px`);
        if (state === 'loading' && body.dataset.kpKeep) body.style.setProperty('min-block-size', `${body.dataset.kpKeep}px`);
    };

    /** @type {DeplistHandle} */
    const handle = {
        element: el,
        set(next) {
            items = next;
            state = 'ready';
            delete body.dataset.kpKeep;
            draw();
        },
        setState(next, options = {}) {
            stateMessage = options.message ?? '';
            go(next);
        },
        rows: () => drawn,
    };
    HANDLES.set(el, handle);
    undo.push(() => {
        busy?.remove();
        HANDLES.delete(el);
    });
    const watch = new MutationObserver(() => draw());
    watch.observe(el, {
        attributes: true,
        attributeFilter: [
            'data-kp-dep-order',
            'data-kp-dep-direction',
            'data-kp-dep-group',
            'data-kp-dep-arrow',
            'data-kp-dep-states',
            'data-kp-dep-collapse',
            'data-kp-dep-link',
            'data-kp-dep-self',
            'data-kp-dep-empty',
            'data-kp-dep-heading',
            'data-kp-dep-copy',
            'data-kp-dep-rows',
        ],
    });
    undo.push(() => watch.disconnect());
    draw();
    return () => undo.reverse().forEach((u) => u());
}

/**
 * Give every dependency list under `root` its rows and its states; fill one with `setDeplist` or the handle.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDeplists(root = document) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(DEPLIST) ? [root] : []),
        ...root.querySelectorAll(DEPLIST),
    ]);
    const undo = found.map((el) => attachOne(el));
    return () => undo.forEach((u) => u());
}

/**
 * Draw the rows of a list (attaching it first when it was not yet).
 * @param {HTMLElement} el
 * @param {readonly DepItem[]} items
 */
export function setDeplist(el, items) {
    if (!HANDLES.has(el)) attachOne(el);
    HANDLES.get(el)?.set(items);
}
