// The date navigation [ux-1101]: one part for "which dates am I looking at", in place of the two styles a page used to mix
// (Almanac's Status: the calendar's Prev / Next / Today in three widths, and the week agenda's ‹ Today ›).
//
//   <nav class="kp-date-nav" data-kp-date-nav="month" aria-label="Month shown"></nav>
//   <nav class="kp-date-nav" data-kp-date-nav="week" data-kp-date-nav-for="runs-week" aria-label="Week shown"></nav>
//
// It draws the label of the range it shows ("November 2026", "Week 45 · 02/11 to 08/11/2026", "Monday 02/11/2026"), with the
// word "current" while the range holds today, and then Previous, Today and Next on three equal tracks, so the three keep one
// width whatever their words and never move when the label changes. Each button is named for the mode ("Previous month",
// "Next week") and says so in its title. PageUp and PageDown step, Home goes back to today, anywhere inside it.
//
// Options, as attributes (each read again when it changes):
//   data-kp-date-nav        month (default) | week | day
//   data-kp-date-nav-at     the day the range holds, YYYY-MM-DD; today when absent
//   data-kp-date-nav-for    the id of a week agenda (data-kp-week) or a calendar (data-kp-calendar) it drives: the target is
//                           moved and then hears its own range event (kp-week-range, kp-calendar-month, `source: 'date-nav'`),
//                           so a page written for the target's own buttons fetches the same way. Give the week no
//                           data-kp-week-nav and the calendar data-kp-calendar-nav="off" so there is one navigation.
//   data-kp-date-nav-today  today, YYYY-MM-DD, for a page whose clock is not the visitor's
//   data-kp-locale, data-kp-week-starts-on, data-kp-time-zone  as the calendar reads them
//
// Event (bubbling, on the navigation): kp-date-nav-change { mode, at, start, end, by: 'prev' | 'next' | 'today' }; a status
// region says "Now showing November 2026". Under a coarse pointer the buttons are 44 px, as every kp button is.
//
// Nothing runs on import; attachDateNavs(root) returns a detach.

import { attachAll, controllerOf } from './controller.js';
import { DATE_NAV } from './date-nav/constants.js';
import { DateNavControl } from './date-nav/controller.js';

export { DATE_NAV, DATE_NAV_EVENT, DATE_NAV_MODES } from './date-nav/constants.js';

/**
 * Wire every date navigation under `root`. Idempotent.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDateNavs(root = document) {
    return attachAll(root, DATE_NAV, DateNavControl);
}

/**
 * Show a day without firing the event (the page asked); the target follows.
 * @param {Element} nav @param {string} day `YYYY-MM-DD`
 */
export function setDateNav(nav, day) {
    controllerOf(/** @type {HTMLElement} */ (nav), DateNavControl)?.show(day);
}

/**
 * The range a wired navigation shows, or null.
 * @param {Element} nav
 * @returns {import('./date-nav/constants.js').DateNavRange | null}
 */
export function getDateNav(nav) {
    return controllerOf(/** @type {HTMLElement} */ (nav), DateNavControl)?.range() ?? null;
}
