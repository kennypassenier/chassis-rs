// The selectors, attribute names, event name and fixed numbers of the segmented control, and the types of its items.

/** A segmented control or a chip group. */
export const SEGMENTED = '[data-kp-segmented]';

/** Fired on the group when the choice changes by a person; `{ value, values, item }`. */
export const SEGMENTED_EVENT = 'kp-segmented-change';

/** One button of a group. */
export const SEGMENTED_ITEM = '.kp-segmented__item';

/** Set on the group while the plate under the chosen segment is placed. */
export const THUMB_ATTRIBUTE = 'data-kp-segmented-thumb';

/** Set one frame after the plate was first placed, so only later moves glide. */
export const GLIDE_ATTRIBUTE = 'data-kp-segmented-glide';

/** A three-way chip's state: `include` or `exclude`; absent is either way [kpadopt4]. */
export const TRI_ATTRIBUTE = 'data-kp-segmented-tri';

/** The order a press walks a three-way chip through. */
export const TRI_STATES = /** @type {const} */ (['any', 'include', 'exclude']);

/** Set while the segments are wider than the group, which then scrolls. */
export const OVERFLOW_ATTRIBUTE = 'data-kp-segmented-overflow';

/** Set on a scrolling track to name the sides that have more segments out of sight: `start`, `end`, or both. */
export const MORE_ATTRIBUTE = 'data-kp-segmented-more';

/** The slack under which a scroll position or a width difference counts as none (sub-pixel rounding) [px]. */
export const SCROLL_SLOP_PX = 1;

/** The pause before a status sentence is written, after the region was cleared, so the same sentence twice is still heard [ms]. */
export const SAY_DELAY_MS = 60;

/**
 * @typedef {object} SegmentedItem
 * @property {string} value
 * @property {string} label
 * @property {number | null} [count]  Shown beside the label; null or absent shows none.
 * @property {string} [hint]  The item's `title`.
 * @property {boolean} [disabled]
 * @property {boolean} [all]  This is the "All" item (Clear all in a three-way group).
 * @property {'any' | 'include' | 'exclude'} [state]  A three-way chip's state; a chip still there keeps its own when absent.
 */

/**
 * @typedef {object} TriValues
 * @property {string[]} include  the values that must be in
 * @property {string[]} exclude  the values that must not be in
 */
