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
//   data-kp-column-menu      a menu of columns, the key column locked
//   data-kp-expandable       a button opens a detail row the consumer supplies
//   data-kp-fixed-columns    the key column stays while the box scrolls sideways
//   data-kp-server           the rows come from the consumer's `load`, stale answers dropped
//   th data-kp-edit          a value is edited in its cell; the app hears it and may refuse it
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
// Inline editing and the keyboard grid reverse the "left out" of TH42: the
// APG grid pattern is right for a table a person edits, and Kenny asked for
// both.

import { getStrings } from './strings.js';
import { collator, parseNumber, resolveLocale } from './locale.js';
import { attachTableRegions } from './tables.js';
import { attachDatePickers, datePicker, DATE_EVENT } from './datepicker.js';
import { attachSelect, drawsSelect } from './combobox.js';
import { columnId, paintRemembered } from './remember.js';

const TABLE = '[data-kp-datatable]';
const SEARCH = '[data-kp-datatable-search]';
const SCOPE = '[data-kp-datatable-scope]';
const DENSITY = '[data-kp-datatable-density]';
const STATUS = '[data-kp-datatable-status]';
const PAGER = '[data-kp-datatable-pager]';
const EMPTY = '[data-kp-datatable-empty]';
const CLEAR = '[data-kp-datatable-clear]';
const LOADING = '[data-kp-datatable-loading]';
const FAILED = '[data-kp-datatable-failed]';
const RETRY = '[data-kp-datatable-retry]';
const ACTIONS = '[data-kp-datatable-actions]';
const SELECTED_COUNT = '[data-kp-datatable-selected-count]';
const CLEAR_SELECTION = '[data-kp-datatable-clear-selection]';
const FILTERS = '[data-kp-datatable-filters]';
const FILTER_TOGGLE = '[data-kp-datatable-filter-toggle]';
const PILLS = '[data-kp-datatable-pills]';
const ADD_FILTER = '[data-kp-datatable-add-filter]';
const CARD_SORT = '[data-kp-datatable-card-sort]';
const SELECT_ALL = '[data-kp-select-all]';
const SELECT_ROW = '[data-kp-select-row]';
const SORT_SUMMARY = '[data-kp-datatable-sort-summary]';
const SORT_RESET = '[data-kp-datatable-sort-reset]';
const EXPAND_ALL = '[data-kp-datatable-expand-all]';
const COLLAPSE_ALL = '[data-kp-datatable-collapse-all]';
const EXPAND_COLUMN = '[data-kp-expand-column]';
const ROW_TOGGLE = '[data-kp-row-toggle]';
/** A detail row, directly after the row it belongs to. */
export const DETAIL = '[data-kp-row-detail]';
const EDIT_CELL = '[data-kp-edit-cell]';
const EDIT_VALUE = '[data-kp-edit-value]';
const EDITOR_WRAP = '[data-kp-datatable-editor-wrap]';
const SKELETON_ROW = '[data-kp-skeleton-row]';
/** The package's own checkbox [gap-13]: every register already answers it. */
const CHECK_CLASS = 'kp-field__check';

/** @typedef {'ascending' | 'descending' | 'none'} Direction */
/** @typedef {{ column: number, direction: Direction } | null} Sort */
/** One key of a sort on several columns. @typedef {{ column: number, direction: 'ascending' | 'descending' }} SortKey */
/** @typedef {'choice' | 'range' | 'date'} FilterKind */
/** A choice filter's ticked values, or a range's bounds as typed. @typedef {string[] | { from?: string, to?: string }} FilterValue */
/** @typedef {'ready' | 'loading' | 'failed'} State */
/** @typedef {'comfortable' | 'compact'} Density */
/** @typedef {'text' | 'number' | 'select' | 'date'} EditKind */
/**
 * @typedef {{ shown: number, total: number, page: number, pages: number, pageSize: number, query: string, scope: number | null,
 *   filters: Record<number, FilterValue>, sort: Sort, sorts: SortKey[], hidden: number[], expanded: string[], density: Density, state: State,
 *   keys: string[], pageKeys: string[] }} View
 */
/**
 * What a server-backed table asks its `load` for [Kenny, 2026-09-13].
 * @typedef {{ id: number, query: string, scope: number | null, sort: SortKey | null, sorts: SortKey[], filters: Record<number, FilterValue>,
 *   page: number, pageSize: number, signal: AbortSignal }} DataRequest
 */
/**
 * What `load` answers: one page of rows — table rows, or objects read through each header's `data-kp-field` — and how many
 * rows there are in all.
 * @typedef {{ rows: ReadonlyArray<HTMLTableRowElement | Record<string, unknown>>, total: number }} DataAnswer
 */
/**
 * An edit about to be saved. `reject(message)` refuses it with a message the cell shows; `waitUntil(promise)` holds the
 * save until the promise settles, and a promise that resolves to a string or to false refuses it too.
 * @typedef {{ key: string, row: HTMLTableRowElement, cell: HTMLTableCellElement, column: number, label: string, value: string,
 *   previous: string, undo: boolean, reject: (message?: string) => void, waitUntil: (promise: Promise<unknown>) => void }} EditDetail
 */

/** Fired on the wrapper when the visible set changes. A contract value [TH26]. Detail: View, plus `rows` and `pageRows` (the elements). */
export const VIEW_EVENT = 'kp-datatable-view';
/** Fired when the selection changes; the detail carries the selected row keys and rows. */
export const SELECT_EVENT = 'kp-datatable-select';
/** Fired when the sort changes: `{ column, direction }` or null — the first key; the view carries all of them as `sorts`. */
export const SORT_EVENT = 'kp-datatable-sort';
/** Fired when the failed state's retry control is pressed; the app loads again and sets the state. */
export const RETRY_EVENT = 'kp-datatable-retry';
/** Fired when the reader shows or hides a column: `{ hidden }`, the column indices. */
export const COLUMNS_EVENT = 'kp-datatable-columns';
/** Fired when a row opens or closes: `{ key, row, open, cell, expanded }`; `cell` is the detail cell, for an app that fills it then. */
export const EXPAND_EVENT = 'kp-datatable-expand';
/** Fired when a server-backed table needs rows: the DataRequest, plus `respond(answer)` and `fail(error)`. */
export const REQUEST_EVENT = 'kp-datatable-request';
/** Fired, cancelable, when an edited value is about to be saved (EditDetail); `preventDefault()` refuses it. */
export const EDIT_EVENT = 'kp-datatable-edit';

/** Rows per page when the consumer does not say [Kenny, 2026-09-13]. Per table as `data-kp-page-size`. */
export const PAGE_SIZE = 25;
/** The page sizes on offer when the consumer does not say. Per table as `data-kp-page-sizes="10,25"`, or `none`. */
export const PAGE_SIZES = Object.freeze([10, 25, 50, 100]);
/** How long a server-backed table waits after the last key before it asks [research/datatable, "300 ms server"]. */
export const SERVER_DEBOUNCE_MS = 300;
/** Rows Page Up and Page Down move in the keyboard grid, as the approved mock does. */
export const GRID_PAGE_ROWS = 5;

/** @typedef {(a: string, b: string, kind: string, locale: string) => number} Compare */
/** @typedef {(row: HTMLTableRowElement, query: string) => boolean} Filter */

/**
 * Compare two cells the way their column asks to be compared.
 *
 * A number column sorted as text puts 100 before 20, which is the single
 * most common data-table bug and the reason the column declares its type
 * rather than the code guessing from the first row. Numbers and text are
 * read in the locale: "1.284,50" is a number in Dutch and "1,284.50" in
 * English, and both sort correctly on their own page.
 *
 * @type {Compare}
 */
export function compare(a, b, kind, locale) {
    if (kind === 'number') {
        const left = parseNumber(a, locale);
        const right = parseNumber(b, locale);
        if (Number.isNaN(left) || Number.isNaN(right)) return collator(locale).compare(a, b);
        return left - right;
    }
    if (kind === 'date') {
        const left = Date.parse(a);
        const right = Date.parse(b);
        if (Number.isNaN(left) || Number.isNaN(right)) return collator(locale).compare(a, b);
        return left - right;
    }
    // A collator, not <: "Zoetermeer" before "école" is wrong in every
    // language a consumer's labels are written in.
    return collator(locale).compare(a, b);
}

/**
 * Compare two cells by a declared order, "Low,Medium,High,Critical" [gap-13].
 *
 * Severity sorted as text reads Critical, High, Low, Medium: alphabetical
 * and meaningless. A value the order does not name sorts after every value
 * it does, by the column's own comparison, so a stray "Unknown" neither
 * disappears nor jumps to the top.
 *
 * @param {readonly string[]} order
 * @param {string} a
 * @param {string} b
 * @param {(a: string, b: string) => number} fallback
 */
export function compareByOrder(order, a, b, fallback) {
    const rank = (/** @type {string} */ value) => {
        const at = order.findIndex((entry) => entry.trim().toLowerCase() === value.trim().toLowerCase());
        return at === -1 ? order.length : at;
    };
    return rank(a) - rank(b) || fallback(a, b);
}

/**
 * The next sort keys after a header press [Kenny, 2026-09-13, #multi-sort].
 *
 * A plain press sorts on that column alone, turning it round when it already
 * was the only key. With `add` (Shift) the column joins the keys as the
 * last one, turns round when it is a key already, and leaves the keys on
 * its third press. Both channels call this, so they cannot disagree on
 * what a press does.
 *
 * @template K
 * @param {{ column: K, direction: 'ascending' | 'descending' }[]} keys
 * @param {K} column
 * @param {{ add?: boolean, cycle?: 'two' | 'three' }} [options]
 * @returns {{ column: K, direction: 'ascending' | 'descending' }[]}
 */
export function nextSorts(keys, column, { add = false, cycle = 'two' } = {}) {
    const current = keys.find((key) => key.column === column);
    if (add) {
        if (current === undefined) return [...keys, { column, direction: 'ascending' }];
        if (current.direction === 'ascending') return keys.map((key) => (key.column === column ? { column, direction: 'descending' } : key));
        return keys.filter((key) => key.column !== column);
    }
    if (current !== undefined && keys.length === 1) {
        if (current.direction === 'ascending') return [{ column, direction: 'descending' }];
        return cycle === 'three' ? [] : [{ column, direction: 'ascending' }];
    }
    return [{ column, direction: 'ascending' }];
}

/** @param {string | undefined | null} attribute */
const splitList = (attribute) =>
    (attribute ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');

/**
 * Whether a filter holds anything; an empty one filters nothing.
 * @param {FilterKind} kind
 * @param {FilterValue | undefined} value
 */
export function filterActive(kind, value) {
    if (value === undefined) return false;
    if (kind === 'choice') return Array.isArray(value) && value.length > 0;
    const range = /** @type {{ from?: string, to?: string }} */ (value);
    return (range.from ?? '') !== '' || (range.to ?? '') !== '';
}

/**
 * The one pill a filter shows in the add-filter mode [Kenny, 2026-09-14]:
 * the column and every value the filter holds, or null when it holds
 * nothing. Both channels call this, so their pills read the same.
 *
 * @param {FilterKind} kind
 * @param {string} column the column's name
 * @param {FilterValue | undefined} value
 * @param {import('./strings.js').Strings} s
 * @returns {string | null}
 */
export function filterPillLabel(kind, column, value, s) {
    if (!filterActive(kind, value)) return null;
    if (kind === 'choice') return s.tableFilterChoicePill(column, /** @type {string[]} */ (value));
    const { from = '', to = '' } = /** @type {{ from?: string, to?: string }} */ (value);
    return s.tableFilterSpanPill(column, from, to, kind);
}

/**
 * Read the two bounds of an add-filter editor into a filter value, or say
 * what is wrong with them [Kenny, 2026-09-14, #filter-add]: a number bound
 * that is not a number, a date the picker cannot read, a range that runs
 * backwards. A value of null with no error means both bounds are empty, and
 * applying that removes the filter. Both channels call this.
 *
 * @param {'range' | 'date'} kind
 * @param {Record<'from' | 'to', { text: string, iso?: string, label: string }>} bounds  `text` as the field shows it; `iso` a date picker's value
 * @param {import('./strings.js').Strings} s
 * @returns {{ value: { from: string, to: string } | null, error?: string, bound?: 'from' | 'to' }}
 */
export function readFilterBounds(kind, bounds, s) {
    const value = { from: '', to: '' };
    for (const bound of /** @type {const} */ (['from', 'to'])) {
        const { text, iso, label } = bounds[bound];
        const typed = text.trim();
        if (typed === '') continue;
        if (kind === 'range') {
            if (!Number.isFinite(Number(typed))) return { value: null, error: s.tableFilterNotNumber(label, typed), bound };
            value[bound] = typed;
        } else {
            if (iso === undefined || iso === '') return { value: null, error: s.tableFilterNotDate(label, typed), bound };
            value[bound] = iso;
        }
    }
    const { from, to } = value;
    if (from !== '' && to !== '' && (kind === 'range' ? Number(from) > Number(to) : from > to))
        return { value: null, error: s.tableFilterBackwards(from, to), bound: 'from' };
    return { value: from === '' && to === '' ? null : value };
}

/**
 * Whether a cell's text passes a column's filter [gap-13].
 *
 * A range reads the cell in the page's locale, the way the sort does; a
 * date reads it as the date the cell writes, and the upper bound takes
 * the whole of its day, so "to 12 August" includes 12 August.
 *
 * @param {FilterKind} kind
 * @param {FilterValue | undefined} value
 * @param {string} text the cell's text
 * @param {string} locale
 */
export function matchesFilter(kind, value, text, locale) {
    if (!filterActive(kind, value)) return true;
    if (kind === 'choice') return /** @type {string[]} */ (value).includes(text.trim());
    const { from = '', to = '' } = /** @type {{ from?: string, to?: string }} */ (value);
    if (kind === 'range') {
        const n = parseNumber(text, locale);
        if (Number.isNaN(n)) return false;
        if (from !== '' && n < Number(from)) return false;
        if (to !== '' && n > Number(to)) return false;
        return true;
    }
    const at = Date.parse(text.trim());
    if (Number.isNaN(at)) return false;
    if (from !== '' && at < Date.parse(from)) return false;
    if (to !== '' && at > Date.parse(to) + (/^\d{4}-\d{2}-\d{2}$/.test(to) ? 86_399_999 : 0)) return false;
    return true;
}

/**
 * The pills an active filter shows, each with the value that removes it.
 *
 * @param {FilterKind} kind
 * @param {string} column the column's name
 * @param {FilterValue | undefined} value
 * @param {import('./strings.js').Strings} s
 * @returns {{ label: string, without: FilterValue | undefined }[]}
 */
export function filterPills(kind, column, value, s) {
    if (!filterActive(kind, value)) return [];
    if (kind === 'choice') {
        const list = /** @type {string[]} */ (value);
        return list.map((item) => ({ label: s.tableFilterValue(column, item), without: list.filter((other) => other !== item) }));
    }
    const { from = '', to = '' } = /** @type {{ from?: string, to?: string }} */ (value);
    return [{ label: s.tableFilterRange(column, from || s.tableFilterOpenEnd, to || s.tableFilterOpenEnd), without: undefined }];
}

/**
 * Whether an element takes part in layout: not hidden by the attribute and
 * not by a stylesheet (the card layout hides the header row, a narrow
 * table hides `.kp-col-low`).
 *
 * @param {Element} element
 */
const shown = (element) => !(/** @type {HTMLElement} */ (element).hidden) && getComputedStyle(element).display !== 'none';

/**
 * Keep the leading columns of a table in place while its box scrolls
 * sideways [Kenny, 2026-09-13, #sticky]. Measures the header cells and
 * writes, on every cell of the first `count` columns, `data-kp-fixed`
 * (`last` on the one that draws the hairline) and the offset it sticks at
 * as `--kp-datatable-fixed-start`; the stylesheet does the sticking. Call
 * it again after the columns change; both channels do.
 *
 * @param {HTMLTableElement} table
 * @param {number} count how many leading columns stay; 0 takes the marks away
 */
export function syncFixedColumns(table, count) {
    const head = table.tHead?.rows[0];
    /** @type {Map<number, number>} */
    const starts = new Map();
    let last = -1;
    if (head !== undefined && count > 0) {
        let offset = 0;
        for (const cell of head.cells) {
            if (cell.cellIndex >= count) break;
            if (!shown(cell)) continue;
            starts.set(cell.cellIndex, offset);
            offset += cell.getBoundingClientRect().width;
            last = cell.cellIndex;
        }
    }
    for (const row of table.rows) {
        const whole = row.matches(DETAIL);
        for (const cell of row.cells) {
            const start = whole ? undefined : starts.get(cell.cellIndex);
            if (start === undefined) {
                if (cell.dataset.kpFixed !== undefined) {
                    delete cell.dataset.kpFixed;
                    cell.style.removeProperty('--kp-datatable-fixed-start');
                }
                continue;
            }
            cell.dataset.kpFixed = cell.cellIndex === last ? 'last' : '';
            cell.style.setProperty('--kp-datatable-fixed-start', `${Math.round(start * 100) / 100}px`);
        }
    }
}

/**
 * Mark a data table while its scroll box is scrolled away from the top
 * [scope-90]: `data-kp-scrolled` on `element` while `box.scrollTop` is
 * above 0, removed at the top. The stylesheet draws the sticky header's
 * reach (`fix-32`) only under it, so a caption right above the header is
 * not painted over at rest. One decision per frame, on a passive listener.
 * Both channels use this one.
 *
 * @param {HTMLElement} element the `.kp-datatable`
 * @param {HTMLElement} box its `.kp-table-wrap`, the box that scrolls
 * @returns {() => void} detach, which removes the attribute
 */
export function watchScrolled(element, box) {
    const view = box.ownerDocument.defaultView;
    let frame = 0;
    const decide = () => {
        frame = 0;
        element.toggleAttribute('data-kp-scrolled', box.scrollTop > 0);
    };
    const onScroll = () => {
        if (frame === 0 && view !== null) frame = view.requestAnimationFrame(decide);
    };
    decide();
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => {
        box.removeEventListener('scroll', onScroll);
        if (frame !== 0) view?.cancelAnimationFrame(frame);
        element.removeAttribute('data-kp-scrolled');
    };
}

/**
 * @typedef {object} GridHandle
 * @property {() => void} sync  re-read the rows and cells after they changed; keeps one cell in the tab order
 * @property {(row: number, column: number) => void} focus  move to a cell, by row index in the table and column
 * @property {() => void} detach
 */

/**
 * A roving focus grid over a table [Kenny, 2026-09-13, #keyboard; APG grid].
 *
 * Tab enters on one cell and leaves with the next Tab; inside, the arrow
 * keys move a cell at a time, Home and End go to the start and end of the
 * row, Ctrl + Home and Ctrl + End to the first and last cell, and Page Up
 * and Page Down `pageRows` rows. A cell that holds exactly one control — a
 * sort button, a checkbox, an edit button — hands the focus to that
 * control, so Enter and Space do what the control does. Hidden rows and
 * columns are stepped over, and keys pressed inside an open editor belong
 * to the editor. Both channels use this one.
 *
 * @param {HTMLTableElement} table
 * @param {{ pageRows?: number, onMove?: (position: { row: number, rows: number, column: number, cell: HTMLTableCellElement }) => void }} [options]
 * @returns {GridHandle}
 */
export function attachGrid(table, { pageRows = GRID_PAGE_ROWS, onMove } = {}) {
    const roleWas = table.getAttribute('role');
    table.setAttribute('role', 'grid');
    let at = { row: -1, column: 0 };
    /** Elements given a tabindex here, with the value they had. @type {Map<HTMLElement, string | null>} */
    const touched = new Map();

    const rows = () => [...table.rows].filter((row) => shown(row) && !row.matches(SKELETON_ROW) && row.cells.length > 0);
    /** @param {HTMLTableRowElement} row */
    const cellsOf = (row) => [...row.cells].filter(shown);
    /** The one control a cell hands its focus to, or the cell. @param {HTMLTableCellElement} cell */
    const targetOf = (cell) => {
        const controls = [...cell.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')].filter(
            (control) => control.closest(EDITOR_WRAP) === null && shown(control),
        );
        return /** @type {HTMLElement} */ (controls.length === 1 ? controls[0] : cell);
    };
    /** @param {HTMLElement} element @param {number} value */
    const setTab = (element, value) => {
        if (!touched.has(element)) touched.set(element, element.getAttribute('tabindex'));
        if (element.tabIndex !== value || !element.hasAttribute('tabindex')) element.tabIndex = value;
    };

    /** @returns {[HTMLTableRowElement[], number, number]} */
    const clamp = () => {
        const list = rows();
        const header = list.findIndex((row) => row.parentElement?.tagName !== 'THEAD');
        const row = at.row < 0 ? Math.max(header, 0) : Math.max(0, Math.min(list.length - 1, at.row));
        const cells = list[row] === undefined ? [] : cellsOf(list[row]);
        return [list, row, Math.max(0, Math.min(cells.length - 1, at.column))];
    };

    const sync = () => {
        const [list, row, column] = clamp();
        for (const tr of table.rows) {
            for (const cell of tr.cells) {
                setTab(cell, -1);
                for (const control of cell.querySelectorAll('button, a[href], input, select, textarea')) {
                    if (control.closest(EDITOR_WRAP) === null) setTab(/** @type {HTMLElement} */ (control), -1);
                }
            }
        }
        const current = list[row] === undefined ? undefined : cellsOf(list[row])[column];
        if (current !== undefined) setTab(targetOf(current), 0);
    };

    /** @param {number} row @param {number} column @param {boolean} [take] */
    const move = (row, column, take = true) => {
        const list = rows();
        if (list.length === 0) return;
        const r = Math.max(0, Math.min(list.length - 1, row));
        const cells = cellsOf(/** @type {HTMLTableRowElement} */ (list[r]));
        const c = Math.max(0, Math.min(cells.length - 1, column));
        at = { row: r, column: c };
        sync();
        const cell = cells[c];
        if (cell === undefined) return;
        if (take) targetOf(cell).focus();
        const header = list.filter((tr) => tr.parentElement?.tagName === 'THEAD').length;
        const bodyRows = list.filter((tr) => tr.parentElement?.tagName !== 'THEAD' && !tr.matches(DETAIL)).length;
        const bodyIndex = r < header ? 0 : list.slice(header, r + 1).filter((tr) => !tr.matches(DETAIL)).length;
        onMove?.({ row: bodyIndex, rows: bodyRows, column: c, cell });
    };

    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        if (target.closest(EDITOR_WRAP) !== null || event.altKey || event.metaKey) return;
        const [, row, column] = clamp();
        const ctrl = event.ctrlKey;
        /** @type {Record<string, [number, number]>} */
        const moves = {
            ArrowUp: [row - 1, column],
            ArrowDown: [row + 1, column],
            ArrowLeft: [row, column - 1],
            ArrowRight: [row, column + 1],
            Home: ctrl ? [0, 0] : [row, 0],
            End: ctrl ? [rows().length - 1, Number.MAX_SAFE_INTEGER] : [row, Number.MAX_SAFE_INTEGER],
            PageUp: [row - pageRows, column],
            PageDown: [row + pageRows, column],
        };
        const next = moves[event.key];
        if (next === undefined) return;
        // A text field keeps its own left, right, Home and End.
        if (target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select') && !event.key.startsWith('Page')) return;
        event.preventDefault();
        move(next[0], next[1]);
    };
    /** @param {FocusEvent} event */
    const onFocusIn = (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        if (target.closest(EDITOR_WRAP) !== null) return;
        const cell = /** @type {HTMLTableCellElement | null} */ (target.closest('td, th'));
        const tr = /** @type {HTMLTableRowElement | null} */ (cell?.parentElement ?? null);
        if (cell === null || tr === null || cell.closest('table') !== table) return;
        const list = rows();
        const r = list.indexOf(tr);
        const c = cellsOf(tr).indexOf(cell);
        if (r === -1 || c === -1) return;
        move(r, c, false);
    };

    table.addEventListener('keydown', onKey);
    table.addEventListener('focusin', onFocusIn);
    sync();
    return {
        sync,
        focus: (row, column) => move(row, column),
        detach: () => {
            table.removeEventListener('keydown', onKey);
            table.removeEventListener('focusin', onFocusIn);
            for (const [element, was] of touched) {
                if (was === null) element.removeAttribute('tabindex');
                else element.setAttribute('tabindex', was);
            }
            if (roleWas === null) table.removeAttribute('role');
            else table.setAttribute('role', roleWas);
        },
    };
}

/** @type {Filter} */
const defaultFilter = (row, query) => (row.textContent ?? '').toLowerCase().includes(query);

/**
 * @typedef {object} DataTableHandle
 * @property {HTMLElement} element
 * @property {() => View} view
 * @property {(sort: Sort) => void} sort  sort on one column, or null for none
 * @property {(keys: readonly SortKey[]) => void} sortBy  sort on several columns, the first key first
 * @property {(page: number) => void} page
 * @property {(size: number) => void} pageSize
 * @property {(query: string) => void} query
 * @property {(column: number | null) => void} scope  limit the search to one column, or null for all
 * @property {(column: number, value: FilterValue | null) => void} filter  set one column's filter; null clears it
 * @property {() => void} clearFilters
 * @property {(column: number | null) => void} editFilter  open a column's filter editor, or close it with null; in the panel mode, open or close the panel
 * @property {(columns: readonly number[]) => void} hideColumns  the columns to hide; a locked column stays
 * @property {(keys: readonly string[]) => void} expand  the rows to open, by key
 * @property {(density: Density) => void} density
 * @property {(state: State) => void} state  loading, failed, or ready again
 * @property {() => void} reload  ask the server again for what the table shows
 * @property {(key: string, column: number) => void} edit  open a cell's editor
 * @property {() => void} cancelEdit
 * @property {(which?: 'view' | 'page') => HTMLTableRowElement[]} rows  the rows the table shows, in order: every page of the view, or this page
 * @property {() => string[]} selected
 * @property {(keys: readonly string[]) => void} select
 * @property {() => void} refresh re-read the rows after the consumer added or removed some, and the filter panel's choice lists with them
 */

/** @type {WeakMap<Element, DataTableHandle>} */
const handles = new WeakMap();

/** The handle for an attached table, for code that did not call attach. @param {Element} element */
export function dataTable(element) {
    return handles.get(element) ?? null;
}

let instances = 0;

/**
 * @typedef {object} DataTableOptions
 * @property {string} [locale]
 * @property {Compare} [compare]
 * @property {Filter} [filter]
 * @property {number} [debounceMs]  Default 0, and 300 for a server-backed table.
 * @property {'two' | 'three'} [sortCycle]
 * @property {boolean} [multiSort]  Shift + click adds a sort key. Default false; per table `data-kp-sort-multi`.
 * @property {'panel' | 'add'} [filterMode]  How the header-declared filters are set: a panel of every filter, or "+ Add filter" with one pill per filter. Default panel; per table `data-kp-filter-mode`.
 * @property {string} [pagerClassName]
 * @property {(at: number, of: number) => string} [pageLabel]
 * @property {boolean} [regions]
 * @property {readonly number[]} [pageSizes]
 * @property {string} [removeGlyph]
 * @property {(row: HTMLTableRowElement) => Node | string | null | undefined} [detail]  A row's detail, built when it first opens.
 * @property {(request: DataRequest) => Promise<DataAnswer> | DataAnswer} [load]  The rows of a `data-kp-server` table.
 * @property {(row: Record<string, unknown>) => string} [rowKey]  The key of a row `load` answered as an object. Default the field `data-kp-row-key-field` names, else the key column's `data-kp-field`, else `key`, else `id`.
 * @property {(detail: EditDetail) => unknown} [onEdit]  Hears an edit before it is saved; a string or false (or a promise of one) refuses it.
 * @property {string} [expandGlyph]   Default ▸.
 * @property {string} [collapseGlyph] Default ▾.
 * @property {number} [gridPageRows]  Default 5.
 */

/**
 * Attach every data table under `root`.
 *
 * @param {ParentNode} root
 * @param {DataTableOptions} [options]
 *   Defaults, each also settable per table: `data-kp-locale`, `data-kp-debounce`, `data-kp-sort-cycle`, `data-kp-page-size`,
 *   `data-kp-page-sizes` (`none` for no choice). `regions` upgrades the scroll wrapper to a named region [TH95]; off leaves the
 *   wrapper untouched.
 * @returns {(() => void) & { handles: DataTableHandle[] }} detach
 */
export function attachDataTables(
    root = document,
    {
        locale: localeOption,
        compare: compareFn = compare,
        filter: filterFn = defaultFilter,
        debounceMs,
        sortCycle = 'two',
        multiSort = false,
        filterMode = 'panel',
        // The theme's own button, not the ghost: a ghost is text alone at rest
        // in eleven of the twenty-two themes, so the pager did not read as
        // buttons until hovered [Kenny's note of 2026-09-13, seen in cyberpunk].
        pagerClassName = 'kp-button',
        pageLabel,
        regions = true,
        pageSizes: pageSizesOption = PAGE_SIZES,
        removeGlyph = '×',
        detail: detailFn,
        load: loadFn,
        rowKey: rowKeyFn,
        onEdit,
        expandGlyph = '▸',
        collapseGlyph = '▾',
        gridPageRows = GRID_PAGE_ROWS,
    } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {DataTableHandle[]} */
    const created = [];

    for (const element of root.querySelectorAll(TABLE)) {
        const wrap = /** @type {HTMLElement} */ (element);
        if (wrap.dataset.kpDatatableAttached !== undefined) continue;
        const table = /** @type {HTMLTableElement | null} */ (wrap.querySelector('table'));
        const body = table?.tBodies[0];
        if (table === undefined || table === null || body === undefined) continue;
        // The density, the columns and the sort this reader chose last time,
        // when the table asked to be remembered [Kenny, 2026-09-16]. The
        // painter writes them as the markup a server would have rendered —
        // `data-density`, `data-kp-column-hidden`, `aria-sort` — so
        // everything below goes on reading the markup and nothing else moves.
        const memory = paintRemembered(wrap, 'datatable');
        wrap.dataset.kpDatatableAttached = '';
        instances += 1;
        const id = `kp-datatable-${instances}`;
        /** Everything this attach put into the page, taken out again by detach. @type {Element[]} */
        const added = [];
        /** @type {(() => void)[]} */
        const undo = [];
        const s0 = getStrings();

        // The scroll box is a region a keyboard can reach [TH95]. Here as
        // well as in auto.js, because a consumer who attaches only the
        // data tables should not have to know about a second call to make
        // their table operable.
        if (regions) cleanups.push(attachTableRegions(wrap));

        const search = /** @type {HTMLInputElement | null} */ (wrap.querySelector(SEARCH));
        const scopeSelect = /** @type {HTMLSelectElement | null} */ (wrap.querySelector(SCOPE));
        const densitySelect = /** @type {HTMLSelectElement | null} */ (wrap.querySelector(DENSITY));
        const status = /** @type {HTMLElement | null} */ (wrap.querySelector(STATUS));
        const pager = /** @type {HTMLElement | null} */ (wrap.querySelector(PAGER));
        const empty = /** @type {HTMLElement | null} */ (wrap.querySelector(EMPTY));
        const loadingSlot = /** @type {HTMLElement | null} */ (wrap.querySelector(LOADING));
        let failedSlot = /** @type {HTMLElement | null} */ (wrap.querySelector(FAILED));
        const actions = /** @type {HTMLElement | null} */ (wrap.querySelector(ACTIONS));
        const selectAll = /** @type {HTMLInputElement | null} */ (wrap.querySelector(SELECT_ALL));
        let size = Number.parseInt(wrap.dataset.kpPageSize ?? '', 10) || PAGE_SIZE;
        const locale = resolveLocale(wrap.dataset.kpLocale ?? localeOption, wrap);
        const serverMode = wrap.dataset.kpServer !== undefined;
        const debounce = Number.parseInt(wrap.dataset.kpDebounce ?? '', 10) || debounceMs || (serverMode ? SERVER_DEBOUNCE_MS : 0);
        const cycle = wrap.dataset.kpSortCycle ?? sortCycle;
        const cycleName = cycle === 'three' ? 'three' : 'two';
        const multi = wrap.dataset.kpSortMulti === undefined ? multiSort : wrap.dataset.kpSortMulti !== 'false';
        const glyphs = {
            expand: wrap.dataset.kpExpandGlyph ?? expandGlyph,
            collapse: wrap.dataset.kpCollapseGlyph ?? collapseGlyph,
        };
        const sizesAttribute = wrap.dataset.kpPageSizes;
        const sizes =
            sizesAttribute === 'none'
                ? []
                : [
                      ...new Set([
                          ...(sizesAttribute
                              ? splitList(sizesAttribute)
                                    .map(Number)
                                    .filter((n) => n > 0)
                              : pageSizesOption),
                          size,
                      ]),
                  ].sort((a, b) => a - b);

        // ── Rows that open (#expansion) ────────────────────────────────
        // Before anything reads the headers: the toggle column is a column.
        const headRow = table.tHead?.rows[0];
        /** Each row's detail row. @type {Map<HTMLTableRowElement, HTMLTableRowElement>} */
        const details = new Map();
        /** Detail rows as the markup had them, for detach. @type {Map<HTMLTableRowElement, boolean>} */
        const detailsWereHidden = new Map();
        /** @type {Set<HTMLTableRowElement>} */
        const builtDetails = new Set();
        const collectDetails = () => {
            /** @type {HTMLTableRowElement | null} */
            let owner = null;
            for (const row of body.rows) {
                if (row.matches(DETAIL)) {
                    if (owner !== null && !details.has(owner)) {
                        details.set(owner, row);
                        if (!detailsWereHidden.has(row)) detailsWereHidden.set(row, row.hidden === true);
                    }
                } else if (!row.matches(SKELETON_ROW)) owner = row;
            }
        };
        collectDetails();
        const expandable = wrap.dataset.kpExpandable !== undefined && headRow !== undefined;
        /** Rows open for their details, by key. @type {Set<string>} */
        const expanded = new Set();
        if (expandable && headRow !== undefined && headRow.querySelector(EXPAND_COLUMN) === null) {
            const th = add(make('th'));
            th.setAttribute('scope', 'col');
            th.dataset.kpExpandColumn = '';
            const label = make('span', 'kp-sr-only');
            label.textContent = s0.tableDetailsColumn;
            th.append(label);
            headRow.prepend(th);
        }
        /** The toggle's cell, first in the row, so the row's cells line up with the headers. @param {HTMLTableRowElement} row */
        const insertExpandCell = (row) => {
            if (!expandable || row.matches(DETAIL) || row.matches(SKELETON_ROW) || row.querySelector('[data-kp-expand-cell]') !== null) return;
            const cell = /** @type {HTMLTableCellElement} */ (make('td'));
            cell.dataset.kpExpandCell = '';
            cell.dataset.label = '';
            // Where the markup wrote detail rows, only a row that has one gets a
            // button; with a `detail` option or no detail rows at all, every row
            // does, and the app fills the detail when the row first opens.
            if (details.has(row) || detailFn !== undefined || details.size === 0) {
                const button = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--ghost kp-button--sm kp-datatable__expand'));
                button.type = 'button';
                button.dataset.kpRowToggle = '';
                cell.append(button);
            }
            row.prepend(cell);
        };
        for (const row of body.rows) insertExpandCell(row);

        const headers = /** @type {HTMLTableCellElement[]} */ ([...(headRow?.cells ?? [])]);
        const headerSort = headers.map((h) => h.getAttribute('aria-sort'));
        const headerTab = headers.map((h) => h.getAttribute('tabindex'));
        const headersWereHidden = headers.map((h) => h.hidden);
        /** The column names, read once: the sort order a header shows later is not part of its name. */
        const labels = headers.map((h) => (h.textContent ?? '').trim());
        /** What a remembered column or sort key is stored under: never the index, which the control columns shift. */
        const columnIds = headers.map((h) => columnId(h));
        /** @param {number} at */
        const labelOf = (at) => labels[at] ?? '';
        const orders = headers.map((h) => (h.dataset.kpSortOrder === undefined ? null : splitList(h.dataset.kpSortOrder)));
        const filterKinds = headers.map((h) => {
            const kind = h.dataset.kpFilter;
            return kind === 'choice' || kind === 'range' || kind === 'date' ? /** @type {FilterKind} */ (kind) : null;
        });
        const editKinds = headers.map((h) => {
            const kind = h.dataset.kpEdit;
            return kind === 'text' || kind === 'number' || kind === 'select' || kind === 'date' ? /** @type {EditKind} */ (kind) : null;
        });
        /** A column of controls — the selection boxes, the expand buttons — rather than of values. @param {number} at */
        const controlColumn = (at) => {
            const header = headers[at];
            return header === undefined || header.querySelector(SELECT_ALL) !== null || header.matches(EXPAND_COLUMN);
        };
        /** The column that names a row: the first that is not a column of controls. */
        const keyColumn = headers.findIndex((_, at) => !controlColumn(at));

        /** @param {HTMLTableRowElement} row @param {number} at */
        const cellText = (row, at) => {
            const cell = row.cells[at];
            if (cell === undefined) return '';
            return ((cell.querySelector(EDIT_VALUE) ?? cell).textContent ?? '').trim();
        };
        /** @param {HTMLTableRowElement} row */
        const keyOf = (row) => row.dataset.kpRowKey ?? row.id ?? '';

        /** Every row as it was rendered. Sorting reorders this array, never the DOM's idea of it. */
        const isRow = (/** @type {HTMLTableRowElement} */ row) => !row.matches(DETAIL) && !row.matches(SKELETON_ROW);
        let all = /** @type {HTMLTableRowElement[]} */ ([...body.rows].filter(isRow));
        /** The order the server rendered, so detach can put it back. */
        const rendered = [...all];
        /** @type {HTMLTableRowElement[]} */
        let shownRows = [...all];
        /** @type {HTMLTableRowElement[]} */
        let pageRows = [...all];
        let page = 0;
        let query = '';
        /** @type {number | null} */
        let scope = null;
        /** @type {Map<number, FilterValue>} */
        const filters = new Map();
        /** @type {SortKey[]} */
        let sorts = [];
        /** @type {State} */
        let state = /** @type {State} */ (['loading', 'failed'].includes(wrap.dataset.kpState ?? '') ? wrap.dataset.kpState : 'ready');
        /** The server's count, in a server-backed table. */
        let total = Number.parseInt(wrap.dataset.kpTotal ?? '', 10);
        const emptyWasHidden = empty?.hidden ?? false;
        const densityWas = wrap.getAttribute('data-density');
        const busyWas = wrap.getAttribute('aria-busy');

        // The package's own checkbox, whatever the markup wrote [gap-13,
        // Kenny's note]: a data table's boxes were the browser's, next to
        // themed boxes everywhere else on the page.
        /** @param {Element | null} box */
        const themeBox = (box) => {
            if (box === null || box.classList.contains(CHECK_CLASS)) return;
            box.classList.add(CHECK_CLASS);
            undo.push(() => box.classList.remove(CHECK_CLASS));
        };
        themeBox(selectAll);
        if (selectAll !== null && !selectAll.hasAttribute('aria-label') && selectAll.labels?.length === 0) {
            selectAll.setAttribute('aria-label', s0.tableSelectAll);
            undo.push(() => selectAll.removeAttribute('aria-label'));
        }

        // A max height makes the header stick [Kenny, 2026-09-13]: the
        // stylesheet does the sticking, this only carries the value.
        const maxHeight = wrap.dataset.kpMaxHeight;
        if (maxHeight !== undefined && maxHeight !== '') {
            wrap.style.setProperty('--kp-datatable-max-height', maxHeight);
            undo.push(() => wrap.style.removeProperty('--kp-datatable-max-height'));
        }
        // The header's reach shows only while the box is scrolled [scope-90].
        const scrollBox = /** @type {HTMLElement | null} */ (wrap.querySelector(':scope > .kp-table-wrap'));
        if (scrollBox !== null) undo.push(watchScrolled(wrap, scrollBox));

        /** The direct child of the wrapper that holds the table: generated parts go before it. */
        let tableBlock = /** @type {Element} */ (table);
        while (tableBlock.parentElement !== null && tableBlock.parentElement !== wrap) tableBlock = tableBlock.parentElement;
        /** @type {HTMLElement | null} */
        let topBar = /** @type {HTMLElement | null} */ (
            [...wrap.children].find(
                (child) =>
                    child.classList.contains('kp-datatable__bar') && child.compareDocumentPosition(tableBlock) & Node.DOCUMENT_POSITION_FOLLOWING,
            ) ?? null
        );
        /** The bar a generated control goes in: the top bar, made when the markup has none. */
        const ensureTopBar = () => {
            if (topBar !== null) return topBar;
            topBar = add(make('div', 'kp-datatable__bar'));
            wrap.insertBefore(topBar, wrap.firstElementChild);
            return topBar;
        };
        /** The bar under the table, where the status is, for the lines a feature adds. */
        const bottomBar = /** @type {HTMLElement | null} */ (status?.closest('.kp-datatable__bar') ?? null);
        /** @param {HTMLElement} line */
        const putUnder = (line) => {
            if (bottomBar !== null) bottomBar.append(line);
            else wrap.insertBefore(line, tableBlock.nextSibling);
        };
        /** @template {Element} T @param {T} node @returns {T} */
        function add(node) {
            added.push(node);
            return node;
        }
        /** @param {string} tag @param {string} [className] */
        function make(tag, className) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            return node;
        }

        // ── The "In" choice ────────────────────────────────────────────
        if (scopeSelect !== null) {
            if (scopeSelect.options.length === 0) {
                const every = make('option');
                every.setAttribute('value', '');
                every.textContent = s0.tableSearchAllColumns;
                scopeSelect.append(add(every));
                headers.forEach((header, at) => {
                    if (header.dataset.kpSearch === 'false' || controlColumn(at) || labelOf(at) === '') return;
                    const option = /** @type {HTMLOptionElement} */ (make('option'));
                    option.value = String(at);
                    option.textContent = labelOf(at);
                    scopeSelect.append(add(option));
                });
            }
            if (!scopeSelect.hasAttribute('aria-label') && scopeSelect.labels?.length === 0) {
                scopeSelect.setAttribute('aria-label', s0.tableSearchScope);
                undo.push(() => scopeSelect.removeAttribute('aria-label'));
            }
            scope = scopeSelect.value === '' ? null : Number(scopeSelect.value);
        }

        // ── The density choice ─────────────────────────────────────────
        if (densitySelect !== null) {
            if (densitySelect.options.length === 0) {
                for (const [value, text] of [
                    ['comfortable', s0.tableDensityComfortable],
                    ['compact', s0.tableDensityCompact],
                ]) {
                    const option = /** @type {HTMLOptionElement} */ (make('option'));
                    option.value = value ?? '';
                    option.textContent = text ?? '';
                    densitySelect.append(add(option));
                }
            }
            if (!densitySelect.hasAttribute('aria-label') && densitySelect.labels?.length === 0) {
                densitySelect.setAttribute('aria-label', s0.tableDensity);
                undo.push(() => densitySelect.removeAttribute('aria-label'));
            }
            densitySelect.value = wrap.getAttribute('data-density') === 'compact' ? 'compact' : 'comfortable';
        }

        // ── Filters, declared on the headers ───────────────────────────
        const filterColumns = filterKinds.flatMap((kind, at) => (kind === null ? [] : [at]));
        /** @type {HTMLElement | null} */
        let panel = null;
        /** @type {HTMLButtonElement | null} */
        let toggle = null;
        /** @type {HTMLElement | null} */
        let pills = null;
        const addMode = (wrap.dataset.kpFilterMode ?? filterMode) === 'add';
        /** The add-filter mode's button, its menu, the list in the menu and the editor [#filter-add]. */
        /** @type {HTMLButtonElement | null} */
        let addButton = null;
        /** @type {HTMLElement | null} */
        let addPop = null;
        /** @type {HTMLElement | null} */
        let addMenu = null;
        /** @type {HTMLFormElement | null} */
        let filterEditor = null;
        if (filterColumns.length > 0 && addMode) {
            const s = s0;
            const popId = `${id}-add-filter`;
            addButton = /** @type {HTMLButtonElement | null} */ (wrap.querySelector(ADD_FILTER));
            if (addButton === null) {
                addButton = /** @type {HTMLButtonElement} */ (add(make('button', 'kp-button kp-datatable__add-filter')));
                addButton.type = 'button';
                addButton.dataset.kpDatatableAddFilter = '';
                ensureTopBar().append(addButton);
            } else {
                const node = addButton;
                const was = ['aria-haspopup', 'aria-expanded', 'aria-controls', 'popovertarget'].map((name) => [name, node.getAttribute(name)]);
                const text = node.textContent;
                undo.push(() => {
                    for (const [name, value] of was) {
                        if (value === null || value === undefined) node.removeAttribute(/** @type {string} */ (name));
                        else node.setAttribute(/** @type {string} */ (name), value);
                    }
                    node.style.removeProperty('anchor-name');
                    node.textContent = text;
                });
            }
            addButton.setAttribute('aria-haspopup', 'true');
            addButton.setAttribute('aria-expanded', 'false');
            addButton.setAttribute('aria-controls', popId);
            addButton.setAttribute('popovertarget', popId);
            // Under its button, as the column menu is placed.
            addButton.style.setProperty('anchor-name', `--${popId}`);
            addPop = add(make('div', 'kp-popover kp-datatable__add-menu'));
            addPop.id = popId;
            addPop.setAttribute('popover', 'auto');
            addPop.dataset.kpDatatableAddMenu = '';
            addPop.style.setProperty('position-anchor', `--${popId}`);
            addMenu = make('ul', 'kp-menu');
            addMenu.setAttribute('aria-label', s.tableAddFilterMenu);
            addPop.append(addMenu);
            addButton.after(addPop);
            // The editor's frame is the package's own, not a .kp-card or a
            // .kp-popover: both carry a clip-path in some registers, which cut
            // off the calendar a date bound opens (measured on the mock,
            // 2026-09-13). The calendar itself goes to the top layer.
            filterEditor = /** @type {HTMLFormElement} */ (add(make('form', 'kp-datatable__filter-editor')));
            filterEditor.id = `${id}-filter-editor`;
            filterEditor.dataset.kpDatatableFilterEditor = '';
            filterEditor.noValidate = true;
            filterEditor.hidden = true;
            wrap.insertBefore(filterEditor, tableBlock);
        }
        if (filterColumns.length > 0 && !addMode) {
            panel = /** @type {HTMLElement | null} */ (wrap.querySelector(FILTERS));
            if (panel === null) {
                panel = add(make('div', 'kp-datatable__filters'));
                panel.dataset.kpDatatableFilters = '';
                panel.hidden = wrap.dataset.kpFiltersOpen === undefined;
                wrap.insertBefore(panel, tableBlock);
            }
            if (panel.id === '') {
                panel.id = `${id}-filters`;
                const node = panel;
                undo.push(() => node.removeAttribute('id'));
            }
            panel.setAttribute('role', 'group');
            panel.setAttribute('aria-label', s0.tableFiltersLabel);
            for (const at of filterColumns) {
                const kind = /** @type {FilterKind} */ (filterKinds[at]);
                const label = labelOf(at);
                const set = add(make('fieldset', 'kp-fieldset kp-datatable__filter'));
                set.dataset.kpFilterColumn = String(at);
                const legend = make('legend', 'kp-field__label');
                legend.textContent = label;
                set.append(legend);
                if (kind === 'choice') fillChoices(set, at, []);
                else {
                    const range = make('div', 'kp-datatable__range');
                    for (const bound of ['from', 'to']) {
                        const input = /** @type {HTMLInputElement} */ (make('input', 'kp-field__input'));
                        input.dataset.kpFilterBound = bound;
                        input.setAttribute('aria-label', bound === 'from' ? s0.tableFilterFrom(label) : s0.tableFilterTo(label));
                        if (kind === 'range') {
                            input.type = 'number';
                            range.append(input);
                            continue;
                        }
                        // A date bound is the package's own date picker, not a
                        // bare date input, so it wears every theme's picker
                        // (scope-58, Kenny's second nostromo pass). The picker
                        // holds ISO in data-kp-date-value whatever the field shows.
                        input.id = `${id}-filter-${at}-${bound}`;
                        range.append(datePickerFor(input));
                    }
                    set.append(range);
                    if (kind === 'date') {
                        const detachPickers = attachDatePickers(range);
                        undo.push(detachPickers);
                    }
                }
                panel.append(set);
            }

            toggle = /** @type {HTMLButtonElement | null} */ (wrap.querySelector(FILTER_TOGGLE));
            if (toggle === null) {
                toggle = /** @type {HTMLButtonElement} */ (add(make('button', 'kp-button kp-button--ghost kp-datatable__filter-toggle')));
                toggle.type = 'button';
                toggle.dataset.kpDatatableFilterToggle = '';
                if (topBar !== null) topBar.append(toggle);
                else wrap.insertBefore(toggle, panel);
            }
            toggle.setAttribute('aria-controls', panel.id);
            toggle.setAttribute('aria-expanded', String(!panel.hidden));
        }
        if (filterColumns.length > 0) {
            pills = /** @type {HTMLElement | null} */ (wrap.querySelector(PILLS));
            if (pills === null) {
                pills = add(make('div', 'kp-datatable__pills'));
                pills.dataset.kpDatatablePills = '';
                wrap.insertBefore(pills, tableBlock);
            }
        }

        /**
         * A choice filter's values: the header's `data-kp-filter-options`, else
         * every value the rows hold, in the column's declared order or the
         * locale's. The add-filter editor asks when it opens and the filter
         * panel asks again on refresh(), so rows written after the attach are
         * in both.
         *
         * @param {number} at
         */
        function choiceValues(at) {
            const declared = splitList(headers[at]?.dataset.kpFilterOptions);
            if (declared.length > 0) return declared;
            const values = [...new Set(all.map((row) => cellText(row, at)).filter((v) => v !== ''))];
            const order = orders[at];
            return values.sort((a, b) => (order ? compareByOrder(order, a, b, collator(locale).compare) : collator(locale).compare(a, b)));
        }

        /**
         * Put a panel fieldset's boxes in step with the choice values: one box
         * per value the rows hold now, ticked where `ticked` has it, and a
         * ticked value no row holds any more stays, so it can still be
         * unticked. Nothing is rebuilt while the list already matches, so a
         * focused box keeps its focus.
         *
         * @param {Element} set @param {number} at @param {string[]} ticked
         */
        function fillChoices(set, at, ticked) {
            const values = [...choiceValues(at)];
            for (const value of ticked) if (!values.includes(value)) values.push(value);
            const boxes = /** @type {HTMLInputElement[]} */ ([...set.querySelectorAll('input[type="checkbox"]')]);
            if (boxes.length === values.length && boxes.every((box, i) => box.value === values[i])) return;
            for (const box of boxes) box.closest('.kp-field__option')?.remove();
            for (const value of values) {
                const option = make('label', 'kp-field__option');
                const box = /** @type {HTMLInputElement} */ (make('input', CHECK_CLASS));
                box.type = 'checkbox';
                box.value = value;
                box.checked = ticked.includes(value);
                option.append(box, ` ${value}`);
                set.append(option);
            }
        }

        /**
         * The package's date picker around a text field: the markup the
         * standalone picker has, class for class and string for string — a
         * plain button with the glyph, named by aria-label and title
         * [Kenny's note of 2026-09-13 — it was a ghost button reading
         * "Calendar"]. The caller attaches it.
         *
         * @param {HTMLInputElement} input
         */
        function datePickerFor(input) {
            const picker = make('div', 'kp-datepicker');
            picker.dataset.kpDatepicker = '';
            picker.dataset.kpLocale = locale;
            input.type = 'text';
            input.inputMode = 'numeric';
            input.dataset.kpDateInput = '';
            const s = getStrings();
            const opener = /** @type {HTMLButtonElement} */ (make('button', 'kp-button'));
            opener.type = 'button';
            opener.dataset.kpDateOpen = '';
            opener.setAttribute('aria-label', s.calendarOpen);
            opener.title = s.calendarOpen;
            const glyph = make('span');
            glyph.setAttribute('aria-hidden', 'true');
            glyph.textContent = s.calendarButton;
            opener.append(glyph);
            const datePanel = make('div', 'kp-datepicker__panel');
            datePanel.dataset.kpDatePanel = '';
            datePanel.hidden = true;
            picker.append(input, opener, datePanel);
            return picker;
        }

        // ── The card layout's sort control ─────────────────────────────
        const sortable = headers.flatMap((header, at) => (header.dataset.kpSort === undefined ? [] : [at]));
        /** @type {HTMLSelectElement | null} */
        let sortBy = null;
        /** @type {HTMLButtonElement | null} */
        let sortDirection = null;
        if (wrap.dataset.kpCards !== undefined && sortable.length > 0 && wrap.querySelector(CARD_SORT) === null) {
            const control = add(make('div', 'kp-datatable__card-sort'));
            control.dataset.kpDatatableCardSort = '';
            const label = make('label', 'kp-datatable__label');
            label.append(s0.tableSortBy, ' ');
            sortBy = /** @type {HTMLSelectElement} */ (make('select', 'kp-field__input kp-datatable__select'));
            sortBy.dataset.kpDatatableSortBy = '';
            sortBy.setAttribute('aria-label', s0.tableSortBy);
            const none = /** @type {HTMLOptionElement} */ (make('option'));
            none.value = '';
            none.textContent = s0.tableSortNone;
            sortBy.append(none);
            for (const at of sortable) {
                const option = /** @type {HTMLOptionElement} */ (make('option'));
                option.value = String(at);
                option.textContent = labelOf(at);
                sortBy.append(option);
            }
            label.append(sortBy);
            sortDirection = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--ghost'));
            sortDirection.type = 'button';
            sortDirection.dataset.kpDatatableSortDirection = '';
            control.append(label, sortDirection);
            wrap.insertBefore(control, tableBlock);
        }

        // ── The multi-sort summary (#multi-sort) ───────────────────────
        /** @type {HTMLElement | null} */
        let sortSummary = null;
        if (multi) {
            sortSummary = /** @type {HTMLElement | null} */ (wrap.querySelector(SORT_SUMMARY));
            if (sortSummary === null) {
                sortSummary = add(make('p', 'kp-datatable__status kp-datatable__sort-summary'));
                sortSummary.dataset.kpDatatableSortSummary = '';
                sortSummary.setAttribute('aria-live', 'polite');
                ensureTopBar().prepend(sortSummary);
            }
        }

        // ── The column menu (#columns) ─────────────────────────────────
        const locked = headers.map(
            (header, at) =>
                !controlColumn(at) && (header.dataset.kpColumnLocked === undefined ? at === keyColumn : header.dataset.kpColumnLocked !== 'false'),
        );
        /** @type {Set<number>} */
        let hiddenColumns = new Set(headers.flatMap((header, at) => (header.dataset.kpColumnHidden !== undefined && !locked[at] ? [at] : [])));
        const choosable = headers.flatMap((_, at) => (controlColumn(at) ? [] : [at]));
        /** @type {HTMLElement | null} */
        let columnList = null;
        /** @type {HTMLElement | null} */
        let columnCount = null;
        if (wrap.dataset.kpColumnMenu !== undefined && choosable.length > 0) {
            const bar = ensureTopBar();
            const popId = `${id}-columns`;
            const button = /** @type {HTMLButtonElement} */ (add(make('button', 'kp-button kp-button--ghost kp-datatable__columns-toggle')));
            button.type = 'button';
            button.dataset.kpDatatableColumnsToggle = '';
            button.textContent = s0.tableColumns;
            button.setAttribute('aria-haspopup', 'true');
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', popId);
            button.setAttribute('popovertarget', popId);
            // Anchor positioning puts the menu under its button, as the theme
            // picker's menu is placed [css/components.css, .kp-popover].
            button.style.setProperty('anchor-name', `--${popId}`);
            const pop = add(make('div', 'kp-popover kp-datatable__columns'));
            pop.id = popId;
            pop.setAttribute('popover', 'auto');
            pop.dataset.kpDatatableColumns = '';
            pop.style.setProperty('position-anchor', `--${popId}`);
            pop.addEventListener('toggle', (event) => {
                button.setAttribute('aria-expanded', String(/** @type {ToggleEvent} */ (event).newState === 'open'));
            });
            columnList = make('ul', 'kp-menu');
            columnList.setAttribute('aria-label', s0.tableColumnsLabel);
            pop.append(columnList);
            columnCount = add(make('span', 'kp-datatable__status kp-datatable__columns-count'));
            columnCount.dataset.kpDatatableColumnsCount = '';
            bar.append(button, pop, columnCount);
        }

        // ── The edit log (#inline-edit) ────────────────────────────────
        const editable = editKinds.some((kind) => kind !== null);
        /** @type {HTMLElement | null} */
        let editLog = null;
        if (editable) {
            editLog = add(make('p', 'kp-datatable__status kp-datatable__edit-log'));
            editLog.dataset.kpDatatableEditLog = '';
            editLog.setAttribute('role', 'status');
            editLog.setAttribute('aria-live', 'polite');
            putUnder(editLog);
        }

        // ── The grid's position line (#keyboard) ───────────────────────
        const gridMode = wrap.dataset.kpGrid !== undefined;
        /** @type {HTMLElement | null} */
        let gridReadout = null;
        if (gridMode) {
            gridReadout = add(make('p', 'kp-datatable__status kp-datatable__grid-readout'));
            gridReadout.dataset.kpDatatableGridReadout = '';
            gridReadout.setAttribute('aria-live', 'polite');
            gridReadout.textContent = s0.tableGridStart;
            putUnder(gridReadout);
        }

        // ── A failed slot for a server-backed table that wrote none ────
        if (serverMode && failedSlot === null) {
            failedSlot = add(make('div', 'kp-alert kp-alert--destructive'));
            failedSlot.dataset.kpDatatableFailed = '';
            failedSlot.setAttribute('role', 'alert');
            failedSlot.hidden = true;
            const text = make('p');
            text.textContent = s0.tableFailed;
            const retry = /** @type {HTMLButtonElement} */ (make('button', 'kp-button'));
            retry.type = 'button';
            retry.dataset.kpDatatableRetry = '';
            retry.textContent = s0.tableRetry;
            failedSlot.append(text, retry);
            wrap.insertBefore(failedSlot, tableBlock);
        }

        // ── The page-size choice ───────────────────────────────────────
        /** @type {HTMLLabelElement | null} */
        let sizeLabel = null;
        /** @type {HTMLSelectElement | null} */
        let sizeSelect = null;
        if (pager !== null && sizes.length > 0) {
            sizeLabel = /** @type {HTMLLabelElement} */ (make('label', 'kp-datatable__label'));
            sizeSelect = /** @type {HTMLSelectElement} */ (make('select', 'kp-field__input kp-datatable__select kp-datatable__page-size'));
            sizeSelect.dataset.kpDatatablePageSize = '';
            sizeSelect.setAttribute('aria-label', s0.tableRowsPerPage);
            for (const n of sizes) {
                const option = /** @type {HTMLOptionElement} */ (make('option'));
                option.value = String(n);
                option.textContent = String(n);
                sizeSelect.append(option);
            }
            sizeSelect.value = String(size);
            sizeLabel.append(s0.tableRowsPerPage, ' ', sizeSelect);
        }

        // ── Preparing a row: the parts a feature puts into its cells ───
        /** Rows that had their cells wrapped or added, for detach. @type {Set<HTMLTableRowElement>} */
        const prepared = new Set();
        /** @param {HTMLTableRowElement} row */
        const prepareRow = (row) => {
            themeBox(row.querySelector(SELECT_ROW));
            if (prepared.has(row)) return;
            prepared.add(row);
            insertExpandCell(row);
            editKinds.forEach((kind, at) => {
                const cell = row.cells[at];
                if (kind === null || cell === undefined || cell.querySelector(EDIT_CELL) !== null) return;
                const button = /** @type {HTMLButtonElement} */ (make('button', 'kp-datatable__edit'));
                button.type = 'button';
                button.dataset.kpEditCell = '';
                const value = make('span');
                value.dataset.kpEditValue = '';
                value.append(...cell.childNodes);
                button.append(value);
                cell.append(button);
            });
            if (hiddenColumns.size > 0)
                for (const at of hiddenColumns) if (row.cells[at]) /** @type {HTMLTableCellElement} */ (row.cells[at]).hidden = true;
        };
        /** Take back what prepareRow put in a row. @param {HTMLTableRowElement} row */
        const unprepareRow = (row) => {
            row.querySelector('[data-kp-expand-cell]')?.remove();
            for (const button of row.querySelectorAll(EDIT_CELL)) {
                const value = button.querySelector(EDIT_VALUE);
                if (value !== null) button.replaceWith(...value.childNodes);
            }
            for (const cell of row.cells) cell.hidden = false;
        };
        /** Name the parts that depend on the row's current value and state. @param {HTMLTableRowElement} row */
        const labelRow = (row) => {
            const s = getStrings();
            const key = keyOf(row);
            const toggleButton = /** @type {HTMLButtonElement | null} */ (row.querySelector(ROW_TOGGLE));
            if (toggleButton !== null) {
                const open = expanded.has(key);
                toggleButton.setAttribute('aria-label', s.tableRowDetails(key));
                toggleButton.setAttribute('aria-expanded', String(open));
                toggleButton.textContent = open ? glyphs.collapse : glyphs.expand;
                const detail = details.has(row) || open ? detailFor(row) : undefined;
                if (detail !== undefined) toggleButton.setAttribute('aria-controls', detail.id);
                else toggleButton.removeAttribute('aria-controls');
            }
            for (const button of row.querySelectorAll(EDIT_CELL)) {
                const cell = /** @type {HTMLTableCellElement} */ (button.closest('td, th'));
                button.setAttribute('aria-label', s.tableEdit(labelOf(cell.cellIndex), key, cellText(row, cell.cellIndex)));
            }
        };

        for (const row of all) {
            if (row.dataset.kpExpanded !== undefined) expanded.add(keyOf(row));
            prepareRow(row);
        }

        /** The count of the columns a reader sees. */
        const visibleColumns = () => headers.filter((_, at) => !hiddenColumns.has(at)).length;

        /** A detail row, made ready to show: its class, its id and its span. @param {HTMLTableRowElement} row */
        const detailFor = (row) => {
            let detail = details.get(row);
            if (detail === undefined && expandable) {
                const hasMarkup = [...detailsWereHidden.keys()].length > 0;
                if (detailFn === undefined && hasMarkup) return undefined;
                detail = /** @type {HTMLTableRowElement} */ (make('tr'));
                detail.dataset.kpRowDetail = '';
                detail.hidden = true;
                const cell = make('td');
                detail.append(cell);
                details.set(row, detail);
                builtDetails.add(detail);
                if (detailFn !== undefined) {
                    const content = detailFn(row);
                    if (typeof content === 'string') cell.textContent = content;
                    else if (content !== null && content !== undefined) cell.append(content);
                }
            }
            if (detail === undefined) return undefined;
            if (!detail.classList.contains('kp-datatable__detail')) {
                detail.classList.add('kp-datatable__detail');
                const node = detail;
                if (!builtDetails.has(detail)) undo.push(() => node.classList.remove('kp-datatable__detail'));
            }
            if (detail.id === '') {
                detail.id = `${id}-detail-${keyOf(row) || row.rowIndex}`;
                const node = detail;
                if (!builtDetails.has(detail)) undo.push(() => node.removeAttribute('id'));
            }
            const cell = detail.cells[0];
            if (cell !== undefined) cell.colSpan = visibleColumns();
            return detail;
        };

        /** @returns {View} */
        const view = () => ({
            shown: serverMode ? total || 0 : shownRows.length,
            total: serverMode ? total || 0 : all.length,
            page,
            pages: Math.max(1, Math.ceil((serverMode ? total || 0 : shownRows.length) / size)),
            pageSize: size,
            query,
            scope,
            filters: Object.fromEntries(filters),
            sort: sorts[0] ?? null,
            sorts: sorts.map((key) => ({ ...key })),
            hidden: [...hiddenColumns].sort((a, b) => a - b),
            expanded: [...expanded],
            density: wrap.getAttribute('data-density') === 'compact' ? 'compact' : 'comfortable',
            state,
            keys: shownRows.map(keyOf),
            pageKeys: pageRows.map(keyOf),
        });

        /** Keys ticked in a server-backed table, which outlive the rows of one page. @type {Set<string>} */
        const serverSelection = new Set();
        const selectedRows = () =>
            all.filter((row) => {
                const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
                return box !== null && box.checked;
            });
        /** The header box reads the rows on this page, which are the rows it acts on [gap-13]. */
        const syncSelectAll = () => {
            if (selectAll === null) return;
            const boxes = pageRows.map((row) => /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW))).filter((b) => b !== null);
            const checked = boxes.filter((b) => b.checked).length;
            selectAll.checked = boxes.length > 0 && checked === boxes.length;
            // Indeterminate is the honest third state: a header box that
            // reads "checked" while three of ten rows are selected lies.
            selectAll.indeterminate = checked > 0 && checked < boxes.length;
        };
        const syncActions = () => {
            if (actions === null) return;
            const count = serverMode ? serverSelection.size : selectedRows().length;
            actions.hidden = count === 0;
            const counter = actions.querySelector(SELECTED_COUNT);
            if (counter !== null) counter.textContent = getStrings().tableSelected(count);
        };

        /** Skeleton rows for a first load with no loading slot of the consumer's, as #states shows it. */
        const syncSkeleton = () => {
            const want = state === 'loading' && all.length === 0 && loadingSlot === null;
            const have = [...body.querySelectorAll(`:scope > ${SKELETON_ROW}`)];
            if (!want) {
                for (const row of have) row.remove();
                return;
            }
            if (have.length > 0) return;
            for (let i = 0; i < 3; i += 1) {
                const row = make('tr');
                row.dataset.kpSkeletonRow = '';
                row.setAttribute('aria-hidden', 'true');
                headers.forEach((_, at) => {
                    const cell = make('td');
                    if (hiddenColumns.has(at)) cell.hidden = true;
                    if (!controlColumn(at)) cell.append(make('span', 'kp-skeleton'));
                    row.append(cell);
                });
                body.append(row);
            }
        };

        const syncStateParts = () => {
            if (state === 'loading') wrap.setAttribute('aria-busy', 'true');
            else if (busyWas === null) wrap.removeAttribute('aria-busy');
            else wrap.setAttribute('aria-busy', busyWas);
            wrap.dataset.kpState = state;
            // A skeleton on a first load, the old rows dimmed on a refresh:
            // the stylesheet dims, this only decides whether there is
            // anything to dim.
            if (loadingSlot !== null) loadingSlot.hidden = !(state === 'loading' && all.length === 0);
            if (failedSlot !== null) failedSlot.hidden = state !== 'failed';
            syncSkeleton();
        };

        const syncCardSort = () => {
            if (sortBy === null || sortDirection === null) return;
            const s = getStrings();
            const first = sorts[0];
            sortBy.value = first === undefined ? '' : String(first.column);
            sortDirection.textContent = first?.direction === 'descending' ? s.tableSortDescending : s.tableSortAscending;
            sortDirection.disabled = sortBy.value === '';
        };

        // aria-sort on each sorted column and 'none' on every other sortable
        // header: a stale "ascending" on a column that is no longer a key is
        // worse than saying nothing. With more than one key each sorted header
        // carries its place, the number the mock drew [#multi-sort].
        const syncSortMarks = () => {
            const s = getStrings();
            headers.forEach((header, at) => {
                header.querySelector(':scope .kp-datatable__sort-order')?.remove();
                if (header.dataset.kpSort === undefined) return;
                const index = sorts.findIndex((key) => key.column === at);
                const key = sorts[index];
                header.setAttribute('aria-sort', key === undefined ? 'none' : key.direction);
                if (key === undefined || sorts.length < 2) return;
                const mark = make('span', 'kp-datatable__sort-order');
                mark.setAttribute('aria-hidden', 'true');
                mark.textContent = String(index + 1);
                (header.querySelector('button') ?? header).append(mark);
            });
            if (sortSummary !== null) {
                sortSummary.textContent =
                    sorts.length === 0
                        ? s.tableNotSorted
                        : s.tableSortedBy(
                              sorts.map((key) =>
                                  s.tableSortKey(
                                      labelOf(key.column),
                                      key.direction,
                                      orders[key.column] ? 'order' : (headers[key.column]?.dataset.kpSort ?? 'text'),
                                  ),
                              ),
                          );
            }
        };

        const syncColumns = () => {
            headers.forEach((header, at) => {
                header.hidden = hiddenColumns.has(at) || (headersWereHidden[at] ?? false);
            });
            for (const row of body.rows) {
                if (row.matches(DETAIL)) continue;
                headers.forEach((_, at) => {
                    const cell = row.cells[at];
                    if (cell !== undefined) cell.hidden = hiddenColumns.has(at);
                });
            }
            if (columnList !== null && columnList.childElementCount > 0) {
                // Built once and then only ticked, so a box keeps its focus and
                // its identity while the reader goes down the list.
                for (const box of columnList.querySelectorAll('[data-kp-datatable-column]')) {
                    const input = /** @type {HTMLInputElement} */ (box);
                    input.checked = !hiddenColumns.has(Number(input.value));
                }
            } else if (columnList !== null) {
                const s = getStrings();
                for (const at of choosable) {
                    const item = make('li');
                    const label = /** @type {HTMLLabelElement} */ (make('label', 'kp-menu__item kp-datatable__column-option'));
                    const box = /** @type {HTMLInputElement} */ (make('input', CHECK_CLASS));
                    box.type = 'checkbox';
                    box.value = String(at);
                    box.dataset.kpDatatableColumn = '';
                    box.checked = !hiddenColumns.has(at);
                    box.disabled = locked[at] ?? false;
                    label.append(box, ` ${locked[at] ? s.tableColumnLocked(labelOf(at)) : labelOf(at)}`);
                    item.append(label);
                    columnList.append(item);
                }
                const separator = make('li', 'kp-menu__separator');
                separator.setAttribute('role', 'separator');
                const resetItem = make('li');
                const reset = /** @type {HTMLButtonElement} */ (make('button', 'kp-menu__item'));
                reset.type = 'button';
                reset.dataset.kpDatatableColumnsReset = '';
                reset.textContent = s.tableShowAllColumns;
                resetItem.append(reset);
                columnList.append(separator, resetItem);
            }
            if (columnCount !== null)
                columnCount.textContent = getStrings().tableColumnsShown(
                    choosable.length - [...hiddenColumns].filter((at) => choosable.includes(at)).length,
                    choosable.length,
                );
        };

        const fixedAttribute = wrap.dataset.kpFixedColumns;
        const fixedCount = fixedAttribute === undefined ? 0 : Number.parseInt(fixedAttribute, 10) || keyColumn + 1;
        const syncFixed = () => {
            if (fixedCount > 0) syncFixedColumns(table, fixedCount);
        };

        /** @type {GridHandle | null} */
        let grid = null;

        const render = () => {
            const count = serverMode ? total || 0 : shownRows.length;
            const pages = Math.max(1, Math.ceil(count / size));
            page = Math.min(page, pages - 1);
            const from = page * size;
            pageRows = serverMode || pager === null ? shownRows : shownRows.slice(from, from + size);
            for (const row of all) row.hidden = true;
            for (const row of pageRows) row.hidden = false;
            // Reordering by appending: the rows are the same elements, so
            // anything a consumer attached to them survives a sort. A row's
            // detail travels directly under it.
            for (const row of shownRows) {
                body.append(row);
                const detail = details.get(row);
                if (detail !== undefined) body.append(detail);
            }
            for (const [row, detail] of details) {
                const open = expanded.has(keyOf(row)) && !row.hidden && all.includes(row);
                if (open) detailFor(row);
                detail.hidden = !open;
            }
            for (const row of all) labelRow(row);

            const s = getStrings();
            if (status !== null) {
                status.textContent = '';
                if (state === 'loading' && all.length > 0) {
                    // Refreshing: the old rows stay, dimmed, and a spinner says it is working [#states].
                    const spinner = make('span', 'kp-spinner');
                    spinner.setAttribute('aria-hidden', 'true');
                    status.append(spinner, ' ');
                }
                status.append(
                    state === 'loading'
                        ? s.busy
                        : s.tableShowing(pageRows.length === 0 ? 0 : from + 1, from + pageRows.length, count, serverMode ? count : all.length),
                );
            }
            if (pager !== null) {
                pager.textContent = '';
                if (sizeLabel !== null) pager.append(sizeLabel);
                pager.append(pagerButton(s.previous, page > 0, () => (page -= 1), 'back'));
                const label = document.createElement('span');
                label.className = 'kp-datatable__page';
                label.textContent = (pageLabel ?? s.tablePage)(page + 1, pages);
                pager.append(label);
                pager.append(pagerButton(s.next, page < pages - 1, () => (page += 1)));
            }
            if (empty !== null) empty.hidden = count > 0 || state !== 'ready';
            // After a search or a filter the ticked row may be gone from the
            // page, and the header box must say so [gap-13].
            syncSelectAll();
            syncActions();
            syncStateParts();
            syncCardSort();
            syncSortMarks();
            syncFixed();
            grid?.sync();
            wrap.dispatchEvent(new CustomEvent(VIEW_EVENT, { bubbles: true, detail: { ...view(), rows: [...shownRows], pageRows: [...pageRows] } }));
        };

        /** @param {string} text @param {boolean} enabled @param {() => void} go @param {'back'} [direction] */
        const pagerButton = (text, enabled, go, direction) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = pagerClassName;
            // Meaning in the markup, the look in the theme: cyberpunk turns a
            // back button's notch to the side it points to; the other themes
            // draw it as the button beside it [Kenny's note of 2026-09-13].
            if (direction !== undefined) button.dataset.kpDirection = direction;
            button.textContent = text;
            button.disabled = !enabled;
            button.addEventListener('click', () => {
                go();
                if (serverMode) request();
                else render();
            });
            return button;
        };

        // The list is rebuilt, the clear button is not: a click on it blurs a
        // range field, whose change event re-renders the pills, and a button
        // rebuilt between the press and the release never gets its click.
        const pillsList = add(make('ul', 'kp-tag-list'));
        const clearButton = /** @type {HTMLButtonElement} */ (
            add(make('button', `kp-button kp-button--ghost kp-datatable__clear-filters${addMode ? ' kp-button--sm' : ''}`))
        );
        clearButton.type = 'button';
        clearButton.addEventListener('click', () => {
            clearFilters();
            (toggle ?? addButton)?.focus();
        });
        if (pills !== null) {
            pills.textContent = '';
            pills.append(pillsList, clearButton);
        }
        const renderPills = () => {
            if (pills === null) return;
            const s = getStrings();
            const list = pillsList;
            list.textContent = '';
            list.setAttribute('aria-label', s.tableActiveFilters);
            if (addMode) {
                renderAddPills(s);
                return;
            }
            clearButton.textContent = s.tableClearFilters;
            let count = 0;
            for (const at of filterColumns) {
                const kind = /** @type {FilterKind} */ (filterKinds[at]);
                for (const pill of filterPills(kind, labelOf(at), filters.get(at), s)) {
                    count += 1;
                    const item = make('li', 'kp-tag');
                    const remove = /** @type {HTMLButtonElement} */ (make('button', 'kp-tag__remove'));
                    remove.type = 'button';
                    remove.setAttribute('aria-label', s.tableRemoveFilter(pill.label));
                    remove.textContent = removeGlyph;
                    remove.addEventListener('click', () => {
                        setFilter(at, pill.without ?? null);
                        const next = /** @type {HTMLElement | null} */ (pills?.querySelector('.kp-tag__remove') ?? null);
                        (next ?? toggle)?.focus();
                    });
                    item.append(pill.label, remove);
                    list.append(item);
                }
            }
            pills.hidden = count === 0;
            if (toggle !== null) toggle.textContent = s.tableFilters(count);
        };

        // ── The add-filter mode (#filter-add) ──────────────────────────
        /** The column whose editor is open. @type {number | null} */
        let editingFilter = null;
        /** The pill the focus returns to when the editor closes; null for the add button. @type {number | null} */
        let editorReturn = null;
        let detachEditorPickers = () => {};

        /** One pill per filter, in the order the filters were added. @param {import('./strings.js').Strings} s */
        const renderAddPills = (s) => {
            if (pills === null) return;
            let count = 0;
            for (const [at, value] of filters) {
                const kind = filterKinds[at];
                if (!kind) continue;
                const label = filterPillLabel(kind, labelOf(at), value, s);
                if (label === null) continue;
                count += 1;
                const item = make('li', 'kp-tag');
                const edit = /** @type {HTMLButtonElement} */ (make('button', 'kp-datatable__pill-edit'));
                edit.type = 'button';
                edit.dataset.kpFilterPill = String(at);
                edit.setAttribute('aria-label', s.tableEditFilter(label));
                edit.setAttribute('aria-expanded', String(editingFilter === at));
                if (filterEditor !== null) edit.setAttribute('aria-controls', filterEditor.id);
                edit.textContent = label;
                const remove = /** @type {HTMLButtonElement} */ (make('button', 'kp-tag__remove'));
                remove.type = 'button';
                remove.dataset.kpFilterUnpill = String(at);
                remove.setAttribute('aria-label', s.tableRemoveFilter(label));
                remove.textContent = removeGlyph;
                item.append(edit, remove);
                pillsList.append(item);
            }
            pills.hidden = count === 0;
            clearButton.textContent = s.tableFilterClearAll;
            clearButton.hidden = count < 2;
            if (addButton !== null) addButton.textContent = s.tableAddFilter(count);
            renderAddMenu(s);
        };

        /** The menu of filterable columns; a filtered one is marked, and choosing it edits its filter. @param {import('./strings.js').Strings} s */
        const renderAddMenu = (s) => {
            if (addMenu === null) return;
            const focused = /** @type {HTMLElement | null} */ (addMenu.querySelector(':focus'))?.dataset.kpFilterColumn;
            addMenu.setAttribute('aria-label', s.tableAddFilterMenu);
            addMenu.textContent = '';
            for (const at of filterColumns) {
                const on = filters.has(at);
                const item = make('li');
                const button = /** @type {HTMLButtonElement} */ (make('button', 'kp-menu__item kp-datatable__add-item'));
                button.type = 'button';
                button.dataset.kpFilterColumn = String(at);
                button.setAttribute('aria-label', on ? s.tableAddFilterItemActive(labelOf(at)) : s.tableAddFilterItem(labelOf(at)));
                button.append(labelOf(at));
                if (on) {
                    button.dataset.kpFilterMarked = '';
                    const mark = make('span', 'kp-badge');
                    mark.setAttribute('aria-hidden', 'true');
                    mark.textContent = s.tableFilterMarked;
                    button.append(' ', mark);
                }
                item.append(button);
                addMenu.append(item);
                if (focused === String(at)) button.focus();
            }
        };

        /** @param {number} at @param {number | null} returnTo the pill the focus goes back to, or null for the add button */
        const openFilterEditor = (at, returnTo) => {
            const kind = filterKinds[at];
            if (filterEditor === null || !kind) return;
            closeFilterEditor(false);
            const s = getStrings();
            const form = filterEditor;
            const label = labelOf(at);
            const current = filters.get(at);
            const range = /** @type {{ from?: string, to?: string } | undefined} */ (Array.isArray(current) ? undefined : current);
            editingFilter = at;
            editorReturn = returnTo;
            form.setAttribute('aria-label', s.tableFilterEditor(label));
            form.dataset.kpFilterColumn = String(at);
            const title = make('p', 'kp-datatable__filter-editor-title');
            title.textContent = label;
            form.append(title);
            if (kind === 'choice') {
                const set = make('fieldset', 'kp-fieldset');
                const legend = make('legend', 'kp-sr-only');
                legend.textContent = s.tableFilterChoicesLegend(label);
                const choices = make('div', 'kp-datatable__filter-editor-choices');
                for (const value of choiceValues(at)) {
                    const option = make('label', 'kp-field__option');
                    const box = /** @type {HTMLInputElement} */ (make('input', CHECK_CLASS));
                    box.type = 'checkbox';
                    box.name = 'values';
                    box.value = value;
                    box.checked = Array.isArray(current) && current.includes(value);
                    option.append(box, ` ${value}`);
                    choices.append(option);
                }
                set.append(legend, choices);
                form.append(set);
            } else {
                const pair = make('div', 'kp-datatable__filter-editor-pair');
                for (const bound of /** @type {const} */ (['from', 'to'])) {
                    const input = /** @type {HTMLInputElement} */ (make('input', 'kp-field__input'));
                    input.id = `${id}-filter-editor-${bound}`;
                    input.dataset.kpFilterBound = bound;
                    input.autocomplete = 'off';
                    input.setAttribute('aria-describedby', `${id}-filter-editor-error`);
                    const text = /** @type {HTMLLabelElement} */ (make('label', 'kp-field__label'));
                    text.htmlFor = input.id;
                    text.textContent = s.tableFilterBound(kind, bound, label);
                    if (kind === 'range') {
                        input.type = 'text';
                        input.inputMode = 'decimal';
                        input.value = range?.[bound] ?? '';
                        const field = make('div', 'kp-field');
                        field.append(text, input);
                        pair.append(field);
                    } else {
                        // The package's date picker, the label on the row above its field.
                        const picker = datePickerFor(input);
                        picker.prepend(text);
                        pair.append(picker);
                    }
                }
                form.append(pair);
            }
            const error = make('p', 'kp-field__error');
            error.id = `${id}-filter-editor-error`;
            error.dataset.kpFilterError = '';
            error.setAttribute('role', 'alert');
            error.hidden = true;
            const actions = make('div', 'kp-datatable__filter-editor-actions');
            const apply = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--primary kp-button--sm'));
            apply.type = 'submit';
            apply.textContent = s.tableFilterApply;
            const cancel = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--ghost kp-button--sm'));
            cancel.type = 'button';
            cancel.dataset.kpFilterCancel = '';
            cancel.textContent = s.tableFilterCancel;
            actions.append(apply, cancel);
            form.append(error, actions);
            form.hidden = false;
            if (kind === 'date') {
                detachEditorPickers = attachDatePickers(form);
                for (const bound of /** @type {const} */ (['from', 'to'])) {
                    const wanted = range?.[bound] ?? '';
                    const picker = form.querySelector(`[data-kp-filter-bound="${bound}"]`)?.closest('[data-kp-datepicker]');
                    if (wanted !== '' && picker) datePicker(picker)?.set(wanted);
                }
            }
            renderPills();
            /** @type {HTMLElement | null} */ (form.querySelector('input'))?.focus();
        };

        /** @param {boolean} [focus] hand the focus back to the pill, or to the add button */
        const closeFilterEditor = (focus = true) => {
            if (editingFilter === null || filterEditor === null) return;
            detachEditorPickers();
            detachEditorPickers = () => {};
            const back = editorReturn;
            editingFilter = null;
            editorReturn = null;
            filterEditor.hidden = true;
            filterEditor.textContent = '';
            delete filterEditor.dataset.kpFilterColumn;
            filterEditor.removeAttribute('aria-label');
            renderPills();
            if (!focus) return;
            const pill = back === null ? null : /** @type {HTMLElement | null} */ (pills?.querySelector(`[data-kp-filter-pill="${back}"]`) ?? null);
            (pill ?? addButton)?.focus();
        };

        /** @param {SubmitEvent} event */
        const onEditorSubmit = (event) => {
            event.preventDefault();
            const at = editingFilter;
            const form = filterEditor;
            if (at === null || form === null) return;
            const kind = filterKinds[at];
            const s = getStrings();
            /** @type {FilterValue | null} */
            let next = null;
            if (kind === 'choice') {
                const values = [...form.querySelectorAll('input[name="values"]:checked')].map((box) => /** @type {HTMLInputElement} */ (box).value);
                next = values.length > 0 ? values : null;
            } else if (kind === 'range' || kind === 'date') {
                const read = (/** @type {'from' | 'to'} */ bound) => {
                    const input = /** @type {HTMLInputElement} */ (form.querySelector(`[data-kp-filter-bound="${bound}"]`));
                    return {
                        text: input.value,
                        iso: input.dataset.kpDateValue,
                        label: bound === 'from' ? s.tableFilterFrom(labelOf(at)) : s.tableFilterTo(labelOf(at)),
                    };
                };
                const result = readFilterBounds(kind, { from: read('from'), to: read('to') }, s);
                for (const input of form.querySelectorAll('[data-kp-filter-bound]')) input.removeAttribute('aria-invalid');
                if (result.error !== undefined) {
                    const error = /** @type {HTMLElement} */ (form.querySelector('[data-kp-filter-error]'));
                    error.textContent = result.error;
                    error.hidden = false;
                    const field = /** @type {HTMLElement} */ (form.querySelector(`[data-kp-filter-bound="${result.bound}"]`));
                    field.setAttribute('aria-invalid', 'true');
                    field.focus();
                    return;
                }
                next = result.value;
            }
            // A filter just applied returns the focus to its own pill.
            if (next !== null) editorReturn = at;
            setFilter(at, next);
            closeFilterEditor(true);
        };
        /** @param {MouseEvent} event */
        const onEditorClick = (event) => {
            if (/** @type {HTMLElement} */ (event.target).closest('[data-kp-filter-cancel]') !== null) closeFilterEditor(true);
        };
        /** @param {KeyboardEvent} event */
        const onEditorKeydown = (event) => {
            const target = /** @type {HTMLElement} */ (event.target);
            // Escape inside an open calendar closes the calendar, not the editor.
            if (event.key !== 'Escape' || event.defaultPrevented || target.closest('[data-kp-date-panel]') !== null) return;
            if (target.getAttribute('aria-expanded') === 'true') return;
            event.preventDefault();
            closeFilterEditor(true);
        };
        /** @param {MouseEvent} event */
        const onAddMenuClick = (event) => {
            const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-kp-filter-column]'));
            if (button === null) return;
            const at = Number(button.dataset.kpFilterColumn);
            if (addPop?.matches(':popover-open')) addPop.hidePopover();
            openFilterEditor(at, filters.has(at) ? at : null);
        };
        /** @param {KeyboardEvent} event */
        const onAddMenuKey = (event) => {
            if (addMenu === null) return;
            const items = /** @type {HTMLElement[]} */ ([...addMenu.querySelectorAll('.kp-menu__item')]);
            const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
            /** @type {Record<string, number>} */
            const moves = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 };
            const to = moves[event.key];
            if (to === undefined || items.length === 0) return;
            event.preventDefault();
            items[(to + items.length) % items.length]?.focus();
        };
        /** @param {Event} event */
        const onAddToggle = (event) => {
            const open = /** @type {ToggleEvent} */ (event).newState === 'open';
            addButton?.setAttribute('aria-expanded', String(open));
            if (!open) return;
            renderAddMenu(getStrings());
            /** @type {HTMLElement | null} */ (addMenu?.querySelector('.kp-menu__item') ?? null)?.focus();
        };
        /** @param {MouseEvent} event */
        const onPillsClick = (event) => {
            if (!addMode) return;
            const target = /** @type {HTMLElement} */ (event.target);
            const edit = /** @type {HTMLElement | null} */ (target.closest('[data-kp-filter-pill]'));
            if (edit !== null) {
                const at = Number(edit.dataset.kpFilterPill);
                if (editingFilter === at) closeFilterEditor(true);
                else openFilterEditor(at, at);
                return;
            }
            const remove = /** @type {HTMLElement | null} */ (target.closest('[data-kp-filter-unpill]'));
            if (remove === null) return;
            const at = Number(remove.dataset.kpFilterUnpill);
            if (editingFilter === at) closeFilterEditor(false);
            setFilter(at, null);
            /** @type {HTMLElement | null} */ (pills?.querySelector('.kp-tag__remove') ?? addButton)?.focus();
        };

        /** True while writeControls sets a date picker, whose change event must not be read back. */
        let writing = false;
        /** Write the filter state into the panel's controls, so a pill or the handle and the panel agree. */
        const writeControls = () => {
            if (panel === null) return;
            for (const set of panel.querySelectorAll('[data-kp-filter-column]')) {
                const at = Number(/** @type {HTMLElement} */ (set).dataset.kpFilterColumn);
                const value = filters.get(at);
                for (const box of set.querySelectorAll('input[type="checkbox"]')) {
                    const input = /** @type {HTMLInputElement} */ (box);
                    input.checked = Array.isArray(value) && value.includes(input.value);
                }
                for (const bound of set.querySelectorAll('[data-kp-filter-bound]')) {
                    const input = /** @type {HTMLInputElement} */ (bound);
                    const range = /** @type {{ from?: string, to?: string } | undefined} */ (Array.isArray(value) ? undefined : value);
                    const wanted = (input.dataset.kpFilterBound === 'from' ? range?.from : range?.to) ?? '';
                    const picker = input.closest('[data-kp-datepicker]');
                    const handle = picker === null ? null : datePicker(picker);
                    if (handle === null) {
                        input.value = wanted;
                        continue;
                    }
                    // A date bound is set through its picker, which formats it for
                    // the locale; what the person is typing is left alone while it
                    // already means the same date.
                    if ((input.dataset.kpDateValue ?? '') === wanted) continue;
                    writing = true;
                    try {
                        handle.set(wanted === '' ? null : wanted);
                    } finally {
                        writing = false;
                    }
                }
            }
        };
        /**
         * The panel's choice lists, read again from the rows. At attach they
         * hold the rows the markup had; a page that writes its rows afterwards
         * (and calls refresh) would otherwise keep an empty list for good.
         */
        const refreshChoices = () => {
            if (panel === null) return;
            for (const set of panel.querySelectorAll('[data-kp-filter-column]')) {
                const at = Number(/** @type {HTMLElement} */ (set).dataset.kpFilterColumn);
                if (filterKinds[at] !== 'choice') continue;
                const value = filters.get(at);
                fillChoices(set, at, Array.isArray(value) ? value : []);
            }
        };
        /** Read the panel's controls into the filter state. */
        const readControls = () => {
            if (panel === null) return;
            filters.clear();
            for (const set of panel.querySelectorAll('[data-kp-filter-column]')) {
                const at = Number(/** @type {HTMLElement} */ (set).dataset.kpFilterColumn);
                const kind = filterKinds[at];
                /** @type {FilterValue} */
                let value;
                if (kind === 'choice')
                    value = [...set.querySelectorAll('input[type="checkbox"]:checked')].map((b) => /** @type {HTMLInputElement} */ (b).value);
                else {
                    // A date bound reads the ISO its picker holds, never the text on screen.
                    const read = (/** @type {string} */ bound) => {
                        const input = /** @type {HTMLInputElement | null} */ (set.querySelector(`[data-kp-filter-bound="${bound}"]`));
                        if (input === null) return '';
                        return input.dataset.kpDateInput === undefined ? input.value : (input.dataset.kpDateValue ?? '');
                    };
                    value = { from: read('from'), to: read('to') };
                }
                if (kind !== null && kind !== undefined && filterActive(kind, value)) filters.set(at, value);
            }
        };

        /** @param {HTMLTableRowElement} a @param {HTMLTableRowElement} b */
        const compareRows = (a, b) => {
            for (const key of sorts) {
                const kind = headers[key.column]?.dataset.kpSort ?? 'text';
                const order = orders[key.column];
                /** @param {string} x @param {string} y */
                const by = (x, y) => compareFn(x, y, kind, locale);
                const left = cellText(a, key.column);
                const right = cellText(b, key.column);
                const c = order ? compareByOrder(order, left, right, by) : by(left, right);
                if (c !== 0) return key.direction === 'ascending' ? c : -c;
            }
            return 0;
        };
        const applySorts = () => {
            if (sorts.length === 0) {
                // Back to the rendered order, filtered.
                const keep = new Set(shownRows);
                shownRows = rendered.filter((row) => keep.has(row));
            } else shownRows = [...shownRows].sort(compareRows);
        };

        /** @param {{ keepPage?: boolean }} [options] */
        const applyFilter = ({ keepPage = false } = {}) => {
            if (serverMode) {
                if (!keepPage) page = 0;
                request();
                return;
            }
            const needle = query.trim().toLowerCase();
            shownRows = all.filter((row) => {
                if (needle !== '') {
                    const hit = scope === null ? filterFn(row, needle) : cellText(row, scope).toLowerCase().includes(needle);
                    if (!hit) return false;
                }
                for (const [at, value] of filters) {
                    const kind = filterKinds[at];
                    if (kind && !matchesFilter(kind, value, cellText(row, at), locale)) return false;
                }
                return true;
            });
            applySorts();
            if (!keepPage) page = 0;
            render();
        };

        // ── Rows from a server (#async) ────────────────────────────────
        let sent = 0;
        let latest = 0;
        /** @type {AbortController | null} */
        let controller = null;
        /** @param {HTMLTableRowElement | Record<string, unknown>} item */
        const rowFrom = (item) => {
            if (item instanceof HTMLTableRowElement) return item;
            const row = /** @type {HTMLTableRowElement} */ (make('tr'));
            // The key: the consumer's function, else the field the table names, else
            // the key column's field, else `key` or `id`.
            const field = wrap.dataset.kpRowKeyField ?? headers[keyColumn]?.dataset.kpField;
            row.dataset.kpRowKey = rowKeyFn ? rowKeyFn(item) : String((field === undefined ? undefined : item[field]) ?? item.key ?? item.id ?? '');
            headers.forEach((header, at) => {
                if (header.matches(EXPAND_COLUMN)) return;
                const cell = make('td');
                if (header.querySelector(SELECT_ALL) !== null) {
                    const box = /** @type {HTMLInputElement} */ (make('input', CHECK_CLASS));
                    box.type = 'checkbox';
                    box.dataset.kpSelectRow = '';
                    box.setAttribute('aria-label', getStrings().tableSelectRow(row.dataset.kpRowKey ?? ''));
                    cell.dataset.label = '';
                    cell.append(box);
                } else {
                    cell.dataset.label = labelOf(at);
                    // A number column's alignment, a code column's face: the classes
                    // the header asks its cells to wear, since an object has none.
                    if (header.dataset.kpCellClass) cell.className = header.dataset.kpCellClass;
                    const value = item[header.dataset.kpField ?? labelOf(at)];
                    cell.textContent = value === undefined || value === null ? '' : String(value);
                }
                row.append(cell);
            });
            return row;
        };
        /** @param {DataAnswer} answer */
        const applyAnswer = (answer) => {
            for (const row of all) {
                const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
                if (box !== null) {
                    if (box.checked) serverSelection.add(keyOf(row));
                    else serverSelection.delete(keyOf(row));
                }
            }
            if (editing !== null) closeEditor();
            const next = answer.rows.map(rowFrom);
            for (const row of [...body.rows]) if (!next.includes(row)) row.remove();
            details.clear();
            for (const row of next) {
                row.hidden = false;
                body.append(row);
                prepareRow(row);
                const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
                if (box !== null) box.checked = serverSelection.has(keyOf(row));
            }
            all = next;
            shownRows = [...next];
            total = Number(answer.total) || 0;
            state = 'ready';
            syncColumns();
            render();
        };
        const request = () => {
            if (!serverMode) return;
            sent += 1;
            const requestId = sent;
            latest = requestId;
            controller?.abort();
            controller = new AbortController();
            /** @type {DataRequest} */
            const params = {
                id: requestId,
                query,
                scope,
                sort: sorts[0] ? { ...sorts[0] } : null,
                sorts: sorts.map((key) => ({ ...key })),
                filters: Object.fromEntries(filters),
                page,
                pageSize: size,
                signal: controller.signal,
            };
            state = 'loading';
            render();
            let settled = false;
            /** @param {DataAnswer} answer */
            const respond = (answer) => {
                if (settled) return;
                settled = true;
                // An answer to a request that is no longer the newest is thrown away.
                if (requestId !== latest) return;
                applyAnswer(answer);
            };
            /** @param {unknown} error */
            const fail = (error) => {
                if (settled) return;
                settled = true;
                if (requestId !== latest) return;
                void error;
                state = 'failed';
                render();
            };
            wrap.dispatchEvent(new CustomEvent(REQUEST_EVENT, { bubbles: true, detail: { ...params, respond, fail } }));
            if (loadFn !== undefined) {
                Promise.resolve()
                    .then(() => loadFn(params))
                    .then(respond, fail);
            }
        };

        let pending = 0;
        const onSearch = () => {
            query = search?.value ?? '';
            clearTimeout(pending);
            if (debounce > 0) pending = window.setTimeout(() => applyFilter(), debounce);
            else applyFilter();
        };
        const onScope = () => {
            scope = scopeSelect === null || scopeSelect.value === '' ? null : Number(scopeSelect.value);
            applyFilter();
        };
        const onDensity = () => {
            if (densitySelect === null) return;
            setDensity(densitySelect.value === 'compact' ? 'compact' : 'comfortable');
        };
        /** @param {Density} next */
        const setDensity = (next) => {
            if (next === 'compact') wrap.setAttribute('data-density', 'compact');
            else wrap.removeAttribute('data-density');
            if (densitySelect !== null) densitySelect.value = next;
            memory?.write('density', next);
            render();
        };
        const onPanel = () => {
            // A picker set by writeControls announces it; that is not a person's change.
            if (writing) return;
            const before = JSON.stringify([...filters]);
            readControls();
            // A change event after the input event that already applied it.
            if (JSON.stringify([...filters]) === before) return;
            renderPills();
            applyFilter();
        };
        const onToggle = () => {
            if (panel === null || toggle === null) return;
            panel.hidden = !panel.hidden;
            toggle.setAttribute('aria-expanded', String(!panel.hidden));
        };
        /** @param {number} at @param {FilterValue | null} value */
        const setFilter = (at, value) => {
            const kind = filterKinds[at];
            if (!kind) return;
            if (value === null || !filterActive(kind, value)) filters.delete(at);
            else filters.set(at, value);
            writeControls();
            renderPills();
            applyFilter();
        };
        const clearFilters = () => {
            closeFilterEditor(false);
            filters.clear();
            writeControls();
            renderPills();
            applyFilter();
        };
        const onClear = () => {
            query = '';
            if (search !== null) search.value = '';
            closeFilterEditor(false);
            filters.clear();
            writeControls();
            renderPills();
            applyFilter();
            search?.focus();
        };
        const onRetry = () => {
            wrap.dispatchEvent(new CustomEvent(RETRY_EVENT, { bubbles: true }));
            if (serverMode) request();
        };

        /** @param {SortKey[]} next @param {Sort} [announced] */
        const commitSorts = (next, announced) => {
            sorts = next.filter((key) => headers[key.column] !== undefined);
            memory?.write(
                'sort',
                sorts.map((key) => ({ column: columnIds[key.column], direction: key.direction })),
            );
            wrap.dispatchEvent(new CustomEvent(SORT_EVENT, { bubbles: true, detail: announced === undefined ? (sorts[0] ?? null) : announced }));
            // A new sort starts at the first page, as the approved mock does:
            // the rows the reader was looking at are somewhere else now.
            page = 0;
            if (serverMode) {
                request();
                return;
            }
            applySorts();
            render();
        };
        /** @param {Sort} next */
        const setSort = (next) => {
            if (next === null || next.direction === 'none') commitSorts([], next);
            else commitSorts([{ column: next.column, direction: next.direction }], next);
        };
        /** @param {HTMLTableCellElement} header @param {boolean} addKey */
        const toggleSort = (header, addKey) => {
            const at = headers.indexOf(header);
            if (at === -1) return;
            const next = nextSorts(sorts, at, { add: multi && addKey, cycle: cycleName });
            if (next.length === 0) commitSorts([], { column: at, direction: 'none' });
            else commitSorts(next);
        };
        /** @param {MouseEvent} event */
        const onHeadClick = (event) => {
            const header = /** @type {HTMLTableCellElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('th[data-kp-sort]'));
            if (header !== null) toggleSort(header, event.shiftKey);
        };
        // From the keyboard too [KT6]: a header the first version made
        // clickable was reachable by nobody who could not click. The
        // consumer may put a <button> inside the header; a bare header is
        // made focusable here. Shift + Enter adds the column as a key.
        /** @param {KeyboardEvent} event */
        const onHeadKey = (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const header = /** @type {HTMLTableCellElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('th[data-kp-sort]'));
            if (header === null) return;
            event.preventDefault();
            toggleSort(header, event.shiftKey);
        };
        for (const header of headers) {
            if (header.dataset.kpSort !== undefined && header.querySelector('button, a') === null && !header.hasAttribute('tabindex'))
                header.tabIndex = 0;
        }
        const onSortBy = () => {
            if (sortBy === null) return;
            if (sortBy.value === '') setSort(null);
            else setSort({ column: Number(sortBy.value), direction: sorts[0]?.direction === 'descending' ? 'descending' : 'ascending' });
        };
        const onSortDirection = () => {
            const first = sorts[0];
            if (first === undefined) return;
            setSort({ column: first.column, direction: first.direction === 'ascending' ? 'descending' : 'ascending' });
        };
        const onPageSize = () => {
            if (sizeSelect === null) return;
            setPageSize(Number(sizeSelect.value));
        };
        /** Keep the first row the reader was looking at on the page they land on. @param {number} next */
        const setPageSize = (next) => {
            if (!(next > 0)) return;
            const first = page * size;
            size = next;
            if (sizeSelect !== null) sizeSelect.value = String(next);
            page = Math.floor(first / size);
            if (serverMode) request();
            else render();
        };

        // ── Columns ────────────────────────────────────────────────────
        /** @param {Iterable<number>} next */
        const setHidden = (next) => {
            hiddenColumns = new Set([...next].filter((at) => headers[at] !== undefined && !locked[at] && !controlColumn(at)));
            memory?.write(
                'columns',
                [...hiddenColumns].sort((a, b) => a - b).map((at) => columnIds[at]),
            );
            syncColumns();
            wrap.dispatchEvent(new CustomEvent(COLUMNS_EVENT, { bubbles: true, detail: { hidden: [...hiddenColumns].sort((a, b) => a - b) } }));
            render();
        };
        /** @param {Event} event */
        const onColumnChange = (event) => {
            const box = /** @type {HTMLInputElement} */ (event.target);
            if (box.dataset.kpDatatableColumn === undefined) return;
            const at = Number(box.value);
            const next = new Set(hiddenColumns);
            if (box.checked) next.delete(at);
            else next.add(at);
            setHidden(next);
        };
        /** @param {MouseEvent} event */
        const onColumnClick = (event) => {
            if (/** @type {HTMLElement} */ (event.target).closest('[data-kp-datatable-columns-reset]') !== null) setHidden([]);
        };

        // ── Expansion ──────────────────────────────────────────────────
        /** @param {HTMLTableRowElement} row @param {boolean} open */
        const setExpanded = (row, open) => {
            const key = keyOf(row);
            if (open === expanded.has(key)) return;
            if (open) expanded.add(key);
            else expanded.delete(key);
            const detail = open ? detailFor(row) : details.get(row);
            render();
            wrap.dispatchEvent(
                new CustomEvent(EXPAND_EVENT, { bubbles: true, detail: { key, row, open, cell: detail?.cells[0] ?? null, expanded: [...expanded] } }),
            );
        };
        /** @param {readonly string[]} keys */
        const expandKeys = (keys) => {
            const want = new Set(keys);
            for (const row of all) {
                const key = keyOf(row);
                if (want.has(key) !== expanded.has(key)) setExpanded(row, want.has(key));
            }
        };

        const announceSelection = () => {
            const rows = selectedRows();
            const keys = rows.map(keyOf);
            wrap.dispatchEvent(new CustomEvent(SELECT_EVENT, { bubbles: true, detail: { keys, rows } }));
        };
        /** @param {Event} event */
        const onBodyChange = (event) => {
            const target = /** @type {HTMLElement} */ (event.target);
            if (!target.matches(SELECT_ROW)) return;
            if (serverMode) {
                const row = target.closest('tr');
                if (row !== null) {
                    if (/** @type {HTMLInputElement} */ (target).checked) serverSelection.add(keyOf(row));
                    else serverSelection.delete(keyOf(row));
                }
            }
            syncSelectAll();
            syncActions();
            announceSelection();
        };
        const onSelectAll = () => {
            if (selectAll === null) return;
            // The page, and only the page [gap-13]: ticking rows on pages
            // nobody has looked at is how a bulk action reaches rows its
            // user never saw.
            for (const row of pageRows) {
                const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
                if (box !== null) box.checked = selectAll.checked;
                if (serverMode) {
                    if (selectAll.checked) serverSelection.add(keyOf(row));
                    else serverSelection.delete(keyOf(row));
                }
            }
            selectAll.indeterminate = false;
            syncActions();
            announceSelection();
        };
        /** @param {readonly string[]} keys */
        const select = (keys) => {
            const want = new Set(keys);
            if (serverMode) {
                serverSelection.clear();
                for (const key of keys) serverSelection.add(key);
            }
            for (const row of all) {
                const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
                if (box !== null) box.checked = want.has(keyOf(row));
            }
            syncSelectAll();
            syncActions();
            announceSelection();
        };
        const onClearSelection = () => select([]);

        // ── Inline edit (#inline-edit) ─────────────────────────────────
        /**
         * @typedef {{ row: HTMLTableRowElement, column: number, kind: EditKind, button: HTMLButtonElement, holder: HTMLElement,
         *   control: HTMLInputElement | HTMLSelectElement, error: HTMLElement, previous: string, detach: () => void, busy: boolean }} Editing
         */
        /** @type {Editing | null} */
        let editing = null;
        /** @type {{ row: HTMLTableRowElement, column: number, before: string, after: string } | null} */
        let lastEdit = null;
        /** Whether the drawn list of the select being edited was open when a key went down. */
        let listWasOpen = false;

        /** @param {string} text @param {{ undo?: boolean }} [options] */
        const logEdit = (text, { undo: withUndo = false } = {}) => {
            if (editLog === null) return;
            editLog.textContent = text;
            if (!withUndo) return;
            const button = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--ghost kp-button--sm'));
            button.type = 'button';
            button.dataset.kpDatatableUndo = '';
            button.textContent = getStrings().undo;
            editLog.append(' ', button);
        };
        /** Write a saved value into its cell, into the badge or the element that held the text. @param {HTMLTableCellElement} cell @param {string} value */
        const writeCell = (cell, value) => {
            const holder = /** @type {HTMLElement} */ (cell.querySelector(EDIT_VALUE) ?? cell);
            const only = holder.children.length === 1 && holder.children[0]?.children.length === 0 ? holder.children[0] : null;
            if (only !== null && (holder.textContent ?? '').trim() === (only.textContent ?? '').trim()) only.textContent = value;
            else holder.textContent = value;
        };
        const closeEditor = () => {
            if (editing === null) return;
            const current = editing;
            editing = null;
            current.detach();
            current.holder.remove();
            current.button.hidden = false;
            grid?.sync();
        };
        /** @param {HTMLTableRowElement} row @param {number} column */
        const openEditor = async (row, column) => {
            if (editing !== null && !(await commitEdit(true))) return;
            const kind = editKinds[column];
            const cell = row.cells[column];
            const button = /** @type {HTMLButtonElement | null} */ (cell?.querySelector(EDIT_CELL) ?? null);
            if (kind === null || kind === undefined || cell === undefined || button === null) return;
            const s = getStrings();
            const header = headers[column];
            const key = keyOf(row);
            const previous = cellText(row, column);
            const holder = make('div', 'kp-datatable__editor');
            holder.dataset.kpDatatableEditorWrap = '';
            holder.setAttribute('data-density', 'compact');
            const errorId = `${id}-edit-error`;
            const error = make('p', 'kp-field__error');
            error.id = errorId;
            error.hidden = true;
            /** @type {HTMLInputElement | HTMLSelectElement} */
            let control;
            /** @type {() => void} */
            let detachControl = () => {};
            if (kind === 'select') {
                const select = /** @type {HTMLSelectElement} */ (make('select', 'kp-field__input'));
                const declared = splitList(header?.dataset.kpEditOptions);
                const values = declared.length > 0 ? declared : [...new Set(all.map((r) => cellText(r, column)).filter((v) => v !== ''))];
                if (!values.includes(previous)) values.unshift(previous);
                for (const value of values) {
                    const option = /** @type {HTMLOptionElement} */ (make('option'));
                    option.value = value;
                    option.textContent = value;
                    select.append(option);
                }
                select.value = previous;
                control = select;
                holder.append(select);
            } else {
                const input = /** @type {HTMLInputElement} */ (make('input', 'kp-field__input'));
                input.value = kind === 'date' ? '' : previous;
                if (kind === 'number') {
                    input.type = 'number';
                    if (header?.dataset.kpEditMin !== undefined) input.min = header.dataset.kpEditMin;
                    if (header?.dataset.kpEditMax !== undefined) input.max = header.dataset.kpEditMax;
                } else if (kind === 'text') input.type = 'text';
                control = input;
                if (kind === 'date') {
                    input.id = `${id}-edit-date`;
                    holder.append(datePickerFor(input));
                } else holder.append(input);
            }
            control.dataset.kpDatatableEditor = '';
            control.setAttribute('aria-label', s.tableEditField(labelOf(column), key));
            control.setAttribute('aria-describedby', errorId);
            if (header?.dataset.kpEditRequired !== undefined) control.setAttribute('aria-required', 'true');
            holder.append(error);
            button.hidden = true;
            cell.append(holder);
            if (kind === 'select' && drawsSelect(control)) detachControl = attachSelect(/** @type {HTMLSelectElement} */ (control));
            if (kind === 'date') {
                const detachPickers = attachDatePickers(holder);
                const picker = holder.querySelector('[data-kp-datepicker]');
                const handle = picker === null ? null : datePicker(picker);
                if (previous !== '') handle?.set(previous);
                detachControl = detachPickers;
            }
            editing = { row, column, kind, button, holder, control, error, previous, detach: detachControl, busy: false };
            control.focus();
            if (control instanceof HTMLInputElement && kind !== 'date') control.select();
            logEdit(s.tableEditing(labelOf(column), key));
        };

        /** @param {string} message */
        const refuse = (message) => {
            if (editing === null) return;
            editing.error.textContent = message;
            editing.error.hidden = false;
            editing.control.setAttribute('aria-invalid', 'true');
            editing.control.focus();
        };

        /**
         * Tell the app about a change and wait for its answer: null when it
         * accepts, the message when it refuses.
         *
         * @param {HTMLTableRowElement} row @param {number} column @param {string} value @param {string} previous @param {boolean} isUndo
         * @returns {Promise<string | null>}
         */
        const askApp = async (row, column, value, previous, isUndo) => {
            const s = getStrings();
            /** @type {string | null} */
            let refused = null;
            /** @type {Promise<unknown>[]} */
            const waits = [];
            /** @type {EditDetail} */
            const detail = {
                key: keyOf(row),
                row,
                cell: /** @type {HTMLTableCellElement} */ (row.cells[column]),
                column,
                label: labelOf(column),
                value,
                previous,
                undo: isUndo,
                reject: (message) => {
                    refused = message ?? s.tableEditInvalid;
                },
                waitUntil: (promise) => {
                    waits.push(promise);
                },
            };
            const event = new CustomEvent(EDIT_EVENT, { bubbles: true, cancelable: true, detail });
            wrap.dispatchEvent(event);
            if (event.defaultPrevented && refused === null) refused = s.tableEditInvalid;
            if (onEdit !== undefined) waits.push(Promise.resolve().then(() => onEdit(detail)));
            if (refused === null && waits.length > 0) {
                try {
                    for (const answer of await Promise.all(waits)) {
                        if (typeof answer === 'string') refused = answer;
                        else if (answer === false) refused = s.tableEditInvalid;
                    }
                } catch (error) {
                    refused = error instanceof Error && error.message !== '' ? error.message : s.tableEditInvalid;
                }
            }
            return refused;
        };

        /** @param {boolean} save @returns {Promise<boolean>} whether the editor closed */
        const commitEdit = async (save) => {
            const current = editing;
            if (current === null) return true;
            if (current.busy) return false;
            const s = getStrings();
            const { row, column, kind, button, control, previous } = current;
            const key = keyOf(row);
            if (!save) {
                closeEditor();
                logEdit(s.tableEditCancelled);
                button.focus();
                return true;
            }
            const value =
                kind === 'date' ? (control.dataset.kpDateValue ?? (control.value.trim() === '' ? '' : control.value.trim())) : control.value.trim();
            if (value === '' && headers[column]?.dataset.kpEditRequired !== undefined) {
                refuse(s.tableEditRequired);
                return false;
            }
            if (kind === 'number' && value !== '' && Number.isNaN(Number(value))) {
                refuse(s.tableEditInvalid);
                return false;
            }
            if (value === previous) {
                closeEditor();
                button.focus();
                return true;
            }
            current.busy = true;
            const refused = await askApp(row, column, value, previous, false);
            current.busy = false;
            if (editing !== current) return true;
            if (refused !== null) {
                refuse(refused);
                return false;
            }
            const cell = /** @type {HTMLTableCellElement} */ (row.cells[column]);
            writeCell(cell, value);
            closeEditor();
            lastEdit = { row, column, before: previous, after: value };
            labelRow(row);
            logEdit(s.tableEdited(key, labelOf(column), previous, value), { undo: true });
            button.focus();
            return true;
        };

        const undoEdit = async () => {
            const last = lastEdit;
            if (last === null) return;
            const s = getStrings();
            const refused = await askApp(last.row, last.column, last.before, last.after, true);
            if (refused !== null) {
                logEdit(refused);
                return;
            }
            lastEdit = null;
            writeCell(/** @type {HTMLTableCellElement} */ (last.row.cells[last.column]), last.before);
            labelRow(last.row);
            logEdit(s.tableEditUndone(keyOf(last.row), labelOf(last.column), last.before));
            /** @type {HTMLElement | null} */ (last.row.cells[last.column]?.querySelector(EDIT_CELL) ?? null)?.focus();
        };

        /** @param {KeyboardEvent} event */
        const onEditorKeyCapture = (event) => {
            const target = /** @type {HTMLElement} */ (event.target);
            if (target.matches('select[data-kp-datatable-editor]')) listWasOpen = target.getAttribute('aria-expanded') === 'true';
        };
        /** @param {KeyboardEvent} event */
        const onEditorKey = (event) => {
            const target = /** @type {HTMLElement} */ (event.target);
            if (editing === null || !target.matches('[data-kp-datatable-editor]')) return;
            const isSelect = target instanceof HTMLSelectElement;
            if (event.key === 'Enter') {
                event.preventDefault();
                // Enter on a closed drawn list only opened it; Enter on an open
                // list took the highlighted option, and that is the save.
                if (!isSelect || listWasOpen || !drawsSelect(target)) void commitEdit(true);
            } else if (event.key === 'Escape') {
                const panelOpen = editing.holder.querySelector('[data-kp-date-panel]:not([hidden])') !== null;
                if ((isSelect && listWasOpen) || panelOpen) return;
                event.preventDefault();
                void commitEdit(false);
            }
        };
        /** Saving on blur, after the click that caused it has been handled. @param {FocusEvent} event */
        const onEditorFocusOut = (event) => {
            if (editing === null || !editing.holder.contains(/** @type {Node} */ (event.target))) return;
            const current = editing;
            setTimeout(() => {
                if (editing !== current || current.busy) return;
                if (current.holder.contains(document.activeElement)) return;
                void commitEdit(true);
            }, 0);
        };

        /** @param {MouseEvent} event */
        const onWrapClick = (event) => {
            const target = /** @type {HTMLElement} */ (event.target);
            if (target.closest(CLEAR_SELECTION) !== null && actions?.contains(target)) onClearSelection();
            if (target.closest(CLEAR) !== null && empty?.contains(target)) onClear();
            if (target.closest(RETRY) !== null && failedSlot?.contains(target)) onRetry();
            if (target.closest(SORT_RESET) !== null) commitSorts(initialSorts.map((key) => ({ ...key })));
            if (target.closest(EXPAND_ALL) !== null)
                expandKeys([...new Set([...expanded, ...pageRows.filter((row) => row.querySelector(ROW_TOGGLE) !== null).map(keyOf)])]);
            if (target.closest(COLLAPSE_ALL) !== null) expandKeys([]);
            if (target.closest('[data-kp-datatable-undo]') !== null && editLog?.contains(target)) void undoEdit();
            const rowToggle = /** @type {HTMLElement | null} */ (target.closest(ROW_TOGGLE));
            if (rowToggle !== null && body.contains(rowToggle)) {
                const row = /** @type {HTMLTableRowElement} */ (rowToggle.closest('tr'));
                setExpanded(row, !expanded.has(keyOf(row)));
                /** @type {HTMLElement | null} */ (row.querySelector(ROW_TOGGLE))?.focus();
            }
            const editButton = /** @type {HTMLElement | null} */ (target.closest(EDIT_CELL));
            if (editButton !== null && body.contains(editButton)) {
                const cell = /** @type {HTMLTableCellElement} */ (editButton.closest('td, th'));
                void openEditor(/** @type {HTMLTableRowElement} */ (cell.parentElement), cell.cellIndex);
            }
        };

        // The table's own selects wear the package's drawn list, as every
        // .kp-field__input select does since Kenny's form of 2026-09-13 — here
        // as well as in auto.js, because two of them are built by this attach
        // after auto.js has passed, and a consumer may attach only the tables.
        for (const control of [scopeSelect, densitySelect, sortBy, sizeSelect]) {
            if (control === null || control.dataset.kpSelectAttached !== undefined || !drawsSelect(control)) continue;
            cleanups.push(attachSelect(control));
        }

        search?.addEventListener('input', onSearch);
        scopeSelect?.addEventListener('change', onScope);
        densitySelect?.addEventListener('change', onDensity);
        panel?.addEventListener('input', onPanel);
        panel?.addEventListener('change', onPanel);
        panel?.addEventListener(DATE_EVENT, onPanel);
        toggle?.addEventListener('click', onToggle);
        addPop?.addEventListener('toggle', onAddToggle);
        addMenu?.addEventListener('click', onAddMenuClick);
        addMenu?.addEventListener('keydown', onAddMenuKey);
        filterEditor?.addEventListener('submit', onEditorSubmit);
        filterEditor?.addEventListener('click', onEditorClick);
        filterEditor?.addEventListener('keydown', onEditorKeydown);
        pillsList.addEventListener('click', onPillsClick);
        sortBy?.addEventListener('change', onSortBy);
        sortDirection?.addEventListener('click', onSortDirection);
        sizeSelect?.addEventListener('change', onPageSize);
        columnList?.addEventListener('change', onColumnChange);
        columnList?.addEventListener('click', onColumnClick);
        wrap.addEventListener('click', onWrapClick);
        wrap.addEventListener('keydown', onEditorKeyCapture, { capture: true });
        wrap.addEventListener('keydown', onEditorKey);
        wrap.addEventListener('focusout', onEditorFocusOut);
        table.tHead?.addEventListener('click', onHeadClick);
        table.tHead?.addEventListener('keydown', onHeadKey);
        body.addEventListener('change', onBodyChange);
        selectAll?.addEventListener('change', onSelectAll);
        query = search?.value ?? '';
        // Headers the server rendered already sorted keep their sort, in the
        // order `data-kp-sort-priority` gives, else the order they stand in.
        const initialSorts = headers
            .map((header, at) => ({ header, at }))
            .filter(({ header }) => ['ascending', 'descending'].includes(header.getAttribute('aria-sort') ?? ''))
            .sort((a, b) => (Number(a.header.dataset.kpSortPriority) || a.at + 1000) - (Number(b.header.dataset.kpSortPriority) || b.at + 1000))
            .map(({ header, at }) => ({ column: at, direction: /** @type {'ascending' | 'descending'} */ (header.getAttribute('aria-sort')) }))
            .slice(0, multi ? undefined : 1);
        sorts = initialSorts.map((key) => ({ ...key }));
        // A filter the markup declared as already set: `data-kp-filter-value`,
        // a list for a choice, "from,to" for a range or a date.
        for (const at of filterColumns) {
            const declared = headers[at]?.dataset.kpFilterValue;
            if (declared === undefined) continue;
            const kind = filterKinds[at];
            if (kind === 'choice') filters.set(at, splitList(declared));
            else {
                const [from = '', to = ''] = declared.split(',').map((part) => part.trim());
                filters.set(at, { from, to });
            }
        }
        if (gridMode) {
            grid = attachGrid(table, {
                pageRows: gridPageRows,
                onMove: ({ row, rows, column, cell }) => {
                    if (gridReadout === null) return;
                    const at = cell.cellIndex;
                    const text =
                        cell.parentElement?.parentElement?.tagName === 'THEAD'
                            ? labelOf(at)
                            : cellText(/** @type {HTMLTableRowElement} */ (cell.parentElement), at);
                    void column;
                    gridReadout.textContent = getStrings().tableGridPosition(row, rows, labelOf(at), text);
                },
            });
        }
        writeControls();
        renderPills();
        syncColumns();
        if (serverMode) {
            if (all.length > 0 && Number.isFinite(total)) {
                state = 'ready';
                render();
            } else request();
        } else applyFilter();

        let resizeFrame = 0;
        const resize =
            fixedCount > 0 && typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(() => {
                      cancelAnimationFrame(resizeFrame);
                      resizeFrame = requestAnimationFrame(syncFixed);
                  })
                : null;
        resize?.observe(table);

        /** @type {DataTableHandle} */
        const handle = {
            element: wrap,
            view,
            sort: setSort,
            sortBy: (keys) => commitSorts(keys.map((key) => ({ column: key.column, direction: key.direction }))),
            page: (next) => {
                page = Math.max(0, next);
                if (serverMode) request();
                else render();
            },
            pageSize: setPageSize,
            query: (next) => {
                query = next;
                if (search !== null) search.value = next;
                applyFilter();
            },
            scope: (column) => {
                scope = column;
                if (scopeSelect !== null) scopeSelect.value = column === null ? '' : String(column);
                applyFilter();
            },
            filter: setFilter,
            clearFilters,
            editFilter: (column) => {
                if (addMode) {
                    if (column === null) closeFilterEditor(false);
                    else openFilterEditor(column, filters.has(column) ? column : null);
                } else if (panel !== null && toggle !== null) {
                    panel.hidden = column === null;
                    toggle.setAttribute('aria-expanded', String(!panel.hidden));
                }
            },
            hideColumns: (columns) => setHidden(columns),
            expand: expandKeys,
            density: setDensity,
            state: (next) => {
                state = next;
                render();
            },
            reload: () => (serverMode ? request() : applyFilter({ keepPage: true })),
            edit: (key, column) => {
                const row = all.find((r) => keyOf(r) === key);
                if (row !== undefined) void openEditor(row, column);
            },
            cancelEdit: () => void commitEdit(false),
            rows: (which = 'view') => (which === 'page' ? [...pageRows] : [...shownRows]),
            selected: () => (serverMode ? [...serverSelection] : selectedRows().map(keyOf)),
            select,
            refresh: () => {
                collectDetails();
                all = [...body.rows].filter(isRow);
                for (const row of all) {
                    if (!rendered.includes(row)) rendered.push(row);
                    prepareRow(row);
                }
                syncColumns();
                refreshChoices();
                applyFilter({ keepPage: false });
            },
        };
        handles.set(wrap, handle);
        created.push(handle);

        cleanups.push(() => {
            clearTimeout(pending);
            controller?.abort();
            resize?.disconnect();
            cancelAnimationFrame(resizeFrame);
            closeEditor();
            grid?.detach();
            search?.removeEventListener('input', onSearch);
            scopeSelect?.removeEventListener('change', onScope);
            densitySelect?.removeEventListener('change', onDensity);
            panel?.removeEventListener('input', onPanel);
            panel?.removeEventListener('change', onPanel);
            panel?.removeEventListener(DATE_EVENT, onPanel);
            toggle?.removeEventListener('click', onToggle);
            closeFilterEditor(false);
            if (addPop?.matches(':popover-open')) addPop.hidePopover();
            addPop?.removeEventListener('toggle', onAddToggle);
            addMenu?.removeEventListener('click', onAddMenuClick);
            addMenu?.removeEventListener('keydown', onAddMenuKey);
            filterEditor?.removeEventListener('submit', onEditorSubmit);
            filterEditor?.removeEventListener('click', onEditorClick);
            filterEditor?.removeEventListener('keydown', onEditorKeydown);
            pillsList.removeEventListener('click', onPillsClick);
            sortBy?.removeEventListener('change', onSortBy);
            sortDirection?.removeEventListener('click', onSortDirection);
            sizeSelect?.removeEventListener('change', onPageSize);
            columnList?.removeEventListener('change', onColumnChange);
            columnList?.removeEventListener('click', onColumnClick);
            wrap.removeEventListener('click', onWrapClick);
            wrap.removeEventListener('keydown', onEditorKeyCapture, { capture: true });
            wrap.removeEventListener('keydown', onEditorKey);
            wrap.removeEventListener('focusout', onEditorFocusOut);
            table.tHead?.removeEventListener('click', onHeadClick);
            table.tHead?.removeEventListener('keydown', onHeadKey);
            body.removeEventListener('change', onBodyChange);
            selectAll?.removeEventListener('change', onSelectAll);
            // Put back what the server rendered: order, visibility, the
            // sort marks, the pager, the empty state, the focusability, and
            // every part this attach added.
            for (const row of body.querySelectorAll(`:scope > ${SKELETON_ROW}`)) row.remove();
            for (const detail of builtDetails) detail.remove();
            for (const row of prepared) unprepareRow(row);
            for (const row of rendered) {
                row.hidden = false;
                body.append(row);
                const detail = details.get(row);
                if (detail !== undefined && !builtDetails.has(detail)) {
                    detail.hidden = detailsWereHidden.get(detail) ?? detail.hidden;
                    body.append(detail);
                }
            }
            syncFixedColumns(table, 0);
            headers.forEach((header, i) => {
                header.querySelector(':scope .kp-datatable__sort-order')?.remove();
                header.hidden = headersWereHidden[i] ?? false;
                const was = headerSort[i];
                if (was === null || was === undefined) header.removeAttribute('aria-sort');
                else header.setAttribute('aria-sort', was);
                const tab = headerTab[i];
                if (tab === null || tab === undefined) header.removeAttribute('tabindex');
                else header.setAttribute('tabindex', tab);
            });
            if (pager !== null) pager.textContent = '';
            if (empty !== null) empty.hidden = emptyWasHidden;
            if (loadingSlot !== null) loadingSlot.hidden = true;
            if (failedSlot !== null) failedSlot.hidden = true;
            if (actions !== null) actions.hidden = true;
            for (const node of added) node.remove();
            for (const step of undo) step();
            if (densityWas === null) wrap.removeAttribute('data-density');
            else wrap.setAttribute('data-density', densityWas);
            if (busyWas === null) wrap.removeAttribute('aria-busy');
            else wrap.setAttribute('aria-busy', busyWas);
            delete wrap.dataset.kpState;
            handles.delete(wrap);
            delete wrap.dataset.kpDatatableAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
