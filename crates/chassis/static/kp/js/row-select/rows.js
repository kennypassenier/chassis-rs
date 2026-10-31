// The selector, event names and numbers of the row keys, and the pure helpers that find rows, boxes, keys and labels.

/** An element that gets the keys whether or not it is a data table. */
export const ROW_SELECT = '[data-kp-select-keys]';
/** A data table that carries a select column gets them too. */
export const ROW_SELECT_AUTO = '[data-kp-datatable]:has([data-kp-select-row])';
/** The boxes this module sets. */
export const SELECT_BOX = '[data-kp-select-row]';
/** Fired on the element after this module changed the ticks: `{ keys, count, source, skipped }`. */
export const ROW_SELECT_EVENT = 'kp-rows-select';
/** Fired on a row when Enter is pressed on the row itself, the event js/actions.js' row keys fire too: `{ row }`. */
export const ROW_OPEN_EVENT = 'kp-row-open';
/** The cursor row. */
export const CURSOR_CLASS = 'is-cursor';
/** How long a finger rests on a row before selection mode starts [ms]. */
export const LONG_PRESS_MS = 500;

/** What counts as a row around a box. */
export const ROW_LIKE = '[data-kp-row-key], tr, li, [role="row"]';
/** Controls a tap in selection mode leaves alone. */
export const CONTROLS = 'a, button, input, select, textarea';
/** The longest row label the voice reads [characters]. */
const LABEL_MAX = 60;

/** An option that is on unless the attribute says `false` (Kenny, 2026-10-17: the arrows walk and Ctrl+A ticks, by default). @param {Element} el @param {string} name */
export const onByDefault = (el, name) => el.getAttribute(name) !== 'false';

/** Every box of the element in document order. @param {Element} el @returns {HTMLInputElement[]} */
export const boxesOf = (el) => /** @type {HTMLInputElement[]} */ ([...el.querySelectorAll(SELECT_BOX)]).filter((b) => b instanceof HTMLInputElement);

/** The row a box belongs to. @param {Element} box @returns {HTMLElement | null} */
export const rowOf = (box) => /** @type {HTMLElement | null} */ (box.closest(ROW_LIKE));

/** A row's own box. @param {HTMLElement} row @returns {HTMLInputElement | null} */
export const boxOf = (row) => /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_BOX));

/** A row's key: its `data-kp-row-key`, else its id, else its box's value, else its place. @param {HTMLElement} row @param {number} index */
export const keyOfRow = (row, index) => row.dataset.kpRowKey ?? (row.id || boxOf(row)?.value || `row-${index}`);

/** What the voice calls a row. @param {HTMLElement} row */
export const labelOfRow = (row) => {
    const box = row.querySelector(SELECT_BOX);
    const named = row.dataset.kpRowLabel ?? box?.getAttribute('aria-label')?.replace(/^select\s+/i, '');
    return (named ?? row.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, LABEL_MAX);
};

/** A row the walk may land on: in the page and not hidden by a filter or a page. @param {HTMLElement} row */
export const shown = (row) => !row.hidden && !row.closest('[hidden]');

/** A box a tick may reach. @param {HTMLInputElement} box */
export const tickable = (box) => !box.disabled && box.getAttribute('aria-disabled') !== 'true';

/** Mark a row as the cursor, or as not the cursor. @param {HTMLElement} row @param {boolean} on */
export function markCursor(row, on) {
    row.classList.toggle(CURSOR_CLASS, on);
    if (on) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
}
