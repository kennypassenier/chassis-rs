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

/** On the log viewer: the key that jumps to the search from anywhere (a key spec, js/key-spec.js, or the older `/` spelling; `none` or `false` for no key). */
export const LOG_FOCUS_KEY_ATTRIBUTE = 'data-kp-log-focus-key';
/** The key that jumps to the search when the viewer names none. */
export const LOG_FOCUS_KEY = '/';
