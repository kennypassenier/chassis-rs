// The selector, the event, the quick picks and the fixed numbers of the weekday picker.

/** A weekday picker. */
export const WEEKDAYS = '[data-kp-weekdays]';
/** Fired on the picker when the days change by a person: `{ values, summary, valid }`. */
export const WEEKDAYS_EVENT = 'kp-weekdays-change';
/** The quick picks a week picker offers when it does not say. */
export const WEEKDAY_PRESETS = /** @type {const} */ (['weekdays', 'weekend', 'every']);

/** The days of the working week and of the weekend, in `Date#getDay` numbers. */
export const SETS = {
    weekdays: [1, 2, 3, 4, 5],
    weekend: [6, 0],
    every: [0, 1, 2, 3, 4, 5, 6],
};

/** The English names a value may be written with, by day number. */
export const NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Days in a week, and the days a month picker offers. */
export const WEEK = 7;
export const MONTH_DAYS = 31;
/** The fewest days a schedule needs when it does not say. */
export const DEFAULT_MIN = 1;
