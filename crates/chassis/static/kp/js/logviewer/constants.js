// The selector, event names, limit and level words of the log viewer.

/** The viewers this module looks after. */
export const LOGVIEWER = '[data-kp-logviewer]';
/** Fired when the buffer, the filter or the find changes: `{ total, shown, dropped, matches, current }`. */
export const LOGVIEWER_EVENT = 'kp-logviewer-change';
/** Fired by the Retry of a viewer whose source failed. */
export const LOGVIEWER_RETRY_EVENT = 'kp-logviewer-retry';
/** The default cap of the ring buffer. */
export const LOGVIEWER_MAX = 2000;
/** The levels, lowest first. */
export const LOG_LEVELS = Object.freeze(['debug', 'info', 'notice', 'warning', 'error', 'critical']);
