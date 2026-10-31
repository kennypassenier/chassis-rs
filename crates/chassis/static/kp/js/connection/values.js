// The selector, the events, the states and the defaults of the connection banner.

/** A connection banner. */
export const CONNECTION = '[data-kp-connection]';
/** Fired when the shown state changed. */
export const CONNECTION_STATE_EVENT = 'kp-connection-state';
/** Fired when a try should be made. */
export const CONNECTION_RETRY_EVENT = 'kp-connection-retry';
/** The states. */
export const CONNECTION_STATES = /** @type {const} */ (['online', 'offline', 'reconnecting', 'back', 'refused']);

/** A drop shorter than this shows nothing, and "Connected again" stays this long [ms]. */
export const DEFAULT_GRACE_MS = 3000;
export const DEFAULT_BACK_MS = 3000;
/** The seconds between automatic tries when the page names none; the last repeats. */
export const DEFAULT_DELAYS = [3, 10, 30, 60];
/** How often the time to the next try is redrawn [ms]. */
export const TICK_MS = 500;
/** Milliseconds in a second. */
export const SECOND_MS = 1000;
