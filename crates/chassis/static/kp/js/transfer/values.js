// The transfer row's selector and events, and the defaults the attributes override.

/** A transfer row. */
export const TRANSFER = '[data-kp-transfer]';
/** Fired when a transfer finished: `{ total, ms }`. */
export const TRANSFER_DONE_EVENT = 'kp-transfer-done';
/** Fired when Retry is pressed on a failed transfer. */
export const TRANSFER_RETRY_EVENT = 'kp-transfer-retry';
/** Fired when a finished transfer left the list after its linger. */
export const TRANSFER_LEAVE_EVENT = 'kp-transfer-leave';

/** The group whose transfers align their columns. */
export const TRANSFER_GROUP = '.kp-progress-group--transfer';

/** The moving average's window, the time before the time left is shown, the time without a byte that is a stall, and how long a finished transfer stays, in seconds. */
export const DEFAULT_RATE_WINDOW_S = 5;
export const DEFAULT_ETA_AFTER_S = 3;
export const DEFAULT_STALL_AFTER_S = 10;
export const DEFAULT_LINGER_S = 30;
/** Milliseconds in a second. */
export const MS = 1000;
/** The width below which a group folds to name, bar and numbers under it, unless `data-kp-fold-at` says. */
export const DEFAULT_FOLD_AT = '46rem';
/** How often the live transfers are looked at, so a stall is noticed without a new report, in ms. */
export const TICK_MS = 1000;
/** The share steps a screen reader hears: every 25 %. */
export const ANNOUNCE_STEP = 25;
