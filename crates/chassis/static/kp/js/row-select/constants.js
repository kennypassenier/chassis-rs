// The keys of row selection and their defaults [keys-1103]. Each is a key spec (js/key-spec.js); `none` turns the key off.

/** On the host: the key that moves the cursor to the next row (the Down arrow works as well, unless `data-kp-select-arrows="false"`). */
export const SELECT_NEXT_KEY_ATTRIBUTE = 'data-kp-select-next-key';
/** The key that moves the cursor to the next row when the host names none. */
export const SELECT_NEXT_KEY = 'j';
/** On the host: the key that moves the cursor to the previous row. */
export const SELECT_PREV_KEY_ATTRIBUTE = 'data-kp-select-prev-key';
/** The key that moves the cursor to the previous row when the host names none. */
export const SELECT_PREV_KEY = 'k';
/** On the host: the key that ticks the cursor row (with Shift it ticks the range). */
export const SELECT_TICK_KEY_ATTRIBUTE = 'data-kp-select-tick-key';
/** The key that ticks the cursor row when the host names none; either case counts. */
export const SELECT_TICK_KEY = 'x';
/** On the host: the key that ticks every row shown (with Shift it unticks them); `false` or `none` turns it off. */
export const SELECT_ALL_KEY_ATTRIBUTE = 'data-kp-select-all-key';
/** The key that ticks every row shown when the host names none. */
export const SELECT_ALL_KEY = 'Mod+A';
