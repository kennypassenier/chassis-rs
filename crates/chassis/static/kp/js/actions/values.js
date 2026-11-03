// The selectors and the event of the row buttons: the button box, the list that shares columns, the lists the keyboard walks.

/** A row's button box. */
export const ROW_ACTIONS = '.kp-row-actions';

/** A list or table whose rows' buttons share columns. */
export const ACTION_LIST = '.kp-action-list, table';

/** A list whose rows the keyboard walks. */
export const ROW_KEYS = '[data-kp-row-keys]';
/** Fired on a row, bubbling, when Enter is pressed on the row itself: `{ row }`. */
export const ROW_OPEN_EVENT = 'kp-row-open';

/** On the actions host: the key that moves to the next row (a key spec, js/key-spec.js; `none` for none; the Down arrow always works). */
export const ROW_NEXT_KEY_ATTRIBUTE = 'data-kp-row-next-key';
/** The key that moves to the next row when the host names none. */
export const ROW_NEXT_KEY = 'j';
/** On the actions host: the key that moves to the previous row (the Up arrow always works). */
export const ROW_PREV_KEY_ATTRIBUTE = 'data-kp-row-prev-key';
/** The key that moves to the previous row when the host names none. */
export const ROW_PREV_KEY = 'k';
