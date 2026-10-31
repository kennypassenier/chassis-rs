// The selectors and events of the folding bar, and the small readers of an item: its words, its counter, a separator, an unavailable link.

/** A bar that folds. */
export const NAV_FOLD = '[data-kp-nav-fold]';

/** Fired on the nav, bubbling, when the set of folded items changed: `{ folded, items }`. */
export const NAV_FOLD_EVENT = 'kp-nav-fold';

/** The item the script adds to the bar's list. */
export const NAV_MORE = '[data-kp-nav-more]';

/** A separator between two groups of links [kpadopt3]. */
export const NAV_SEP = '.kp-nav__sep';

/** The mark the React NavBar puts on a bar it wires itself [AR29]; it folds its own (`fold`). */
export const NAV_FOLD_OWNED = '[data-kp-nav-owner]';

/** @param {Element} el @returns {string} the visible words of a link, less its counter */
export function wordsOf(el) {
    const copy = /** @type {Element} */ (el.cloneNode(true));
    for (const skip of copy.querySelectorAll('.kp-badge, [aria-hidden="true"], [data-kp-nav-fold-skip]')) skip.remove();
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** @param {Element} el @returns {string} its counter's text, or '' */
export function counterOf(el) {
    const badge = el.querySelector('.kp-badge:not([hidden])');
    return (badge?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** @param {Element} li @returns {boolean} */
export const isSep = (li) => li.matches(NAV_SEP);

/** @param {HTMLElement} el @returns {boolean} */
export const unavailable = (el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
