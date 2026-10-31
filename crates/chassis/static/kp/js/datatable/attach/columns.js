// The columns: headers, labels, kinds and how a cell reads.
import { columnId } from '../../remember.js';
import { splitList } from '../filter.js';
import { EDIT_VALUE, EXPAND_COLUMN, REORDER_COLUMN, SELECT_ALL } from '../selectors.js';
/** @typedef {import('../events.js').EditKind} EditKind */
/** @typedef {import('../events.js').FilterKind} FilterKind */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableColumns {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        this.headers = /** @type {HTMLTableCellElement[]} */ ([...(this.t.details.headRow?.cells ?? [])]);
        this.headerSort = this.headers.map((h) => h.getAttribute('aria-sort'));
        this.headerTab = this.headers.map((h) => h.getAttribute('tabindex'));
        this.headersWereHidden = this.headers.map((h) => h.hidden);
        /** The column names, read once: the sort order a header shows later is not part of its name. */
        this.labels = this.headers.map((h) => (h.textContent ?? '').trim());
        /** What a remembered column or sort key is stored under: never the index, which the control columns shift. */
        this.columnIds = this.headers.map((h) => columnId(h));
        this.orders = this.headers.map((h) => (h.dataset.kpSortOrder === undefined ? null : splitList(h.dataset.kpSortOrder)));
        this.filterKinds = this.headers.map((h) => {
            const kind = h.dataset.kpFilter;
            return kind === 'choice' || kind === 'range' || kind === 'date' ? /** @type {FilterKind} */ (kind) : null;
        });
        this.editKinds = this.headers.map((h) => {
            const kind = h.dataset.kpEdit;
            return kind === 'text' || kind === 'number' || kind === 'select' || kind === 'date' ? /** @type {EditKind} */ (kind) : null;
        });
        /** The column that names a row: the first that is not a column of controls. */
        this.keyColumn = this.headers.findIndex((_, at) => !this.controlColumn(at));
    }

    /** @param {number} at */
    labelOf(at) {
        return this.labels[at] ?? '';
    }

    /** A column of controls — the selection boxes, the expand buttons — rather than of values. @param {number} at */
    controlColumn(at) {
        const header = this.headers[at];
        return header === undefined || header.querySelector(SELECT_ALL) !== null || header.matches(EXPAND_COLUMN) || header.matches(REORDER_COLUMN);
    }

    /** @param {HTMLTableRowElement} row @param {number} at */
    cellText(row, at) {
        const cell = row.cells[at];
        if (cell === undefined) return '';
        return ((cell.querySelector(EDIT_VALUE) ?? cell).textContent ?? '').trim();
    }

    /**
     * What a cell sorts and range-filters by: its `data-kp-sort-value` [kpadopt2-grids] when it has one (a
     * bar cell shows "62%" and sorts by 62; a size shows "1.4 GB" and sorts by its bytes), else what it shows.
     * Search and choice filters keep reading the shown text.
     * @param {HTMLTableRowElement} row @param {number} at
     */
    cellValue(row, at) {
        return row.cells[at]?.getAttribute('data-kp-sort-value') ?? this.cellText(row, at);
    }

    /**
     * What a choice filter reads of a cell: its `data-kp-filter-value` [kpadopt3] when it has one (a status cell shows a
     * dot, a word and a time, and is listed and matched as "running"), else what it shows. Search keeps the shown text.
     * On a header the same attribute is the filter the page opens with (read below, from `headers`).
     * @param {HTMLTableRowElement} row @param {number} at
     */
    choiceText(row, at) {
        return row.cells[at]?.getAttribute('data-kp-filter-value')?.trim() ?? this.cellText(row, at);
    }

    /** @param {HTMLTableRowElement} row */
    keyOf(row) {
        return row.dataset.kpRowKey ?? row.id ?? '';
    }
}
