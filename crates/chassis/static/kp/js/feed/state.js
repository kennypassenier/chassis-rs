// The counter that gives each feed, and each row that opens, an id of its own.

const state = { serial: 0 };

/** The next number. */
export const nextFeedNumber = () => (state.serial += 1);
