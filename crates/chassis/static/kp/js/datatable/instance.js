// The table instances, their handles and the default filter.
/** @typedef {import('./events.js').Density} Density */
/** @typedef {import('./sort.js').Filter} Filter */
/** @typedef {import('./events.js').FilterValue} FilterValue */
/** @typedef {import('./events.js').Sort} Sort */
/** @typedef {import('./events.js').SortKey} SortKey */
/** @typedef {import('./events.js').State} State */
/** @typedef {import('./events.js').View} View */

/** @type {Filter} */
export const defaultFilter = (row, query) => (row.textContent ?? '').toLowerCase().includes(query);
/**
 * @typedef {object} DataTableHandle
 * @property {HTMLElement} element
 * @property {() => View} view
 * @property {(sort: Sort) => void} sort  sort on one column, or null for none
 * @property {(keys: readonly SortKey[]) => void} sortBy  sort on several columns, the first key first
 * @property {(page: number) => void} page  show a page, counted from 0 as `view().page` is (the pager prints it from 1: `view().pageNumber`); past the last page it stops at the last [b3b4-1019]
 * @property {(size: number) => void} pageSize
 * @property {(query: string) => void} query
 * @property {(column: number | string | null) => void} scope  limit the search to one column, or null for all; a column by number or by its id (`data-kp-field`, else its text) [wish-1028]
 * @property {(id: string) => number} columnIndex  the number of the column with this id (`data-kp-field`, else its text), counting the control column; -1 when none [wish-1028, homelab 136]
 * @property {(column: number | string, value: FilterValue | null) => void} filter  set one column's filter; null clears it; the column by number or by its id [wish-1028]
 * @property {() => void} clearFilters
 * @property {(column: number | string | null) => void} editFilter  open a column's filter editor, or close it with null; in the panel mode, open or close the panel
 * @property {(columns: readonly number[]) => void} hideColumns  the columns to hide; a locked column stays
 * @property {(keys: readonly string[]) => void} expand  the rows to open, by key; in a `data-kp-expand-single` table only the last key opens
 * @property {(keys: readonly string[]) => void} fold  the group rows to fold, by group key; every other group unfolds [J2]
 * @property {(density: Density) => void} density
 * @property {(state: State) => void} state  loading, failed, or ready again
 * @property {(words?: string | null | { text?: string | null, since?: number | Date | null, overlay?: boolean }) => void} busy  the status line's words while the table loads, kept across refresh(), shown only while loading, cleared with no text [fix-80]; with `since` (a time or a Date) the table counts how long it has been loading by itself, in a part the live region does not announce [fix-84]; with `overlay: true` (or `data-kp-busy-overlay` on the wrapper) a large spinner with those words and that count sits over the rows while it loads, aria-hidden
 * @property {(reason?: string | null) => void} fail  the failed state with the app's reason in the failed slot's words, and Try again under them; any table, not only a server's [fix-85]
 * @property {() => void} reload  ask the server again for what the table shows
 * @property {(key: string, column: number) => void} edit  open a cell's editor
 * @property {() => void} cancelEdit
 * @property {(which?: 'view' | 'page') => HTMLTableRowElement[]} rows  the rows the table shows, in order: every page of the view, or this page
 * @property {() => string[]} selected
 * @property {(keys: readonly string[]) => void} select
 * @property {(options?: { keepPage?: boolean }) => void} refresh re-read the rows after the consumer added or removed some, and the filter panel's choice lists with them; the page goes back to the first unless `keepPage`. The table also notices rows added to or removed from its body by itself (a client-side table), so a removed row leaves the count and the pager at once and the reader stays on the page; a row marked `data-kp-row-hidden` is held out of the table and stays hidden until the attribute goes [b3b4-1019]
 */

/** @type {WeakMap<Element, DataTableHandle>} */
export const handles = new WeakMap();
/** The handle for an attached table, for code that did not call attach. @param {Element} element */
export function dataTable(element) {
    return handles.get(element) ?? null;
}
