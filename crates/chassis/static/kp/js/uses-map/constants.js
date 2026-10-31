// The names the lines view is found and heard by.

/** The lines view of a matrix. */
export const USES_MAP = '[data-kp-view="lines"]';
/** Fired on the matrix when a node was pinned or let go: `{ key, side, pinned, related }`. */
export const USES_PIN_EVENT = 'kp-uses-pin';
/** Fired on the matrix when the Retry of a failed map was pressed. */
export const USES_RETRY_EVENT = 'kp-uses-retry';
/** The narrowest the map draws lines at, in px. */
export const USES_COLLAPSE_BELOW = 640;
