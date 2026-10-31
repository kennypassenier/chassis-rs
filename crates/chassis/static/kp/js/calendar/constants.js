// The selector, event names and fixed numbers of the calendar, and the types of its days, states and options.

/** A month heatmap: `section.kp-calendar[data-kp-calendar]`. */
export const CALENDAR = '[data-kp-calendar]';
/** Fired on the calendar, bubbling, when a day is picked: `detail` `{ date: 'YYYY-MM-DD', source: 'pointer' | 'keyboard' }`. */
export const CALENDAR_PICK_EVENT = 'kp-calendar-pick';
/** Fired on the calendar, bubbling, when a person moves it to another month: `detail` `{ year, month }` (month 1-12). */
export const CALENDAR_MONTH_EVENT = 'kp-calendar-month';
/** Fired on a calendar, bubbling, when Retry is pressed on its failed plate (every tone) [r1r2-1019]. */
export const CALENDAR_RETRY_EVENT = 'kp-calendar-retry';

/**
 * @typedef {'ok' | 'warn' | 'bad' | 'muted' | 'future' | 'before' | 'loading' | 'none' | 'logged' | 'quiet' | 'paused'} CalendarTone
 * @typedef {{ tone: CalendarTone, count?: string, label: string }} CalendarDay
 *   One day's state: its tone, a short count under the number (`7/9`), and the words a screen reader and the
 *   title say after the date (`7 of 9 services backed up; missing: …`)
 * @typedef {'loading' | 'ready' | 'empty' | 'error'} CalendarState
 * @typedef {import('../strings.js').Strings} Strings
 */

/**
 * What `decorate` is told about the control it is handed: the same shape every kp module's `decorate` takes.
 * `kind` is `month-prev`, `month-next`, `today`, or `day` (`index` its cell, 0-41, `value` its date). `host` is
 * the calendar and `key` its `data-kp-key`.
 * @typedef {{ kind: 'day' | 'month-prev' | 'month-next' | 'today', host: HTMLElement, key?: string, index?: number, label?: string, value?: string }} CalendarDecorateInfo
 */

/**
 * @typedef {object} CalendarOptions
 * @property {string} [timeZone] the IANA zone that decides which day is today; else the calendar's `data-kp-time-zone`,
 *   else `Europe/Brussels`
 * @property {string} [locale] the month and weekday names and the first day of the week; else the calendar's
 *   `data-kp-locale`, else the nearest `lang` above it
 * @property {number} [weekStartsOn] 0 (Sunday) to 6; else the calendar's `data-kp-week-starts-on`, else the locale's
 * @property {() => number} [now] the clock, `Date.now` by default
 * @property {Partial<Strings>} [strings] any of the dictionary's words, for these calendars only
 * @property {(part: HTMLElement, info: CalendarDecorateInfo) => void} [decorate] called with every control a calendar
 *   builds, each time it builds it, so the page can mark it
 */

/** One day in milliseconds. */
export const DAY_MS = 86_400_000;
/** Days in a week, weeks in a grid, and the cells that makes: every month is six rows tall. */
export const DAYS_PER_WEEK = 7;
export const GRID_WEEKS = 6;
export const GRID_CELLS = DAYS_PER_WEEK * GRID_WEEKS;
/** Months in a year; Shift with Page Up or Page Down moves by one. */
export const MONTHS_PER_YEAR = 12;
/** A Sunday (4 January 2026): day `firstDay + d` of that week is the d-th weekday column. */
export const SUNDAY_REFERENCE = Date.UTC(2026, 0, 4);
