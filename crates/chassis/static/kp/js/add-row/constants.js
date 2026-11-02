// The selectors, attribute names and event of the add row [forms-1102].

/** An add row: a `form[data-kp-form]` that adds one line. */
export const ADD_ROW = '[data-kp-addrow]';
/** The id of the data table whose columns the fields stand under (none: a line in a form grid). */
export const ADD_ROW_FOR = 'data-kp-addrow-for';
/** On a field's cell: the column it stands under, by id (`data-kp-field`, else its words) or number. */
export const ADD_ROW_COLUMN = 'data-kp-addrow-column';
/** On the row: the column the Add button stands under (default: the last column that holds no field, else a track of its own). */
export const ADD_ROW_SUBMIT_COLUMN = 'data-kp-addrow-submit-column';
/** Written on the row while its fields stand under each other (the table shows cards, or the row is narrower than the fold). */
export const STACKED = 'data-kp-addrow-stacked';
/** The width of its own under which a line in a form grid stacks; a table's row stacks with the table's cards. */
export const FOLD_AT_REM = 30;
/** The cell that holds a field. */
export const CELL = '.kp-addrow__cell';
/** The cell that holds the Add button. */
export const SUBMIT_CELL = '.kp-addrow__submit';
/** The line under the row that says why the page refused the new line. */
export const REFUSAL = '[data-kp-addrow-refusal]';
/** Fired, cancelable, on the row when a valid line is added: `{ values, data, waitUntil(promise) }`. */
export const ADD_EVENT = 'kp-addrow-add';
/** Fired on the row once the line was added and the fields were emptied: `{ values }`. */
export const ADDED_EVENT = 'kp-addrow-added';
