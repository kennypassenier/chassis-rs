// The notification centre's selector, event names and severities, shared by the facade and the controller.

/** A notification centre. */
export const NOTICES = '[data-kp-notices]';
export const NOTICE_FIX_EVENT = 'kp-notice-fix';
export const NOTICE_READ_EVENT = 'kp-notice-read';
export const NOTICES_READ_ALL_EVENT = 'kp-notices-read-all';
export const NOTICES_SOURCE_EVENT = 'kp-notices-source';
export const NOTICES_RETRY_EVENT = 'kp-notices-retry';
export const NOTICES_END_QUIET_EVENT = 'kp-notices-end-quiet';
export const NOTICES_INBOX_EVENT = 'kp-notices-open-inbox';
/** The severities, worst first. */
export const NOTICE_SEVERITIES = /** @type {const} */ (['critical', 'warning', 'info']);

/** Newest notices per severity the panel shows when `data-kp-panel-max` does not say. */
export const PANEL_MAX = 10;
/** How long a toast for a new notice stays [ms]. */
export const TOAST_MS = 8000;
/** How soon `i` must follow `g` to open the Inbox [ms]. */
export const G_I_WINDOW_MS = 1200;
