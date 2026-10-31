// The counter that gives error holders without an id one of their own: no Math.random, so server and client agree.

const state = { serial: 0 };

/** The next holder number. */
export const nextHolderNumber = () => (state.serial += 1);
