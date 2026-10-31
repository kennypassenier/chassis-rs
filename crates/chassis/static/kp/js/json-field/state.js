// The counter that gives each field without an id its own.

const state = { serial: 0 };

/** The next field number. */
export const nextFieldNumber = () => (state.serial += 1);
