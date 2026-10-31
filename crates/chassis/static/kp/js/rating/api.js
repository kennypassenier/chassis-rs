// The calls a page makes on a rating: attach, read its handle, set it, set its state, and draw one in a table cell.

import { attachAll, controllerOf } from '../controller.js';
import { RATING, DISPLAY_STEP, DEFAULT_STARS } from './constants.js';
import { RatingController } from './controller.js';
import { make } from './build.js';
import { focusStar } from './commit.js';
import { snapRating } from './math.js';
import { paint } from './paint.js';

/**
 * Draw and wire every rating under `root`.
 * @param {ParentNode} [root]
 * @param {import('./constants.js').RatingOptions} [options] defaults; each element's own `data-kp-rating-*` wins
 * @returns {() => void} detach
 */
export const attachRatings = (root = document, options = {}) => attachAll(root, RATING, RatingController, options);

/**
 * The handle of an attached rating.
 * @param {Element} element
 * @returns {import('./constants.js').RatingHandle | null}
 */
export function rating(element) {
    const m = controllerOf(/** @type {HTMLElement} */ (element), RatingController);
    if (!m) return null;
    return {
        element: m.el,
        value: () => m.value,
        set: (value) => setRating(m.el, value),
        setState: (next) => setRatingState(m.el, next),
        focus: () => focusStar(m),
    };
}

/**
 * Set the value from a script, without the event (the page read it from somewhere).
 * @param {Element} element @param {number} value 0 clears
 */
export function setRating(element, value) {
    const m = controllerOf(/** @type {HTMLElement} */ (element), RatingController);
    if (!m) return;
    m.value = m.draft = snapRating(value, m.max, m.valueStep);
    m.el.setAttribute('data-kp-rating-value', String(m.value));
    paint(m);
}

/**
 * The state: `loading` (dashed stars that pulse, the row's size kept), `error` (the stars replaced at the same size by
 * "Could not read the rating" and Retry), `ready`.
 * @param {Element} element @param {'ready' | 'loading' | 'error'} next
 */
export function setRatingState(element, next) {
    if (!(element instanceof HTMLElement)) return;
    if (next === 'ready') element.removeAttribute('data-kp-state');
    else element.setAttribute('data-kp-state', next);
}

/**
 * A rating inside a data table cell: the display row, and the number the table sorts and filters the cell by.
 * @param {HTMLElement} cell the `td` (or any element inside one)
 * @param {number} value 0 is not rated
 * @param {{ max?: number, count?: number, for?: string }} [options]
 * @returns {HTMLElement} the rating element
 */
export function ratingCell(cell, value, { max = DEFAULT_STARS, count, for: item } = {}) {
    let host = /** @type {HTMLElement | null} */ (cell.querySelector(':scope > .kp-rating'));
    if (!host) {
        host = make('span', 'kp-rating');
        cell.replaceChildren(host);
    }
    host.setAttribute('data-kp-rating', '');
    host.setAttribute('data-kp-rating-mode', 'display');
    host.setAttribute('data-kp-rating-max', String(max));
    host.setAttribute('data-kp-rating-value', String(value));
    if (count !== undefined) host.setAttribute('data-kp-rating-count', String(count));
    if (item !== undefined) host.setAttribute('data-kp-rating-for', item);
    const target = cell.closest('td, th') ?? cell;
    target.setAttribute('data-kp-sort-value', String(value));
    const known = controllerOf(host, RatingController);
    if (known) {
        known.value = known.draft = snapRating(value, known.max, DISPLAY_STEP);
        paint(known);
    } else {
        attachRatings(host);
    }
    return host;
}
