// The picked column and the lit rows of a heat grid.
import { LIT } from './grid-state.js';

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
