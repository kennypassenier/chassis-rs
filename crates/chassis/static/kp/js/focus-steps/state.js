// The mutable values the focus-steps parts share: the id counter and the lazily loaded timer module.

/** The mutable values the parts of this module share. */
export const focusState = {
    serial: 0,
    /** The js/timer.js module once it has loaded: the lanes read the timer list through it. */
    timerModule: /** @type {typeof import('../timer.js') | null} */ (null),
};
