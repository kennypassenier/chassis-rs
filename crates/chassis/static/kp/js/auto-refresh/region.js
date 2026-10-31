// What stops a refresh for now, and the `region` mode: fetch the same URL and swap one element's children.

import { TYPING_SELECTOR } from './constants.js';

/**
 * Why a refresh should wait now: the tab is hidden, a dialog is open, a field outside the control has the focus, or the
 * pointer is over a table being read. Empty when nothing stops it.
 * @param {HTMLElement} el
 */
export function blockedReason(el) {
    const doc = el.ownerDocument;
    if (doc.visibilityState === 'hidden') return 'hidden';
    if (doc.querySelector('dialog[open]')) return 'dialog';
    const a = doc.activeElement;
    if (a instanceof HTMLElement && !el.contains(a) && a.matches(TYPING_SELECTOR)) return 'typing';
    if (el.getAttribute('data-kp-refresh-hover') === 'pause' && doc.querySelector('.kp-table-wrap:hover')) return 'reading';
    return '';
}

/**
 * Fetch the page again and swap the children of the `data-kp-refresh-region` element, keeping the element, its scroll and an open menu on it.
 * @param {HTMLElement} el
 * @returns {Promise<boolean>} whether it worked
 */
export async function regionRefresh(el) {
    const doc = el.ownerDocument;
    const view = /** @type {Window} */ (doc.defaultView);
    const selector = el.getAttribute('data-kp-refresh-region');
    if (!selector) return true;
    const response = await view.fetch(view.location.href, { headers: { 'X-Requested-With': 'kp-refresh' } });
    if (!response.ok) return false;
    const html = await response.text();
    const next = new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
    const here = doc.querySelector(selector);
    if (!next || !here) return false;
    // Swap the children, keeping the element itself: scroll and an open menu on it survive.
    const top = here.scrollTop;
    here.replaceChildren(...next.childNodes);
    here.scrollTop = top;
    return true;
}
