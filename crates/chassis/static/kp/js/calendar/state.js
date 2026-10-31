// The counter that gives each calendar's title an id of its own.

const state = { seq: 0 };

/** The next title number. */
export const nextTitleNumber = () => (state.seq += 1);
