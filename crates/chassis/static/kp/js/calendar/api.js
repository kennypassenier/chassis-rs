// The calls a page makes on a calendar: give it days, a state, a selection, a month, a legend and a caption, and attach it.

import { attachOne, controllerOf } from '../controller.js';
import { CALENDAR } from './constants.js';
import { CalendarController } from './controller.js';

/** @param {Element} el */
const calendarOf = (el) => controllerOf(/** @type {HTMLElement} */ (el), CalendarController);

/**
 * Every day's state, by `YYYY-MM-DD` (the whole history: a month change
 * needs no new call). Repaints in place; the focus and the selection stay,
 * so a live update never moves a reader. A calendar that was loading is
 * ready from here on.
 * @param {Element} el
 * @param {Record<string, import('./constants.js').CalendarDay>} days
 */
export function setCalendarDays(el, days) {
    calendarOf(el)?.setDays(days);
}

/**
 * The calendar as a whole: `loading` (every day pulses at its final size),
 * `ready`, `empty` or `error` (no pulse; `words` under the month, an error's
 * after a dot in the destructive colour). The days say `words` too.
 * @param {Element} el
 * @param {import('./constants.js').CalendarState} state
 * @param {string} [words]
 */
export function setCalendarState(el, state, words = '') {
    calendarOf(el)?.setState(state, words);
}

/**
 * Select a day (or none, with null) and show its month; no event, the page
 * asked.
 * @param {Element} el
 * @param {string | null} iso `YYYY-MM-DD`
 */
export function calendarSelect(el, iso) {
    calendarOf(el)?.select(iso);
}

/**
 * Show a month; no event, the page asked.
 * @param {Element} el
 * @param {{ year: number, month: number }} at month 1-12
 */
export function calendarMonth(el, { year, month }) {
    calendarOf(el)?.showMonth(year, month, false);
}

/**
 * The legend under the grid: a swatch and its words per tone, in the order
 * given; none hides it.
 * @param {Element} el
 * @param {{ tone: import('./constants.js').CalendarTone, label: string }[]} entries
 */
export function setCalendarLegend(el, entries) {
    calendarOf(el)?.setLegend(entries);
}

/**
 * A sentence under the grid, for the page's own words (a calm calendar's "trends count the days that were logged"); an empty
 * text hides it.
 * @param {Element} el
 * @param {string} text
 */
export function setCalendarCaption(el, text) {
    const caption = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-calendar__caption'));
    if (!caption) return;
    caption.textContent = text;
    caption.hidden = text === '';
}

/**
 * Build every month heatmap under `root`: the month's title between ‹ Prev
 * and Next ›, Today, a line for the state, a six-week grid (one tab stop, the
 * keys of a date grid) and the legend. Today is the day in `timeZone`. Per
 * calendar: `data-kp-calendar-month="YYYY-MM"` (the month shown first, else
 * today's), `data-kp-calendar-selected="YYYY-MM-DD"`, `data-kp-time-zone`,
 * `data-kp-locale`, `data-kp-week-starts-on`, `data-kp-heading-level` (the
 * title's, 2 by default) and `data-kp-key` (handed to `decorate`).
 * Only the calendars below `root` are wired, not `root` itself.
 * @param {ParentNode} [root]
 * @param {import('./constants.js').CalendarOptions} [options]
 * @returns {() => void} detach: the listeners taken away; the calendars keep what they show
 */
export function attachCalendars(root = document, options = {}) {
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(CALENDAR)])
        .filter((el) => !controllerOf(el, CalendarController))
        .map((el) => attachOne(el, CalendarController, options))
        .filter((controller) => controller !== undefined);
    return () => {
        for (const controller of made) controller.destroy();
    };
}
