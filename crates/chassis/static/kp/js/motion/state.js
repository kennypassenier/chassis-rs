// The mutable values the motion parts share: what is watched, in turn or batched.
/** @typedef {import('./turns.js').Arriving} Arriving */
/** @typedef {import('./leave.js').Leaving} Leaving */

/** The mutable values the parts of this module share. */
export const motionState = {
    /** How many dialogs, boxes and folds motion watches now, for a test to read. */
    watching: 0,
    arriving: /** @type {Arriving[] | null} */ (null),
    batch: /** @type {Leaving[] | null} */ (null),
};
