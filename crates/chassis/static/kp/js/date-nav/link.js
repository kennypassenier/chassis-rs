// A date navigation that drives a week agenda or a month calendar (`data-kp-date-nav-for`) [ux-1101]: the target is moved
// without its own event, then hears the event its own buttons fire, so a page written for the week's or the calendar's own
// navigation keeps fetching the same way. The target is found by id at every move, so it may arrive after the navigation.

import { calendarMonth } from '../calendar/api.js';
import { CALENDAR_MONTH_EVENT } from '../calendar/constants.js';
import { setWeekStart } from '../week/api.js';
import { WEEK_RANGE_EVENT } from '../week/constants.js';
import { FOR_ATTRIBUTE } from './constants.js';
import { byId } from '../by-id.js';
/** @typedef {import('./constants.js').DateNavRange} DateNavRange */

/**
 * Move the target the navigation names, if any, to the range it shows now.
 * @param {HTMLElement} nav @param {DateNavRange} range @param {boolean} announce whether a person moved it (the target's own event fires)
 */
export function driveTarget(nav, range, announce) {
    const id = nav.getAttribute(FOR_ATTRIBUTE);
    if (!id) return;
    const target = byId(nav.ownerDocument, id);
    if (!target) {
        console.warn(`kp-date-nav: ${FOR_ATTRIBUTE}="${id}" names no element; the navigation moves nothing`);
        return;
    }
    if (target.hasAttribute('data-kp-week')) {
        setWeekStart(target, range.start);
        if (announce) target.dispatchEvent(new CustomEvent(WEEK_RANGE_EVENT, { bubbles: true, detail: { start: range.start, source: 'date-nav' } }));
        return;
    }
    if (target.hasAttribute('data-kp-calendar')) {
        const [year = 0, month = 1] = range.at.split('-').map(Number);
        calendarMonth(target, { year, month });
        if (announce) target.dispatchEvent(new CustomEvent(CALENDAR_MONTH_EVENT, { bubbles: true, detail: { year, month, source: 'date-nav' } }));
        return;
    }
    console.warn(`kp-date-nav: #${id} is neither a week agenda (data-kp-week) nor a calendar (data-kp-calendar)`);
}
