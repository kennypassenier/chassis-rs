// The selector, event names and fixed numbers of the time field, and the types of its presets.

/** The fields this module looks after. */
export const TIME = '[data-kp-time]';
/** Fired when the value changes: `{ value, text, converted }`. */
export const TIME_EVENT = 'kp-time-change';
/** Fired by the Retry of presets that could not be loaded. */
export const TIME_RETRY_EVENT = 'kp-time-retry';
/** The steps the keys and the list may use, in minutes. */
export const TIME_STEPS = Object.freeze([1, 5, 10, 15, 30, 60]);

/** Minutes in an hour, and in a day (a time of day wraps at it). */
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;
/** The step of the keys and the list unless `data-kp-time-step` names a valid one [min]. */
export const DEFAULT_STEP = 5;
/** How close a time must be to a busy moment to get a mark, unless `data-kp-time-near-width` says otherwise [min]. */
export const DEFAULT_NEAR_WIDTH = 60;
/** The pause before a status sentence is written, after the region was cleared, so the same sentence twice is heard [ms]. */
export const SAY_DELAY_MS = 60;
/** The widths under which the list becomes a sheet at the foot of the screen. */
export const NARROW_QUERY = '(max-width: 40rem)';
/** The list's distance from the window's edge, and from the field [px]. */
export const POPUP_EDGE_PX = 8;
export const POPUP_GAP_PX = 4;
/** The least width of the list: 13rem at the default font size [px]. */
export const POPUP_MIN_WIDTH_PX = 13 * 16;
/** The digits that make a time without a colon (0230), at which the colon is put in as it is typed. */
export const BARE_DIGITS = 4;

/** @typedef {{ label: string, value: string }} TimePreset */
/** @typedef {TimePreset[] | 'loading' | 'error'} TimePresets */
/** @typedef {{ value: string, label?: string, kind: 'time' | 'now' | 'clear' }} TimeEntry */
