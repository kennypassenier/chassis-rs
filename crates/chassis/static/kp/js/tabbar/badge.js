// The functions a page calls on the bottom bar's tabs: a count badge, the current tab and a tab that waits. Pure DOM writes, no state of their own.

import { setTabCount } from './count.js';

/** A tab bar. */
export const TABBAR = '.kp-tabbar';

/** The root property the bar's height is published on while the bar is shown. */
export const TABBAR_HEIGHT_PROPERTY = '--kp-tabbar-height';

/**
 * Write a count on a tab: all its digits (12 is 12 and 1534 is 1534, never `99+`
 * or `1.5k`: Kenny, 2026-10-03, a counter shows the real number), nothing and hidden at
 * 0 or `null`. The badge is made when the tab has none. A tab that has a
 * count is the one place the bar speaks for something that moved, so the
 * count is also on the tab as `data-kp-count`, for a register or a test.
 *
 * @param {Element} tab a `.kp-tabbar__tab`
 * @param {number | null} count
 * @returns {HTMLElement | null} the badge
 */
export function setTabbarBadge(tab, count) {
    // The same call on a tab of the underline row writes its count part instead (one function covers both bars).
    if (tab.matches('.kp-tab') && !tab.matches('.kp-tabbar__tab')) return setTabCount(tab, count);
    let badge = /** @type {HTMLElement | null} */ (tab.querySelector('.kp-tabbar__badge'));
    const whole = count === null || !Number.isFinite(count) ? 0 : Math.trunc(count);
    const none = whole <= 0;
    if (!badge) {
        if (none) return null;
        badge = tab.ownerDocument.createElement('span');
        badge.className = 'kp-badge kp-tabbar__badge';
        tab.append(badge);
    }
    badge.hidden = none;
    badge.textContent = none ? '' : String(whole);
    if (none) tab.removeAttribute('data-kp-count');
    else tab.setAttribute('data-kp-count', String(whole));
    return badge;
}

/**
 * Make one tab the current page: `aria-current="page"` on it, off the others.
 * A `data-kp-tab` that matches no tab leaves every tab not current, which is
 * right for a page that lives behind the More tab (that tab marks itself).
 *
 * @param {Element} bar a `.kp-tabbar`
 * @param {string | null} id the `data-kp-tab` of the current tab
 */
export function setTabbarCurrent(bar, id) {
    // A tab that opens a dialog is current by what its dialog holds (attachTabbars), not by this.
    for (const tab of bar.querySelectorAll('.kp-tabbar__tab:not([data-kp-dialog])')) {
        if (id !== null && tab.getAttribute('data-kp-tab') === id) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
    }
}

/**
 * Put a tab to wait: `aria-busy` on it and the theme's own spinner
 * (`.kp-spinner`) in the icon's place, which has its size, so the tab does not
 * move. Not busy puts the icon back.
 *
 * @param {Element} tab a `.kp-tabbar__tab`
 * @param {boolean} busy
 */
export function setTabbarBusy(tab, busy) {
    const icon = tab.querySelector('.kp-tabbar__icon');
    if (!icon) return;
    const spinner = icon.querySelector(':scope > .kp-spinner');
    tab.toggleAttribute('aria-busy', busy);
    if (busy) tab.setAttribute('aria-busy', 'true');
    if (busy && !spinner) {
        const made = tab.ownerDocument.createElement('span');
        made.className = 'kp-spinner';
        made.setAttribute('aria-hidden', 'true');
        icon.append(made);
    } else if (!busy) spinner?.remove();
}
