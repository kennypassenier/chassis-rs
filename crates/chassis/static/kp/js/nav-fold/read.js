// The selectors and events of the folding bar, and the small readers of an item: its words, its counter, a separator, an unavailable link.

/** A bar that folds. */
export const NAV_FOLD = '[data-kp-nav-fold]';

/** Fired on the nav, bubbling, when the set of folded items changed: `{ folded, items }`. */
export const NAV_FOLD_EVENT = 'kp-nav-fold';

/** The item the script adds to the bar's list. Its class is part of the selector: a page's own item may carry
 * `data-kp-nav-more` too, which pins it behind this one (NAV_PINNED) [parts-1102]. */
export const NAV_MORE = '.kp-nav__more[data-kp-nav-more]';

/** A list item the page pins behind More whatever the width; a value names its group in the menu [parts-1102]. */
export const NAV_PINNED = 'li[data-kp-nav-more]:not(.kp-nav__more)';

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
export const isPinned = (li) => li.matches(NAV_PINNED);

/** The group a pinned item names in the More menu ('' for none). @param {Element} li @returns {string} */
export const pinnedGroup = (li) => (isPinned(li) ? (li.getAttribute('data-kp-nav-more') ?? '').trim() : '');

/** The one-line hint of a link in the More menu: `data-kp-nav-hint` on the link or on its item. @param {Element} el @returns {string} */
export const hintOf = (el) => (el.getAttribute('data-kp-nav-hint') ?? el.closest('li')?.getAttribute('data-kp-nav-hint') ?? '').trim();

/** @param {Element} li @returns {boolean} */
export const isSep = (li) => li.matches(NAV_SEP);

/** @param {HTMLElement} el @returns {boolean} */
export const unavailable = (el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
