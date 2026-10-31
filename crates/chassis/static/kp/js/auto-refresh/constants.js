// The selector, events, defaults, option attributes, fixed numbers and types of the automatic refresh chooser.

/** An automatic refresh control. */
export const REFRESH = '[data-kp-refresh]';
/** Fired on the control at each refresh the app should do. */
export const REFRESH_EVENT = 'kp-refresh';
/** Fired when the interval changed. */
export const REFRESH_INTERVAL_EVENT = 'kp-refresh-interval';
/** The interval a page opens with, in seconds, and the choices offered. */
export const REFRESH_DEFAULT = 30;
export const REFRESH_CHOICES = [0, 15, 30, 60, 300];

/** The shortest the freshness line waits before it turns stale [s]. */
export const MIN_STALE_S = 60;
/** The freshness line turns stale after this many intervals when the page does not say. */
export const STALE_INTERVALS = 3;
/** A refresh held back by a dialog, a field or the pointer looks again after this long [ms]. */
export const BLOCKED_RETRY_MS = 1000;
/** Retries back off twice (the interval, twice, four times), then stay at that: the highest power of two used. */
export const MAX_BACKOFF_POWER = 2;
/** Milliseconds in a second. */
export const SECOND_MS = 1000;
/** The radix and slice of the random part of the custom field's id. */
export const ID_RADIX = 36;
export const ID_START = 2;
export const ID_END = 8;

/** The attributes the control reads again when they change (js/live-options.js). */
export const WATCHED_ATTRIBUTES = [
    'data-kp-look',
    'data-kp-refresh',
    'data-kp-refresh-choices',
    'data-kp-stale-after',
    'data-kp-announce',
    'data-kp-refresh-label',
    'data-kp-refresh-title',
];

/** What keeps a refresh from running now: typing in a field outside the control. */
export const TYPING_SELECTOR =
    'input:not([type=checkbox], [type=radio], [type=button], [type=submit]), textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * @typedef {object} RefreshHandle
 * @property {HTMLElement} element
 * @property {() => number} interval seconds, 0 = paused
 * @property {(seconds: number, by?: 'user' | 'script') => void} setInterval any whole number of seconds
 * @property {(reason?: 'now' | 'retry') => void} now refresh at once
 * @property {(ok: boolean) => void} done the app's answer to the refresh in progress
 */
