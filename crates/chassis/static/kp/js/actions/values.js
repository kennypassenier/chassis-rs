// The selectors and the event of the row buttons: the button box, the list that shares columns, the lists the keyboard walks.

/** A row's button box. */
export const ROW_ACTIONS = '.kp-row-actions';

/** A list or table whose rows' buttons share columns. */
export const ACTION_LIST = '.kp-action-list, table';

/** A list whose rows the keyboard walks. */
export const ROW_KEYS = '[data-kp-row-keys]';
/** Fired on a row, bubbling, when Enter is pressed on the row itself: `{ row }`. */
export const ROW_OPEN_EVENT = 'kp-row-open';
