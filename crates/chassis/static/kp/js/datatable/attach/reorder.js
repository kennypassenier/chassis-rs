// Row preparation and the drag and keyboard reorder of rows.
import { EDIT_CELL, EDIT_VALUE, REORDER_HANDLE, ROW_TOGGLE, SELECT_ROW } from '../selectors.js';
import { getStrings } from '../../strings.js';
import { REORDER_EVENT } from '../events.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableReorder {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        // ── Preparing a row: the parts a feature puts into its cells ───
        /** Rows that had their cells wrapped or added, for detach. @type {Set<HTMLTableRowElement>} */
        this.prepared = new Set();
        /** A polite line only a screen reader hears: where the row went. @type {HTMLElement | null} */
        this.reorderLive = null;
        if (this.t.details.reorderable) {
            this.t.body.addEventListener('keydown', this.t.bound(this, this.onReorderKey));
            this.t.body.addEventListener('pointerdown', this.t.bound(this, this.onReorderPointer));
            this.t.identity.undo.push(() => {
                this.t.body.removeEventListener('keydown', this.t.bound(this, this.onReorderKey));
                this.t.body.removeEventListener('pointerdown', this.t.bound(this, this.onReorderPointer));
            });
        }
        for (const row of this.t.model.all) {
            if (row.dataset.kpExpanded !== undefined) this.t.details.expanded.add(this.t.columns.keyOf(row));
            this.prepareRow(row);
        }
        // One open row at a time: of several marked open, the last stays.
        if (this.t.details.single && this.t.details.expanded.size > 1) {
            const last = /** @type {string} */ ([...this.t.details.expanded][this.t.details.expanded.size - 1]);
            this.t.details.expanded.clear();
            this.t.details.expanded.add(last);
        }
    }

    /** @param {HTMLTableRowElement} row */
    prepareRow(row) {
        this.t.chrome.themeBox(row.querySelector(SELECT_ROW));
        if (this.prepared.has(row)) return;
        this.prepared.add(row);
        this.t.details.insertExpandCell(row);
        this.t.details.insertReorderCell(row);
        this.t.columns.editKinds.forEach((kind, at) => {
            const cell = row.cells[at];
            if (kind === null || cell === undefined || cell.querySelector(EDIT_CELL) !== null) return;
            const button = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-datatable__edit'));
            button.type = 'button';
            button.dataset.kpEditCell = '';
            const value = this.t.identity.make('span');
            value.dataset.kpEditValue = '';
            value.append(...cell.childNodes);
            button.append(value);
            cell.append(button);
        });
        if (this.t.sortSetup.hiddenColumns.size > 0)
            for (const at of this.t.sortSetup.hiddenColumns) if (row.cells[at]) /** @type {HTMLTableCellElement} */ (row.cells[at]).hidden = true;
    }

    /** Take back what prepareRow put in a row. @param {HTMLTableRowElement} row */
    unprepareRow(row) {
        row.querySelector('[data-kp-expand-cell]')?.remove();
        row.querySelector('[data-kp-reorder-cell]')?.remove();
        for (const button of row.querySelectorAll(EDIT_CELL)) {
            const value = button.querySelector(EDIT_VALUE);
            if (value !== null) button.replaceWith(...value.childNodes);
        }
        for (const cell of row.cells) cell.hidden = false;
    }

    /** Name the parts that depend on the row's current value and state. @param {HTMLTableRowElement} row */
    labelRow(row) {
        const s = getStrings();
        const key = this.t.columns.keyOf(row);
        const toggleButton = /** @type {HTMLButtonElement | null} */ (row.querySelector(ROW_TOGGLE));
        if (toggleButton !== null) {
            const open = this.t.details.expanded.has(key);
            toggleButton.setAttribute('aria-label', s.tableRowDetails(key));
            toggleButton.setAttribute('aria-expanded', String(open));
            toggleButton.textContent = open ? this.t.controls.glyphs.collapse : this.t.controls.glyphs.expand;
            const detail = this.t.details.details.has(row) || open ? this.t.sync.detailFor(row) : undefined;
            if (detail !== undefined) toggleButton.setAttribute('aria-controls', detail.id);
            else toggleButton.removeAttribute('aria-controls');
        }
        for (const button of row.querySelectorAll(EDIT_CELL)) {
            const cell = /** @type {HTMLTableCellElement} */ (button.closest('td, th'));
            button.setAttribute('aria-label', s.tableEdit(this.t.columns.labelOf(cell.cellIndex), key, this.t.columns.cellText(row, cell.cellIndex)));
        }
        const grip = row.querySelector(REORDER_HANDLE);
        if (grip !== null) {
            const can = this.canReorder();
            grip.setAttribute('aria-label', s.tableReorderRow(this.reorderName(row)));
            if (can) {
                grip.removeAttribute('aria-disabled');
                grip.removeAttribute('title');
            } else {
                grip.setAttribute('aria-disabled', 'true');
                grip.setAttribute('title', s.tableReorderOff);
            }
        }
    }

    // ── Row reorder [wish-1120, homelab 93] ─────────────────────────
    // The order is the table's own while no sort, filter or search is on and the rows come from the page (not a server): the
    // handle, Alt+Up and Alt+Down move a row in the rendered order and `kp-datatable-reorder` carries the new order of the
    // keys. With a sort or filter on, the handles are off with the reason in their title.
    canReorder() {
        return this.t.details.reorderable && !this.t.controls.serverMode && !this.t.controls.externalSort && this.t.model.sorts.length === 0 && this.t.model.filters.size === 0 && this.t.model.query.trim() === '' && this.t.groups.groups.size === 0;
    }

    /** @param {HTMLTableRowElement} row */
    reorderName(row) {
        return (this.t.columns.keyColumn >= 0 ? this.t.columns.cellText(row, this.t.columns.keyColumn) : '') || this.t.columns.keyOf(row);
    }

    /**
     * Put a row at a place in the order (0 is the first) and say so.
     * @param {HTMLTableRowElement} row @param {number} to
     * @returns {boolean} whether the row moved
     */
    moveRow(row, to) {
        if (!this.canReorder()) return false;
        const from = this.t.model.all.indexOf(row);
        const target = Math.max(0, Math.min(this.t.model.all.length - 1, to));
        if (from < 0 || from === target) return false;
        this.t.model.all.splice(from, 1);
        this.t.model.all.splice(target, 0, row);
        this.t.model.rendered.splice(0, this.t.model.rendered.length, ...this.t.model.all, ...this.t.model.rendered.filter((r) => !this.t.model.all.includes(r)));
        this.t.model.shownRows = [...this.t.model.all];
        if (this.t.controls.pager !== null) this.t.model.page = Math.floor(target / this.t.controls.size);
        this.t.render.render();
        // The focus follows the row, not the place: losing it after every move is what makes keyboard reordering unusable.
        /** @type {HTMLElement | null} */ (row.querySelector(REORDER_HANDLE))?.focus({ preventScroll: true });
        if (this.reorderLive === null) {
            this.reorderLive = this.t.identity.make('span', 'kp-sr-only');
            this.reorderLive.setAttribute('role', 'status');
            this.reorderLive.setAttribute('aria-live', 'polite');
            this.t.wrap.append(this.reorderLive);
            this.t.identity.undo.push(() => this.reorderLive?.remove());
        }
        this.reorderLive.textContent = getStrings().reorderMoved(this.reorderName(row), target + 1, this.t.model.all.length);
        this.t.wrap.dispatchEvent(new CustomEvent(REORDER_EVENT, { bubbles: true, detail: { order: this.t.model.all.map(this.t.bound(this.t.columns, this.t.columns.keyOf)), key: this.t.columns.keyOf(row), from, to: target } }));
        return true;
    }

    /** Alt+Up and Alt+Down on a row's handle, or on the row itself. @param {KeyboardEvent} event */
    onReorderKey(event) {
        if (!this.t.details.reorderable || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        const target = /** @type {HTMLElement} */ (event.target);
        if (target.matches('input, textarea, select, [contenteditable]')) return;
        const row = /** @type {HTMLTableRowElement | null} */ (target.closest('tr'));
        if (row === null || row.parentElement !== this.t.body || !this.t.model.all.includes(row)) return;
        event.preventDefault();
        this.moveRow(row, this.t.model.all.indexOf(row) + (event.key === 'ArrowUp' ? -1 : 1));
    }

    /** Drag by the handle: the row follows the pointer over its neighbours. @param {PointerEvent} event */
    onReorderPointer(event) {
        if (event.button !== 0) return;
        const handle = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest(REORDER_HANDLE));
        const row = /** @type {HTMLTableRowElement | null} */ (handle?.closest('tr') ?? null);
        if (handle === null || row === null || !this.canReorder()) return;
        event.preventDefault();
        handle.focus({ preventScroll: true });
        row.dataset.kpDragging = '';
        const id = event.pointerId;
        /** @param {PointerEvent} move */
        const onMove = (move) => {
            if (move.pointerId !== id) return;
            const over = this.t.model.pageRows.find((r) => {
                const box = r.getBoundingClientRect();
                return move.clientY >= box.top && move.clientY <= box.bottom;
            });
            if (over !== undefined && over !== row) this.moveRow(row, this.t.model.all.indexOf(over));
        };
        /** @param {PointerEvent} up */
        const onUp = (up) => {
            if (up.pointerId !== id) return;
            delete row.dataset.kpDragging;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }
}
