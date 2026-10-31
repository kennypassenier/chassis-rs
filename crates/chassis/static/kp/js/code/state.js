// The counter that gives each code body an id of its own, for the fold button's `aria-controls`.

const state = { serial: 0 };

/** The next body number. */
export const nextBodyNumber = () => (state.serial += 1);
