// A row that leaves the theme's way, the focus moving to its neighbour first.

import { ROW_ACTIONS } from './values.js';

/** The element the focus goes to when its row leaves: the same place in the next row, else the row before, else the list. @param {HTMLElement} list @param {HTMLElement} row @param {Element} active */
function heirOf(list, row, active) {
    const rows = /** @type {HTMLElement[]} */ ([...list.children]).filter((r) => r !== row && !r.hidden && !r.classList.contains('kp-action-list__group'));
    const at = [...list.children].indexOf(row);
    const next = rows.find((r) => [...list.children].indexOf(r) > at) ?? rows.reverse().find((r) => [...list.children].indexOf(r) < at) ?? null;
    const place = [...row.querySelectorAll(`${ROW_ACTIONS} > *`)].indexOf(active);
    return next ? (/** @type {HTMLElement | undefined} */ (next.querySelectorAll(`${ROW_ACTIONS} > *`)[place]) ?? next) : list;
}

/**
 * Let a row leave the theme's way and take it out (js/motion.js leave(); at
 * once under reduced motion). When the focus is in it, the focus goes first
 * to the same place in the next row (the button at the same position, or the
 * row itself), else the row before, else the list.
 * @param {HTMLElement} row
 * @returns {Promise<void>} settled once it is gone
 */
export async function removeRow(row) {
    const list = row.parentElement;
    const active = row.ownerDocument.activeElement;
    if (list && active instanceof HTMLElement && row.contains(active)) {
        const into = heirOf(list, row, active);
        if (!into.matches('a[href], button, input, select, textarea, [tabindex]')) into.tabIndex = -1;
        into.focus({ preventScroll: true });
    }
    row.setAttribute('aria-hidden', 'true');
    const { leave } = await import('../motion.js');
    await leave(row);
}
