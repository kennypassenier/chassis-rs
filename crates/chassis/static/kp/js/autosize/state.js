// The counter that gives each box's error line an id of its own.

const state = { serial: 0 };

/** The next error line number. */
export const nextErrorNumber = () => (state.serial += 1);
