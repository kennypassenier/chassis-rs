// The selector, event names, states and fixed numbers of the rating, and the types of its options, sources and handle.

/** A rating. */
export const RATING = '[data-kp-rating]';
/** Fired on the rating when a person changes it: `{ value, previous, source, wait }`. */
export const RATING_EVENT = 'kp-rating-change';
/** Fired on the rating when Retry is pressed on a rating that could not be read. */
export const RATING_RETRY_EVENT = 'kp-rating-retry';
/** The states a rating can be in. */
export const RATING_STATES = /** @type {const} */ (['ready', 'loading', 'error']);
/** The star, as one path in a 24 by 24 box. */
export const STAR_PATH = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9z';
/** The fewest and the most stars a scale may have, and the default. */
export const MIN_STARS = 3;
export const MAX_STARS = 10;
export const DEFAULT_STARS = 5;
/** How long the Undo toast stays unless `data-kp-undo-ms` says, and how long a refused save is told [ms]. */
export const DEFAULT_UNDO_MS = 6000;
export const DEFAULT_FLASH_MS = 3000;
/** The pause before a status sentence is written, so the same sentence twice is heard [ms]. */
export const SAY_DELAY_MS = 30;
/** The step a display row snaps its value to: a fraction of a star is drawn as it is. */
export const DISPLAY_STEP = 0.01;

/**
 * @typedef {'pointer' | 'keyboard' | 'clear' | 'undo'} RatingSource
 */

/**
 * @typedef {object} RatingOptions
 * @property {number} [max] the scale, 3 to 10 (default 5)
 * @property {1 | 0.5} [step] whole or half stars (default 1)
 * @property {'input' | 'display'} [mode] a row to set, or one to read (default input)
 */

/**
 * @typedef {object} RatingHandle
 * @property {HTMLElement} element
 * @property {() => number} value 0 is not rated
 * @property {(value: number) => void} set replace the value (no event)
 * @property {(state: 'ready' | 'loading' | 'error') => void} setState
 * @property {() => void} focus
 */
