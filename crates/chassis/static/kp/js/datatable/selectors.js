// The selectors and class names the data table finds its parts by.

export const TABLE = '[data-kp-datatable]';
export const SEARCH = '[data-kp-datatable-search]';
export const SCOPE = '[data-kp-datatable-scope]';
export const DENSITY = '[data-kp-datatable-density]';
export const STATUS = '[data-kp-datatable-status]';
export const PAGER = '[data-kp-datatable-pager]';
export const EMPTY = '[data-kp-datatable-empty]';
export const CLEAR = '[data-kp-datatable-clear]';
export const LOADING = '[data-kp-datatable-loading]';
export const FAILED = '[data-kp-datatable-failed]';
export const RETRY = '[data-kp-datatable-retry]';
export const ACTIONS = '[data-kp-datatable-actions]';
export const SELECTED_COUNT = '[data-kp-datatable-selected-count]';
export const CLEAR_SELECTION = '[data-kp-datatable-clear-selection]';
export const FILTERS = '[data-kp-datatable-filters]';
export const FILTER_TOGGLE = '[data-kp-datatable-filter-toggle]';
export const PILLS = '[data-kp-datatable-pills]';
export const ADD_FILTER = '[data-kp-datatable-add-filter]';
export const CARD_SORT = '[data-kp-datatable-card-sort]';
export const SELECT_ALL = '[data-kp-select-all]';
export const SELECT_ROW = '[data-kp-select-row]';
export const SORT_SUMMARY = '[data-kp-datatable-sort-summary]';
export const SORT_RESET = '[data-kp-datatable-sort-reset]';
export const EXPAND_ALL = '[data-kp-datatable-expand-all]';
export const COLLAPSE_ALL = '[data-kp-datatable-collapse-all]';
export const EXPAND_COLUMN = '[data-kp-expand-column]';
export const REORDER_COLUMN = '[data-kp-reorder-column]';
export const REORDER_HANDLE = '[data-kp-reorder-handle]';
export const ROW_TOGGLE = '[data-kp-row-toggle]';
/** A heading row that folds the rows of its group [J2]. */
export const GROUP_ROW = '[data-kp-row-group]';
export const GROUP_TOGGLE = '[data-kp-group-toggle]';
/** A slot in a group row that the table writes the group's matched row count into. */
export const GROUP_COUNT = '[data-kp-group-count]';
/** What in a row answers a click itself, so the click does not also open the row. */
export const ROW_CONTROLS =
    'a[href], button, input, select, textarea, label, summary, details, [contenteditable=""], [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
/** A detail row, directly after the row it belongs to. */
export const DETAIL = '[data-kp-row-detail]';
/**
 * A row the page holds out of the table for a while (an Undo window): `<tr data-kp-row-hidden>`. The table does not count
 * it, page it, search it or show it, and never un-hides it; the page takes the attribute off to give it back
 * [b3b4-1019; kyu gap 28].
 */
export const HELD_ROW = '[data-kp-row-hidden]';
export const EDIT_CELL = '[data-kp-edit-cell]';
export const EDIT_VALUE = '[data-kp-edit-value]';
export const EDITOR_WRAP = '[data-kp-datatable-editor-wrap]';
export const SKELETON_ROW = '[data-kp-skeleton-row]';
/** The package's own checkbox [gap-13]: every register already answers it. */
export const CHECK_CLASS = 'kp-field__check';
