// The selector, the event, the default value and the fixed numbers of the quiet-hours control.

/** The controls this module looks after. */
export const QUIET = '[data-kp-quiet]';
/** Fired on the control when a person changes it: `{ value, summary, valid }`. */
export const QUIET_EVENT = 'kp-quiet-change';
/** The severities, most serious first, when the page names none. */
export const QUIET_SEVERITIES = /** @type {const} */ (['critical', 'warning', 'info', 'ok']);

/** @typedef {import('../quiet-hours.js').QuietValue} QuietValue */

/** @type {QuietValue} */
export const DEFAULT = { on: false, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6], through: ['critical'] };

/** The options the control reads again when they change. */
export const WATCHED_OPTIONS = ['data-kp-quiet-severities', 'data-kp-quiet-label', 'data-kp-disabled', 'data-kp-state'];
/** The time fields step by this many minutes when the page names none. */
export const DEFAULT_STEP = '15';
/** The bars the loading state shows. */
export const WAIT_BONES = 4;
