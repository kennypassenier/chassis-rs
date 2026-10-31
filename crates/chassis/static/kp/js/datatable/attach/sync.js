// Syncs the table's parts with its state: selection, sort marks, columns, fixed columns and card labels.
import { CHECK_CLASS, DETAIL, GROUP_ROW, SELECTED_COUNT, SELECT_ROW, SKELETON_ROW, SORT_RESET } from '../selectors.js';
import { getStrings } from '../../strings.js';
import { syncFixedColumns } from '../grid.js';
/** @typedef {import('../events.js').FilterValue} FilterValue */
/** @typedef {import('../grid.js').GridHandle} GridHandle */
/** @typedef {import('../events.js').View} View */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableSync {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        /** Keys ticked in a server-backed table, which outlive the rows of one page. @type {Set<string>} */
        this.serverSelection = new Set();
        this.fixedAttribute = this.t.wrap.dataset.kpFixedColumns;
        this.fixedCount = this.fixedAttribute === undefined ? 0 : Number.parseInt(this.fixedAttribute, 10) || this.t.columns.keyColumn + 1;
        this.fixedEndCount = Math.max(0, Number.parseInt(this.t.wrap.dataset.kpFixedEnd ?? '', 10) || (this.t.wrap.dataset.kpFixedEnd === undefined ? 0 : 1));
        /**
         * A table that becomes cards says in each cell which column it is [datatable-r5-1019, B2]: a cell the markup
         * gave no `data-label` takes its header's words, so a server that renders plain rows still gets cards. A label
         * the markup wrote stays; a cell under a header with no words (the selection box, the actions) gets none and
         * spans the card. Read again on every render, for rows that came later; detach takes the derived ones away.
         * @type {Set<HTMLTableCellElement>}
         */
        this.derivedLabels = new Set();
        this.cardsWanted = this.t.wrap.hasAttribute('data-kp-cards') || this.t.table.hasAttribute('data-kp-cards');
        this.t.identity.undo.push(() => {
            for (const cell of this.derivedLabels) cell.removeAttribute('data-label');
            this.derivedLabels.clear();
        });
        /** @type {GridHandle | null} */
        this.grid = null;
    }

    /** A detail row, made ready to show: its class, its id and its span. @param {HTMLTableRowElement} row */
    detailFor(row) {
        let detail = this.t.details.details.get(row);
        if (detail === undefined && this.t.details.expandable) {
            const hasMarkup = [...this.t.details.detailsWereHidden.keys()].length > 0;
            if (this.t.settings.detailFn === undefined && hasMarkup) return undefined;
            detail = /** @type {HTMLTableRowElement} */ (this.t.identity.make('tr'));
            detail.dataset.kpRowDetail = '';
            detail.hidden = true;
            const cell = this.t.identity.make('td');
            detail.append(cell);
            this.t.details.details.set(row, detail);
            this.t.details.builtDetails.add(detail);
            if (this.t.settings.detailFn !== undefined) {
                const content = this.t.settings.detailFn(row);
                if (typeof content === 'string') cell.textContent = content;
                else if (content !== null && content !== undefined) cell.append(content);
            }
        }
        if (detail === undefined) return undefined;
        if (!detail.classList.contains('kp-datatable__detail')) {
            detail.classList.add('kp-datatable__detail');
            const node = detail;
            if (!this.t.details.builtDetails.has(detail)) this.t.identity.undo.push(() => node.classList.remove('kp-datatable__detail'));
        }
        if (detail.id === '') {
            detail.id = `${this.t.identity.id}-detail-${this.t.columns.keyOf(row) || row.rowIndex}`;
            const node = detail;
            if (!this.t.details.builtDetails.has(detail)) this.t.identity.undo.push(() => node.removeAttribute('id'));
        }
        const cell = detail.cells[0];
        if (cell !== undefined) cell.colSpan = this.t.groups.visibleColumns();
        return detail;
    }

    /** The filters under the column ids instead of the numbers [wish-1028]. @returns {Record<string, FilterValue>} */
    byField() {
        return Object.fromEntries([...this.t.model.filters].map(([at, value]) => [this.t.columns.columnIds[at], value]));
    }

    /**
     * A column asked for by number, or by its id (`data-kp-field`, else its text); -1 when the id names none [wish-1028].
     * @param {number | string} column
     */
    columnAt(column) {
        return (typeof column === 'string' ? this.t.columns.columnIds.indexOf(column) : column);
    }

    /** @returns {View} */
    view() {
        return ({
        shown: this.t.controls.serverMode ? this.t.busy.total || 0 : this.t.model.shownRows.length,
        total: this.t.controls.serverMode ? this.t.busy.total || 0 : this.t.model.all.length,
        page: this.t.model.page,
        pageNumber: this.t.model.page + 1,
        pages: Math.max(1, Math.ceil((this.t.controls.serverMode ? this.t.busy.total || 0 : this.t.model.shownRows.length) / this.t.controls.size)),
        pageSize: this.t.controls.size,
        query: this.t.model.query,
        scope: this.t.model.scope,
        filters: Object.fromEntries(this.t.model.filters),
        filtersByField: this.byField(),
        sort: this.t.model.sorts[0] ?? null,
        sorts: this.t.model.sorts.map((key) => ({ ...key })),
        hidden: [...this.t.sortSetup.hiddenColumns].sort((a, b) => a - b),
        expanded: [...this.t.details.expanded],
        density: this.t.wrap.getAttribute('data-density') === 'compact' ? 'compact' : 'comfortable',
        state: this.t.model.state,
        keys: this.t.model.shownRows.map(this.t.bound(this.t.columns, this.t.columns.keyOf)),
        pageKeys: this.t.model.pageRows.map(this.t.bound(this.t.columns, this.t.columns.keyOf)),
        folded: [...this.t.groups.folded],
    });
    }

    selectedRows() {
        return this.t.model.all.filter((row) => {
            const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
            return box !== null && box.checked;
        });
    }

    /** The header box reads the rows on this page, which are the rows it acts on [gap-13]. */
    syncSelectAll() {
        if (this.t.controls.selectAll === null) return;
        const boxes = this.t.model.pageRows.map((row) => /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW))).filter((b) => b !== null);
        const checked = boxes.filter((b) => b.checked).length;
        this.t.controls.selectAll.checked = boxes.length > 0 && checked === boxes.length;
        // Indeterminate is the honest third state: a header box that
        // reads "checked" while three of ten rows are selected lies.
        this.t.controls.selectAll.indeterminate = checked > 0 && checked < boxes.length;
    }

    syncActions() {
        if (this.t.controls.actions === null) return;
        const count = this.t.controls.serverMode ? this.serverSelection.size : this.selectedRows().length;
        this.t.controls.actions.hidden = count === 0;
        const counter = this.t.controls.actions.querySelector(SELECTED_COUNT);
        if (counter !== null) counter.textContent = getStrings().tableSelected(count);
    }

    /** Skeleton rows for a first load with no loading slot of the consumer's, as #states shows it. */
    syncSkeleton() {
        const want = this.t.model.state === 'loading' && this.t.model.all.length === 0 && this.t.controls.loadingSlot === null;
        const have = [...this.t.body.querySelectorAll(`:scope > ${SKELETON_ROW}`)];
        if (!want) {
            for (const row of have) row.remove();
            return;
        }
        if (have.length > 0) return;
        for (let i = 0; i < 3; i += 1) {
            const row = this.t.identity.make('tr');
            row.dataset.kpSkeletonRow = '';
            row.setAttribute('aria-hidden', 'true');
            this.t.columns.headers.forEach((_, at) => {
                const cell = this.t.identity.make('td');
                if (this.t.sortSetup.hiddenColumns.has(at)) cell.hidden = true;
                if (!this.t.columns.controlColumn(at)) cell.append(this.t.identity.make('span', 'kp-skeleton'));
                row.append(cell);
            });
            this.t.body.append(row);
        }
    }

    syncStateParts() {
        if (this.t.model.state === 'loading') this.t.wrap.setAttribute('aria-busy', 'true');
        else if (this.t.busy.busyWas === null) this.t.wrap.removeAttribute('aria-busy');
        else this.t.wrap.setAttribute('aria-busy', this.t.busy.busyWas);
        this.t.wrap.dataset.kpState = this.t.model.state;
        // A skeleton on a first load, the old rows dimmed on a refresh:
        // the stylesheet dims, this only decides whether there is
        // anything to dim.
        if (this.t.controls.loadingSlot !== null) this.t.controls.loadingSlot.hidden = !(this.t.model.state === 'loading' && this.t.model.all.length === 0);
        if (this.t.controls.failedSlot !== null) this.t.controls.failedSlot.hidden = this.t.model.state !== 'failed';
        this.t.layoutSetup.syncCover();
        this.syncSkeleton();
    }

    syncCardSort() {
        if (this.t.sortSetup.sortBy === null || this.t.sortSetup.sortDirection === null) return;
        const s = getStrings();
        const first = this.t.model.sorts[0];
        this.t.sortSetup.sortBy.value = first === undefined ? '' : String(first.column);
        this.t.sortSetup.sortDirection.textContent = first?.direction === 'descending' ? s.tableSortDescending : s.tableSortAscending;
        this.t.sortSetup.sortDirection.disabled = this.t.sortSetup.sortBy.value === '';
    }

    // aria-sort on each sorted column and 'none' on every other sortable
    // header: a stale "ascending" on a column that is no longer a key is
    // worse than saying nothing. With more than one key each sorted header
    // carries its place, the number the mock drew [#multi-sort].
    syncSortMarks() {
        const s = getStrings();
        this.t.columns.headers.forEach((header, at) => {
            header.querySelector(':scope .kp-datatable__sort-order')?.remove();
            if (header.dataset.kpSort === undefined) return;
            const index = this.t.model.sorts.findIndex((key) => key.column === at);
            const key = this.t.model.sorts[index];
            header.setAttribute('aria-sort', key === undefined ? 'none' : key.direction);
            if (key === undefined || this.t.model.sorts.length < 2) return;
            const mark = this.t.identity.make('span', 'kp-datatable__sort-order');
            mark.setAttribute('aria-hidden', 'true');
            mark.textContent = String(index + 1);
            (header.querySelector('button') ?? header).append(mark);
        });
        if (this.t.sortSetup.openingSort !== null) {
            const atOpening = JSON.stringify(this.t.model.sorts) === this.t.sortSetup.openingSort;
            for (const back of this.t.wrap.querySelectorAll(SORT_RESET)) back.toggleAttribute('data-kp-datatable-at-opening', atOpening);
        }
        if (this.t.sortSetup.sortSummary !== null) {
            this.t.sortSetup.sortSummary.textContent =
                this.t.model.sorts.length === 0
                    ? s.tableNotSorted
                    : s.tableSortedBy(
                          this.t.model.sorts.map((key) =>
                              s.tableSortKey(
                                  this.t.columns.labelOf(key.column),
                                  key.direction,
                                  this.t.columns.orders[key.column] ? 'order' : (this.t.columns.headers[key.column]?.dataset.kpSort ?? 'text'),
                              ),
                          ),
                      );
            // One line: the whole of it on hover when it is cut [fix-83].
            this.t.sortSetup.sortSummary.title = this.t.sortSetup.sortSummary.textContent ?? '';
        }
    }

    syncColumns() {
        this.t.columns.headers.forEach((header, at) => {
            header.hidden = this.t.sortSetup.hiddenColumns.has(at) || (this.t.columns.headersWereHidden[at] ?? false);
        });
        for (const row of this.t.body.rows) {
            if (row.matches(DETAIL) || row.matches(GROUP_ROW)) continue;
            this.t.columns.headers.forEach((_, at) => {
                const cell = row.cells[at];
                if (cell !== undefined) cell.hidden = this.t.sortSetup.hiddenColumns.has(at);
            });
        }
        if (this.t.sortSetup.columnList !== null && this.t.sortSetup.columnList.childElementCount > 0) {
            // Built once and then only ticked, so a box keeps its focus and
            // its identity while the reader goes down the list.
            for (const box of this.t.sortSetup.columnList.querySelectorAll('[data-kp-datatable-column]')) {
                const input = /** @type {HTMLInputElement} */ (box);
                input.checked = !this.t.sortSetup.hiddenColumns.has(Number(input.value));
            }
        } else if (this.t.sortSetup.columnList !== null) this.buildColumnList(this.t.sortSetup.columnList);
        if (this.t.sortSetup.columnCount !== null)
            this.t.sortSetup.columnCount.textContent = getStrings().tableColumnsShown(
                this.t.sortSetup.choosable.length - [...this.t.sortSetup.hiddenColumns].filter((at) => this.t.sortSetup.choosable.includes(at)).length,
                this.t.sortSetup.choosable.length,
            );
    }

    /** The column menu's list, built once: a box per column that may be hidden, then "Show all columns". @param {HTMLElement} list */
    buildColumnList(list) {
        const s = getStrings();
        for (const at of this.t.sortSetup.choosable) {
            const item = this.t.identity.make('li');
            const label = /** @type {HTMLLabelElement} */ (this.t.identity.make('label', 'kp-menu__item kp-datatable__column-option'));
            const box = /** @type {HTMLInputElement} */ (this.t.identity.make('input', CHECK_CLASS));
            box.type = 'checkbox';
            box.value = String(at);
            box.dataset.kpDatatableColumn = '';
            box.checked = !this.t.sortSetup.hiddenColumns.has(at);
            box.disabled = this.t.sortSetup.locked[at] ?? false;
            label.append(box, ` ${this.t.sortSetup.locked[at] ? s.tableColumnLocked(this.t.columns.labelOf(at)) : this.t.columns.labelOf(at)}`);
            item.append(label);
            list.append(item);
        }
        const separator = this.t.identity.make('li', 'kp-menu__separator');
        separator.setAttribute('role', 'separator');
        const resetItem = this.t.identity.make('li');
        const reset = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-menu__item'));
        reset.type = 'button';
        reset.dataset.kpDatatableColumnsReset = '';
        reset.textContent = s.tableShowAllColumns;
        resetItem.append(reset);
        list.append(separator, resetItem);
    }

    syncFixed() {
        if (this.fixedCount > 0 || this.fixedEndCount > 0) syncFixedColumns(this.t.table, this.fixedCount, this.fixedEndCount);
    }

    labelCells() {
        if (!this.cardsWanted) return;
        for (const row of this.t.model.all) {
            if (row.matches(DETAIL) || row.matches(GROUP_ROW) || row.matches(SKELETON_ROW)) continue;
            for (const cell of row.cells) {
                if (cell.hasAttribute('data-label')) continue;
                const words = this.t.columns.labelOf(cell.cellIndex);
                if (words === '') continue;
                cell.setAttribute('data-label', words);
                this.derivedLabels.add(cell);
            }
        }
    }
}
