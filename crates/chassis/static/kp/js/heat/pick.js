// The picked column and the lit rows of a heat grid.
import { HEAT_PICK_EVENT } from './constants.js';
import { LIT, STOPS } from './grid-state.js';

/**
 * Pick a column (or none, with `null`) without an event: the cells and the
 * axis name of that column are marked `data-kp-picked`.
 * @param {HTMLElement} el
 * @param {string | null} key
 */
export function setHeatPick(el, key) {
    if (key == null) el.removeAttribute('data-kp-heat-picked');
    else el.setAttribute('data-kp-heat-picked', key);
    for (const node of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('[data-col-key]'))) {
        const on = key != null && node.dataset.colKey === key;
        node.toggleAttribute('data-kp-picked', on);
        if (node.matches('.kp-heat__cell')) {
            if (on) node.setAttribute('aria-selected', 'true');
            else node.removeAttribute('aria-selected');
        }
    }
}

/**
 * Press the labels of these rows (and unpress the rest) without an event.
 * @param {HTMLElement} el
 * @param {readonly string[]} keys
 */
export function setHeatRows(el, keys) {
    const set = new Set(keys);
    LIT.set(el, set);
    for (const button of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('.kp-heat__label-button'))) {
        button.setAttribute('aria-pressed', String(set.has(button.dataset.key ?? '')));
    }
}

/**
 * Press a cell: it holds the tab stop, its column is picked (or dropped, pressed again) unless the page owns the grid, and
 * `kp-heat-pick` tells the page. A press on the cell itself and a day chosen in its row's list of days are one press
 * [heatstates-1102]; `source` says which (`days` for the list, absent for the cell).
 * @param {HTMLElement} el the grid @param {HTMLElement} cell @param {string} [source]
 */
export function pressCell(el, cell, source) {
    STOPS.set(el, { r: Number(cell.dataset.r), c: Number(cell.dataset.c) });
    const key = cell.dataset.colKey ?? '';
    const already = el.getAttribute('data-kp-heat-picked') === key;
    if (!el.hasAttribute('data-kp-heat-owned')) setHeatPick(el, already ? null : key);
    const detail = { rowKey: cell.dataset.rowKey, colKey: key, cell, picked: !already, ...(source ? { source } : {}) };
    el.dispatchEvent(new CustomEvent(HEAT_PICK_EVENT, { bubbles: true, detail }));
}
