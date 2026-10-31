// DataTable, framework-free [TH37].
//
// The features are measured against TanStack Table, which is what "the
// best in 2026" means: sorting, per-column and global filtering,
// pagination, column visibility, row selection, expandable rows. What is
// deliberately absent is virtualisation and export — the handle hands an
// app the rows it shows, which is all an export needs.
//
// **This works on a table the server already rendered.** It sorts and
// filters the rows that are in the DOM, and it owns no data. kyu and
// almanac render their HTML from a Rust binary, so a table that only exists
// after JavaScript runs would leave them with an empty box on first paint —
// and a table is exactly the thing a reader needs before the scripts
// arrive. A table that asks a server for its rows (`data-kp-server`) is the
// one exception, and it asks for exactly what the reader chose.
//
//   <div class="kp-datatable" data-kp-datatable data-kp-cards data-kp-max-height="24rem">
//     <div class="kp-datatable__bar">
//       <input class="kp-datatable__search" data-kp-datatable-search type="search" />
//       <select class="kp-field__input kp-datatable__select" data-kp-datatable-scope></select>
//       <select class="kp-field__input kp-datatable__select" data-kp-datatable-density></select>
//     </div>
//     <div class="kp-datatable__actions" data-kp-datatable-actions hidden>
//       <span data-kp-datatable-selected-count></span> …the app's buttons…
//     </div>
//     <div class="kp-table-wrap">
//       <table class="kp-table">
//         <caption>Incidents</caption>
//         <thead><tr>
//           <th><input type="checkbox" data-kp-select-all /></th>
//           <th data-kp-sort="text" data-kp-filter="choice">Site</th>
//           <th data-kp-sort="text" data-kp-sort-order="Low,Medium,High,Critical">Severity</th>
//           <th data-kp-sort="number" data-kp-filter="range">Hours</th>
//           <th data-kp-sort="date" data-kp-filter="date">Opened</th>
//         </tr></thead>
//         <tbody>…</tbody>
//       </table>
//     </div>
//     <div class="kp-empty" data-kp-datatable-empty hidden>… <button data-kp-datatable-clear>…</button></div>
//     <div class="kp-datatable__bar">
//       <p class="kp-datatable__status" data-kp-datatable-status role="status" aria-live="polite"></p>
//       <div class="kp-datatable__pager" data-kp-datatable-pager></div>
//     </div>
//   </div>
//
// The wrapper was optional until 3.2.0 and is now what carries the
// keyboard-reachable scroll region [TH95] and the container query the
// card layout reads [TH96, AR24]. Without it a wide table still scrolls
// the page sideways and the cards fall back to the whole datatable's
// width, which is the same number in every layout this package draws.
//
// The hard part of a data table is not the features. It is that a sighted
// user sees the rows rearrange and everyone else is told nothing: the sort
// state has to live in `aria-sort`, and the row count after a filter has
// to be announced. That is where nearly every implementation stops short,
// so both are asserted by the suite rather than left to care.
//
// Since 3.0.0 [KT6]: the view — sort, page, query, selection — is readable
// and settable through the handle attach returns, so a consumer can put
// it in the URL and bring it back; the comparator collates in the page's
// locale rather than in Dutch; a header sorts from the keyboard; detach
// restores the row order the server rendered, which the first version
// left permanently sorted; and every knob is a data-attribute or an
// option.
//
// Round eight [gap-13, Kenny 2026-09-13]: search limited to one column,
// per-column filters declared on the header with removable pills, a sort
// order per column, a density choice that reaches the search box, a
// page-size choice (25 by default), selection scoped to the page with an
// action bar slot, a sticky header under a max height, loading and failed
// states, a sort control for the card layout, the package's own themed
// checkboxes, and the rows the table shows handed to the app.
//
// The seven of Kenny's form of 2026-09-13 ("Alle zeven, nu"), each as its
// approved mock in research/datatable/demo.html, each off until the markup
// asks for it:
//
//   data-kp-sort-multi       Shift + click adds a sort key; the header numbers the keys
//                            ="click": a plain click adds it, Shift + click sorts on it alone
//   data-kp-column-menu      a menu of columns, the key column locked
//   data-kp-expandable       a button opens a detail row the consumer supplies
//                            The toggle is a column of its own, the first: every column number the handle takes or
//                            gives (sort, scope, filter, hideColumns, view().sorts) counts it, so the first data
//                            column of an expandable table is 1, not 0 [b3b4-1019].
//   data-kp-fixed-columns    the key column stays while the box scrolls sideways
//   data-kp-fixed-end="n"    the last n columns stay at the end while the box scrolls sideways (an action column) [datatable-r5-1019, O22]
//                            A column can be named by its id instead, so a page never counts the control column [wish-1028, homelab 136]:
//                            the header's `data-kp-field`, else its text. `filter("status", …)`, `scope("status")`, `editFilter("status")`
//                            take the id as well as the number, `columnIndex("status")` gives the number, and `view().filtersByField`
//                            (and a server `load` request's) holds the filters under the ids. The numbers keep working.
//   data-kp-filter-ui="none" the header filters stay (handle.filter, the view, events) but the table draws no Filters button,
//                            panel, "+ Add filter" or pills: the page draws its own (chips) [datatable-r5-1019, O22]
//   data-kp-cards            on a phone the rows become cards: a label track and a value track that every line of a card shares;
//                            a cell without data-label gets the header's words [datatable-r5-1019, B2, N20]
//                            ="spread" keeps the older look: label left, value pushed right
//   data-kp-server           the rows come from the consumer's `load`, stale answers dropped
//   th data-kp-edit          a value is edited in its cell; the app hears it and may refuse it
//   td data-kp-sort-value    the value a cell sorts and range/date-filters by in place of the text it shows
//   data-kp-sort-external    the page sorts [kpadopt4]: a header press draws the arrow, aria-sort, the key
//                            numbers, the summary and Reset, remembers the sort and fires kp-datatable-sort,
//                            and the rows stay in the order the page renders them (it reorders, then calls
//                            refresh()); th aria-disabled="true" is a column that cannot be sorted now
//   td data-kp-filter-value  the word a choice filter lists and matches a cell by in place of the text it shows [kpadopt3]
//                            (on a header the same attribute is the filter the page opens with)
//   data-kp-grid             a roving focus grid: arrows, Home/End, Page Up/Down
//
// And the add-filter mode of Kenny's form of 2026-09-14 ("Allebei, per
// tabel"), the approved mock of research/datatable/demo.html#filter-add:
//
//   data-kp-filter-mode="add"  "+ Add filter" opens a menu of the filterable
//                              columns; each filter is added in an editor
//                              and shown as one pill that reopens it. The
//                              panel stays the default, and both keep the
//                              same filter state, handle and events.
//
// And three for the homelab hand-off [J2, scope-143], each off until the
// markup asks for it:
//
//   data-kp-expand-single      opening one row closes the row that was open (read again when the attribute changes)
//   tr data-kp-row-group="g"   a heading row that folds the rows marked
//                              data-kp-group-of="g"; a sort orders the rows
//                              within their group, the groups keep their place
//   Enter or Space on a row (or a cell) that holds the focus itself opens it
//                              as a click does, and folds a group row
//
// and the `decorate(part, info)` option, called for every row toggle and
// group toggle this builds, so a consumer can mark the controls it drives.
//
// Inline editing and the keyboard grid reverse the "left out" of TH42: the
// APG grid pattern is right for a table a person edits, and Kenny asked for
// both.

export { GROUP_ROW, DETAIL, HELD_ROW } from './datatable/selectors.js';
export {
    VIEW_EVENT,
    SELECT_EVENT,
    SORT_EVENT,
    RETRY_EVENT,
    COLUMNS_EVENT,
    EXPAND_EVENT,
    REQUEST_EVENT,
    EDIT_EVENT,
    GROUP_EVENT,
    REORDER_EVENT,
    PAGE_SIZE,
    PAGE_SIZES,
    SERVER_DEBOUNCE_MS,
    GRID_PAGE_ROWS,
} from './datatable/events.js';
export { compare, compareByOrder, nextSorts } from './datatable/sort.js';
export { filterActive, boundText, filterPillLabel, readFilterBounds, matchesFilter, filterPills } from './datatable/filter.js';
export { syncFixedColumns, watchScrolled, attachGrid } from './datatable/grid.js';
export { dataTable } from './datatable/instance.js';
export { attachDataTables } from './datatable/attach.js';
export { attachCardsAt, attachTableActionColumns, thresholdPx } from './datatable/layout-hooks.js';

/** @typedef {import('./datatable/events.js').Direction} Direction */
/** @typedef {import('./datatable/events.js').Sort} Sort */
/** @typedef {import('./datatable/events.js').SortKey} SortKey */
/** @typedef {import('./datatable/events.js').FilterKind} FilterKind */
/** @typedef {import('./datatable/events.js').FilterValue} FilterValue */
/** @typedef {import('./datatable/events.js').State} State */
/** @typedef {import('./datatable/events.js').Density} Density */
/** @typedef {import('./datatable/events.js').EditKind} EditKind */
/** @typedef {import('./datatable/events.js').View} View */
/** @typedef {import('./datatable/events.js').DataRequest} DataRequest */
/** @typedef {import('./datatable/events.js').DataAnswer} DataAnswer */
/** @typedef {import('./datatable/events.js').EditDetail} EditDetail */
/** @typedef {import('./datatable/sort.js').Compare} Compare */
/** @typedef {import('./datatable/sort.js').Filter} Filter */
/** @typedef {import('./datatable/grid.js').GridHandle} GridHandle */
/** @typedef {import('./datatable/instance.js').DataTableHandle} DataTableHandle */
/** @typedef {import('./datatable/attach.js').DataTableOptions} DataTableOptions */
/** @typedef {import('./datatable/attach.js').DataTableDecorateInfo} DataTableDecorateInfo */
