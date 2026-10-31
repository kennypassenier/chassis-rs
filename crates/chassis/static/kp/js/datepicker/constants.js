// The names, event names and fixed numbers of the date picker, and the types of its views and handle.

/** A date picker. */
export const PICKER = '[data-kp-datepicker]';

/** Fired when a date is chosen, typed or set. A contract value [TH26]: `{ iso, date, source }`. */
export const DATE_EVENT = 'kp-date-change';
/** Fired when the panel opens or closes: `{ open }`. */
export const OPEN_EVENT = 'kp-date-open';
/** Fired when the visible month changes: `{ year, month }` (month 0-11). */
export const MONTH_EVENT = 'kp-date-month';

/** Cells a row in the month and year grids. */
export const JUMP_COLUMNS = 3;
/** Months in a year, which is also how many years the year grid shows. */
export const MONTHS_PER_YEAR = 12;
/** Years in the year grid's block. */
export const YEARS_PER_BLOCK = 12;
/** Cells a PageUp or PageDown moves in the month and year grids: a year of months, a block of years. */
export const JUMP_PAGE = 12;
/** Days in a week. */
export const DAYS_PER_WEEK = 7;
/** The last column of a week, counted from its first day. */
export const LAST_WEEKDAY = DAYS_PER_WEEK - 1;

/** @typedef {'days' | 'months' | 'years'} DateView */

/**
 * @typedef {object} DatePickerHandle
 * @property {HTMLElement} element
 * @property {() => Date | null} get
 * @property {(date: Date | string | null) => void} set a Date, an ISO string, or null to clear
 * @property {() => void} open
 * @property {() => void} close
 */

/**
 * @typedef {object} DatePickerOptions
 * @property {string} [locale]
 * @property {'rule52' | 'locale'} [dateFormat]
 * @property {number} [weekStartsOn]
 * @property {boolean} [closeOnSelect]
 * @property {boolean} [refocus]
 * @property {(date: Date) => boolean} [isDateDisabled]
 * @property {(button: HTMLButtonElement, date: Date) => void} [renderDay]
 * @property {string} [previousGlyph]
 * @property {string} [nextGlyph]
 */
