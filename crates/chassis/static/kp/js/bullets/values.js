// The selector, the events and the defaults of the bullet list.

/** A bullet list the page fills with setBullets(). */
export const BULLETS = '[data-kp-bullets]';
/** Fired on the root when a `pick` row is pressed: `{ key }`. */
export const BULLETS_PICK_EVENT = 'kp-bullets-pick';
/** Fired on the root when the Retry of a failed list is pressed. */
export const BULLETS_RETRY_EVENT = 'kp-bullets-retry';

/** How many waiting rows a list that never had rows shows. */
export const DEFAULT_LOADING_ROWS = 3;
/** The bar runs to this many thresholds when the page names no `max`. */
export const DEFAULT_MAX_THRESHOLDS = 2;
