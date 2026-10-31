// Registers the table's listeners and applies its initial state: the opening query, sorts and filters, the keyboard grid, the first
// draw and the watch that keeps fixed columns in place.
import { attachSelect, drawsSelect } from '../../combobox.js';
import { DATE_EVENT } from '../../datepicker.js';
import { splitList } from '../filter.js';
import { getStrings } from '../../strings.js';
import { attachGrid } from '../grid.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

/** Headers without a `data-kp-sort-priority` sort after every header that has one, in the order they stand in. */
const UNRANKED = 1000;

export class TableWire {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        this.drawSelects();
        this.addListeners();
        t.model.query = t.controls.search?.value ?? '';
        /** The sort the table opened with. */
        this.initialSorts = this.openingSorts();
        t.model.sorts = this.initialSorts.map((key) => ({ ...key }));
        t.sortSetup.openingSort = JSON.stringify(this.initialSorts);
        this.readDeclaredFilters();
        if (t.layoutSetup.gridMode) this.wireGrid();
        this.firstDraw();
        /** The frame a resize queued to put the fixed columns in place again. */
        this.resizeFrame = 0;
        /** Keeps the fixed columns in place when the table changes size, when it has any. */
        this.resize = this.watchResize();
    }

    /**
     * The table's own selects wear the package's drawn list, as every .kp-field__input select does since Kenny's form of 2026-09-13
     * — here as well as in auto.js, because two of them are built by this attach after auto.js has passed, and a consumer may attach
     * only the tables.
     */
    drawSelects() {
        const { controls, sortSetup, layoutSetup } = this.t;
        for (const control of [controls.scopeSelect, controls.densitySelect, sortSetup.sortBy, layoutSetup.sizeSelect]) {
            if (control === null || control.dataset.kpSelectAttached !== undefined || !drawsSelect(control)) continue;
            this.t.own(attachSelect(control));
        }
    }

    /** The listeners of the table and its chrome; TableUnwire removes them again, with the same bound functions. */
    addListeners() {
        this.t.controls.search?.addEventListener('input', this.t.bound(this.t.handlers, this.t.handlers.onSearch));
        this.t.controls.scopeSelect?.addEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onScope));
        this.t.controls.densitySelect?.addEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onDensity));
        this.t.filterUi.panel?.addEventListener('input', this.t.bound(this.t.handlers, this.t.handlers.onPanel));
        this.t.filterUi.panel?.addEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onPanel));
        this.t.filterUi.panel?.addEventListener(DATE_EVENT, this.t.bound(this.t.handlers, this.t.handlers.onPanel));
        this.t.filterUi.toggle?.addEventListener('click', this.t.bound(this.t.handlers, this.t.handlers.onToggle));
        this.t.filterUi.addPop?.addEventListener('toggle', this.t.bound(this.t.pills, this.t.pills.onAddToggle));
        this.t.filterUi.addMenu?.addEventListener('click', this.t.bound(this.t.pills, this.t.pills.onAddMenuClick));
        this.t.filterUi.addMenu?.addEventListener('keydown', this.t.bound(this.t.pills, this.t.pills.onAddMenuKey));
        this.t.filterUi.filterEditor?.addEventListener('submit', this.t.bound(this.t.filterEditing, this.t.filterEditing.onEditorSubmit));
        this.t.filterUi.filterEditor?.addEventListener('click', this.t.bound(this.t.filterEditing, this.t.filterEditing.onEditorClick));
        this.t.filterUi.filterEditor?.addEventListener('keydown', this.t.bound(this.t.filterEditing, this.t.filterEditing.onEditorKeydown));
        this.t.render.pillsList.addEventListener('click', this.t.bound(this.t.pills, this.t.pills.onPillsClick));
        this.t.sortSetup.sortBy?.addEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onSortBy));
        this.t.sortSetup.sortDirection?.addEventListener('click', this.t.bound(this.t.handlers, this.t.handlers.onSortDirection));
        this.t.layoutSetup.sizeSelect?.addEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onPageSize));
        this.t.sortSetup.columnList?.addEventListener('change', this.t.bound(this.t.handlers, this.t.handlers.onColumnChange));
        this.t.sortSetup.columnList?.addEventListener('click', this.t.bound(this.t.handlers, this.t.handlers.onColumnClick));
        this.t.wrap.addEventListener('click', this.t.bound(this.t.wrapClick, this.t.wrapClick.onWrapClick));
        this.t.wrap.addEventListener('keydown', this.t.bound(this.t.edit, this.t.edit.onEditorKeyCapture), { capture: true });
        this.t.wrap.addEventListener('keydown', this.t.bound(this.t.edit, this.t.edit.onEditorKey));
        this.t.wrap.addEventListener('focusout', this.t.bound(this.t.edit, this.t.edit.onEditorFocusOut));
        this.t.table.tHead?.addEventListener('click', this.t.bound(this.t.handlers, this.t.handlers.onHeadClick));
        this.t.table.tHead?.addEventListener('keydown', this.t.bound(this.t.handlers, this.t.handlers.onHeadKey));
        this.t.body.addEventListener('change', this.t.bound(this.t.selection, this.t.selection.onBodyChange));
        this.t.body.addEventListener('keydown', this.t.bound(this.t.expand, this.t.expand.onRowKey));
        this.t.body.addEventListener('focusin', this.t.bound(this.t.selection, this.t.selection.onBodyFocusIn));
        this.t.body.addEventListener('focusout', this.t.bound(this.t.selection, this.t.selection.onBodyFocusOut));
        this.t.controls.selectAll?.addEventListener('change', this.t.bound(this.t.selection, this.t.selection.onSelectAll));
    }

    /**
     * Headers the server rendered already sorted keep their sort, in the order `data-kp-sort-priority` gives, else the order they
     * stand in.
     */
    openingSorts() {
        return this.t.columns.headers
            .map((header, at) => ({ header, at }))
            .filter(({ header }) => ['ascending', 'descending'].includes(header.getAttribute('aria-sort') ?? ''))
            .sort((a, b) => (Number(a.header.dataset.kpSortPriority) || a.at + UNRANKED) - (Number(b.header.dataset.kpSortPriority) || b.at + UNRANKED))
            .map(({ header, at }) => ({ column: at, direction: /** @type {'ascending' | 'descending'} */ (header.getAttribute('aria-sort')) }))
            .slice(0, this.t.controls.multi ? undefined : 1);
    }

    readDeclaredFilters() {
        // A filter the markup declared as already set: `data-kp-filter-value`,
        // a list for a choice, "from,to" for a range or a date.
        for (const at of this.t.filterUi.filterColumns) {
            const declared = this.t.columns.headers[at]?.dataset.kpFilterValue;
            if (declared === undefined) continue;
            const kind = this.t.columns.filterKinds[at];
            if (kind === 'choice') this.t.model.filters.set(at, splitList(declared));
            else {
                const [from = '', to = ''] = declared.split(',').map((part) => part.trim());
                this.t.model.filters.set(at, { from, to });
            }
        }
    }

    /** The keyboard grid, with its readout of where the focus is. */
    wireGrid() {
        this.t.sync.grid = attachGrid(this.t.table, {
            pageRows: this.t.settings.gridPageRows,
            onMove: ({ row, rows, column, cell }) => {
                if (this.t.layoutSetup.gridReadout === null) return;
                const at = cell.cellIndex;
                const text =
                    cell.parentElement?.parentElement?.tagName === 'THEAD'
                        ? this.t.columns.labelOf(at)
                        : this.t.columns.cellText(/** @type {HTMLTableRowElement} */ (cell.parentElement), at);
                void column;
                this.t.layoutSetup.gridReadout.textContent = getStrings().tableGridPosition(row, rows, this.t.columns.labelOf(at), text);
            },
        });
    }

    /** The controls, the pills and the columns as the state says, then the rows: the server's, or filtered here. */
    firstDraw() {
        const { t } = this;
        t.apply.writeControls();
        t.pills.renderPills();
        t.sync.syncColumns();
        if (!t.controls.serverMode) return t.apply.applyFilter();
        if (t.model.all.length > 0 && Number.isFinite(t.busy.total)) {
            t.model.state = 'ready';
            t.render.render();
        } else t.server.request();
    }

    /** @returns {ResizeObserver | null} */
    watchResize() {
        const { sync } = this.t;
        if (!((sync.fixedCount > 0 || sync.fixedEndCount > 0) && typeof ResizeObserver !== 'undefined')) return null;
        const resize = new ResizeObserver(() => {
            cancelAnimationFrame(this.resizeFrame);
            this.resizeFrame = requestAnimationFrame(this.t.bound(sync, sync.syncFixed));
        });
        resize.observe(this.t.table);
        return resize;
    }
}
