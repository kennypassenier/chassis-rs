// The selector, the event, the states and the fixed numbers of the next-times list.

/** A next-times list. */
export const RUNS = '[data-kp-runs]';
/** Fired on the list, bubbling, when Try again is pressed: `{ element }`. */
export const RUNS_RETRY_EVENT = 'kp-runs-retry';
/** The states a list can be in. */
export const RUNS_STATES = /** @type {const} */ (['ready', 'empty', 'loading', 'error']);

/** How many rows a list shows when it is not told. */
export const DEFAULT_COUNT = 3;
/** How often the relative words are refreshed [ms]. */
export const REFRESH_MS = 60000;
/** Seconds in a minute, and in a day. */
export const MINUTE_S = 60;
export const DAY_S = 86400;
/** Under this many seconds a run is "now". */
export const NOW_S = 30;
/** Milliseconds in a minute. */
export const MINUTE_MS = 60000;
