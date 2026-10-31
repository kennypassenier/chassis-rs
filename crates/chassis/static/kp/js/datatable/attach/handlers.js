// The handlers of the search, scope, density, sort, page size and column controls.
import { filterActive } from '../filter.js';
import { COLUMNS_EVENT, RETRY_EVENT, SORT_EVENT } from '../events.js';
import { nextSorts } from '../sort.js';
/** @typedef {import('../events.js').Density} Density */
/** @typedef {import('../events.js').FilterValue} FilterValue */
/** @typedef {import('../events.js').Sort} Sort */
/** @typedef {import('../events.js').SortKey} SortKey */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableHandlers {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        for (const header of this.t.columns.headers) {
            if (header.dataset.kpSort !== undefined && header.querySelector('button, a') === null && !header.hasAttribute('tabindex'))
                header.tabIndex = 0;
        }
    }

    onSearch() {
        this.t.model.query = this.t.controls.search?.value ?? '';
        clearTimeout(this.t.server.pending);
        if (this.t.controls.debounce > 0) this.t.server.pending = window.setTimeout(() => this.t.apply.applyFilter(), this.t.controls.debounce);
        else this.t.apply.applyFilter();
    }

    onScope() {
        this.t.model.scope = this.t.controls.scopeSelect === null || this.t.controls.scopeSelect.value === '' ? null : Number(this.t.controls.scopeSelect.value);
        this.t.apply.applyFilter();
    }

    onDensity() {
        if (this.t.controls.densitySelect === null) return;
        this.setDensity(this.t.controls.densitySelect.value === 'compact' ? 'compact' : 'comfortable');
    }

    /** @param {Density} next */
    setDensity(next) {
        if (next === 'compact') this.t.wrap.setAttribute('data-density', 'compact');
        else this.t.wrap.removeAttribute('data-density');
        if (this.t.controls.densitySelect !== null) this.t.controls.densitySelect.value = next;
        this.t.memory?.write('density', next);
        this.t.render.render();
    }

    onPanel() {
        // A picker set by writeControls announces it; that is not a person's change.
        if (this.t.apply.writing) return;
        const before = JSON.stringify([...this.t.model.filters]);
        this.t.apply.readControls();
        // A change event after the input event that already applied it.
        if (JSON.stringify([...this.t.model.filters]) === before) return;
        this.t.pills.renderPills();
        this.t.apply.applyFilter();
    }

    onToggle() {
        if (this.t.filterUi.panel === null || this.t.filterUi.toggle === null) return;
        this.t.filterUi.panel.hidden = !this.t.filterUi.panel.hidden;
        this.t.filterUi.toggle.setAttribute('aria-expanded', String(!this.t.filterUi.panel.hidden));
    }

    /** @param {number | string} column @param {FilterValue | null} value */
    setFilter(column, value) {
        const at = this.t.sync.columnAt(column);
        const kind = this.t.columns.filterKinds[at];
        if (!kind) return;
        if (value === null || !filterActive(kind, value)) this.t.model.filters.delete(at);
        else this.t.model.filters.set(at, value);
        this.t.apply.writeControls();
        this.t.pills.renderPills();
        this.t.apply.applyFilter();
    }

    clearFilters() {
        this.t.filterEditing.closeFilterEditor(false);
        this.t.model.filters.clear();
        this.t.apply.writeControls();
        this.t.pills.renderPills();
        this.t.apply.applyFilter();
    }

    onClear() {
        this.t.model.query = '';
        if (this.t.controls.search !== null) this.t.controls.search.value = '';
        this.t.filterEditing.closeFilterEditor(false);
        this.t.model.filters.clear();
        this.t.apply.writeControls();
        this.t.pills.renderPills();
        this.t.apply.applyFilter();
        this.t.controls.search?.focus();
    }

    onRetry() {
        this.t.wrap.dispatchEvent(new CustomEvent(RETRY_EVENT, { bubbles: true }));
        if (this.t.controls.serverMode) this.t.server.request();
    }

    /** @param {SortKey[]} next @param {Sort} [announced] */
    commitSorts(next, announced) {
        this.t.model.sorts = next.filter((key) => this.t.columns.headers[key.column] !== undefined);
        this.t.memory?.write(
            'sort',
            this.t.model.sorts.map((key) => ({ column: this.t.columns.columnIds[key.column], direction: key.direction })),
        );
        this.t.wrap.dispatchEvent(new CustomEvent(SORT_EVENT, { bubbles: true, detail: announced === undefined ? (this.t.model.sorts[0] ?? null) : announced }));
        // A new sort starts at the first page, as the approved mock does:
        // the rows the reader was looking at are somewhere else now.
        this.t.model.page = 0;
        if (this.t.controls.serverMode) {
            this.t.server.request();
            return;
        }
        this.t.apply.applySorts();
        this.t.render.render();
    }

    /** @param {Sort} next */
    setSort(next) {
        if (next === null || next.direction === 'none') this.commitSorts([], next);
        else this.commitSorts([{ column: next.column, direction: next.direction }], next);
    }

    /** @param {HTMLTableCellElement} header @param {boolean} addKey */
    toggleSort(header, addKey) {
        const at = this.t.columns.headers.indexOf(header);
        if (at === -1) return;
        // A column that cannot be sorted now (aria-disabled) keeps the sort as it is [kpadopt4].
        if (header.getAttribute('aria-disabled') === 'true') return;
        const next = nextSorts(this.t.model.sorts, at, { add: this.t.controls.multi && (this.t.controls.addOnClick ? !addKey : addKey), cycle: this.t.controls.cycleName });
        if (next.length === 0) this.commitSorts([], { column: at, direction: 'none' });
        else this.commitSorts(next);
    }

    /** @param {MouseEvent} event */
    onHeadClick(event) {
        const header = /** @type {HTMLTableCellElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('th[data-kp-sort]'));
        if (header !== null) this.toggleSort(header, event.shiftKey);
    }

    // From the keyboard too [KT6]: a header the first version made
    // clickable was reachable by nobody who could not click. The
    // consumer may put a <button> inside the header; a bare header is
    // made focusable here. Shift + Enter adds the column as a key.
    /** @param {KeyboardEvent} event */
    onHeadKey(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const header = /** @type {HTMLTableCellElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('th[data-kp-sort]'));
        if (header === null) return;
        event.preventDefault();
        this.toggleSort(header, event.shiftKey);
    }

    onSortBy() {
        if (this.t.sortSetup.sortBy === null) return;
        if (this.t.sortSetup.sortBy.value === '') this.setSort(null);
        else this.setSort({ column: Number(this.t.sortSetup.sortBy.value), direction: this.t.model.sorts[0]?.direction === 'descending' ? 'descending' : 'ascending' });
    }

    onSortDirection() {
        const first = this.t.model.sorts[0];
        if (first === undefined) return;
        this.setSort({ column: first.column, direction: first.direction === 'ascending' ? 'descending' : 'ascending' });
    }

    onPageSize() {
        if (this.t.layoutSetup.sizeSelect === null) return;
        this.setPageSize(Number(this.t.layoutSetup.sizeSelect.value));
    }

    /** Keep the first row the reader was looking at on the page they land on. @param {number} next */
    setPageSize(next) {
        if (!(next > 0)) return;
        const first = this.t.model.page * this.t.controls.size;
        this.t.controls.size = next;
        if (this.t.layoutSetup.sizeSelect !== null) this.t.layoutSetup.sizeSelect.value = String(next);
        this.t.model.page = Math.floor(first / this.t.controls.size);
        if (this.t.controls.serverMode) this.t.server.request();
        else this.t.render.render();
    }

    // ── Columns ────────────────────────────────────────────────────
    /** @param {Iterable<number>} next */
    setHidden(next) {
        this.t.sortSetup.hiddenColumns = new Set([...next].filter((at) => this.t.columns.headers[at] !== undefined && !this.t.sortSetup.locked[at] && !this.t.columns.controlColumn(at)));
        this.t.memory?.write(
            'columns',
            [...this.t.sortSetup.hiddenColumns].sort((a, b) => a - b).map((at) => this.t.columns.columnIds[at]),
        );
        this.t.sync.syncColumns();
        this.t.wrap.dispatchEvent(new CustomEvent(COLUMNS_EVENT, { bubbles: true, detail: { hidden: [...this.t.sortSetup.hiddenColumns].sort((a, b) => a - b) } }));
        this.t.render.render();
    }

    /** @param {Event} event */
    onColumnChange(event) {
        const box = /** @type {HTMLInputElement} */ (event.target);
        if (box.dataset.kpDatatableColumn === undefined) return;
        const at = Number(box.value);
        const next = new Set(this.t.sortSetup.hiddenColumns);
        if (box.checked) next.delete(at);
        else next.add(at);
        this.setHidden(next);
    }

    /** @param {MouseEvent} event */
    onColumnClick(event) {
        if (/** @type {HTMLElement} */ (event.target).closest('[data-kp-datatable-columns-reset]') !== null) this.setHidden([]);
    }
}
