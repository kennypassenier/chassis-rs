// The counter that gives each rating's caption and reason an id of its own.

const state = { serial: 0 };

/** The next rating number. */
export const nextRatingNumber = () => (state.serial += 1);
