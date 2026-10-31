// The selector, event names, states and counts of the uptime strip.

/** A strip. */
export const UPTIME = '[data-kp-uptime]';
/** Fired on the strip when a cell is pressed: `{ key, index, period }`. */
export const UPTIME_PICK_EVENT = 'kp-uptime-pick';
/** Fired on the strip, cancelable, before a period's quick info opens: `{ key, index, period, panel }`. */
export const UPTIME_OPEN_EVENT = 'kp-uptime-open';
/** Fired on the strip, bubbling, when the Retry of its failed state is pressed [kyu-plates-1019]. */
export const UPTIME_RETRY_EVENT = 'kp-uptime-retry';
/** A cell a person can press: a button, or a link to its period's page. */
export const CELL = '.kp-uptime__cell:is(button, a)';
/** The states of a period, in the order of how bad they are. */
export const UPTIME_STATES = /** @type {const} */ (['up', 'degraded', 'down', 'none']);
/** How many cells a strip waits with when the page has not said (`data-kp-uptime-count`). */
export const UPTIME_COUNT = 90;
