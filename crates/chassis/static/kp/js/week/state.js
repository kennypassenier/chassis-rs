// The per-week memory and the id counter the parts share.
/** @typedef {import('./types.js').WeekModel} WeekModel */

/** @type {WeakMap<Element, WeekModel>} */
export const weeks = new WeakMap();
/** The mutable values the parts of this module share. */
export const weekState = {
    idSeq: 0,
};
