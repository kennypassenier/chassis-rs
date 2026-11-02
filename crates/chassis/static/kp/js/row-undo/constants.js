// The selectors, attribute names and events of the row deleted with Undo [ux-1101].

/** A control that deletes its row with Undo; its value, when it has one, is the row's name in the toast. */
export const ROW_DELETE = '[data-kp-row-delete]';
/** What counts as the row a control deletes: a row with a key, a table row, a list item. */
export const ROW = '[data-kp-row-key], tr, li';
/** The row's name in the toast, when the control does not carry it. */
export const NAME_ATTRIBUTE = 'data-kp-row-name';
/** Written on a row while its delete waits for the Undo window to close. */
export const DELETING_ATTRIBUTE = 'data-kp-row-deleting';
/** The data table's own mark for a row held out of the table (js/datatable.js); its count and pager follow it. */
export const TABLE_HIDDEN_ATTRIBUTE = 'data-kp-row-hidden';

/** Fired on the row, bubbling and cancelable, before it is taken away: `detail` `{ row, key, name }`. Cancel it to keep the row. */
export const ROW_DELETE_EVENT = 'kp-row-delete';
/**
 * Fired on the row's list or table, bubbling, when the Undo window closed and the delete is for good: `detail`
 * `{ row, key, name, waitUntil(promise) }`. Hand `waitUntil` the server's delete: a rejection puts the row back and the toast
 * says why. The row leaves the page once the promise resolves.
 */
export const ROW_COMMIT_EVENT = 'kp-row-delete-commit';
/** Fired on the row, bubbling, when Undo put it back: `detail` `{ row, key, name }`. */
export const ROW_UNDO_EVENT = 'kp-row-delete-undo';
