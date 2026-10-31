// The selection bar's selector, events and numbers, its memory's shape, and reading the rows it serves: their keys, their
// names and which are ticked.

/** The bars this module looks after. */
export const SELECTION = '[data-kp-selection]';
/** The boxes it reads. */
export const BOX = '[data-kp-select-row]';
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

/** @typedef {import('../selection-bar.js').SelectionItem} SelectionItem */

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

/** @param {Document} doc @param {string} className @param {string} [tag] */
export const make = (doc, className, tag = 'div') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/** @param {HTMLElement} row */
export const labelOf = (row) => {
    const box = row.querySelector(BOX);
    const named = row.dataset.kpRowLabel ?? box?.getAttribute('aria-label')?.replace(/^select\s+/i, '');
    return (named ?? row.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
};
/** @param {Element} box @returns {HTMLElement | null} */
export const rowOf = (box) => /** @type {HTMLElement | null} */ (box.closest('[data-kp-row-key], tr, li, [role="row"]'));
/** @param {HTMLElement} row @param {number} index */
export const keyOf = (row, index) =>
    row.dataset.kpRowKey ?? (row.id || /** @type {HTMLInputElement | null} */ (row.querySelector(BOX))?.value || `row-${index}`);

/**
 * The elements a bar serves.
 * @param {HTMLElement} bar
 * @returns {HTMLElement[]}
 */
export function sourcesOf(bar) {
    const doc = bar.ownerDocument;
    const named = (bar.getAttribute('data-kp-selection-for') ?? '').split(/\s+/).filter(Boolean);
    if (named.length) return /** @type {HTMLElement[]} */ (named.map((id) => doc.getElementById(id)).filter((el) => el !== null));
    // The nearest: the first ancestor that holds select boxes.
    for (let up = bar.parentElement; up; up = up.parentElement) if (up.querySelector(BOX)) return [up];
    return [];
}

/** Whether `row` is on the page and not folded away by a filter. @param {HTMLElement} row */
export const shownRow = (row) => !row.hidden && !row.closest('[hidden]');

/**
 * Read what is ticked in the sources.
 * @param {Memory} memory
 */
export function readSources(memory) {
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

