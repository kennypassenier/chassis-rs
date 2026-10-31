// The counter that gives each drawn row an id of its own, for its label, hint and rename field.

const state = { serial: 0 };

/** The next row number. */
export const nextRowNumber = () => (state.serial += 1);
