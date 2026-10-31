// The counter that gives each picker without an id its own.

const state = { serial: 0 };

/** The next picker number. */
export const nextPickerNumber = () => (state.serial += 1);
