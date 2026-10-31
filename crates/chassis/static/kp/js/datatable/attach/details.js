// The detail rows, the expand cell and the reorder cell.
import { DETAIL, EXPAND_COLUMN, GROUP_ROW, HELD_ROW, REORDER_COLUMN, SKELETON_ROW } from '../selectors.js';
/** @typedef {import('../attach.js').DataTableDecorateInfo} DataTableDecorateInfo */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableDetails {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        // ── Rows that open (#expansion) ────────────────────────────────
        // Before anything reads the headers: the toggle column is a column.
        this.headRow = this.t.table.tHead?.rows[0];
        /** Each row's detail row. @type {Map<HTMLTableRowElement, HTMLTableRowElement>} */
        this.details = new Map();
        /** Detail rows as the markup had them, for detach. @type {Map<HTMLTableRowElement, boolean>} */
        this.detailsWereHidden = new Map();
        /** @type {Set<HTMLTableRowElement>} */
        this.builtDetails = new Set();
        this.collectDetails();
        this.expandable = this.t.wrap.dataset.kpExpandable !== undefined && this.headRow !== undefined;
        /** One row open at a time [J2]: opening one closes the one that was open. */
        this.single = this.t.wrap.dataset.kpExpandSingle === undefined ? this.t.settings.expandSingle : this.t.wrap.dataset.kpExpandSingle !== 'false';
        // The search box the page placed is a control the consumer may mark too [wish-1120, homelab 66, 114].
        if (this.t.controls.search !== null) this.decoratePart(this.t.controls.search, { kind: 'search' });
        /** Rows open for their details, by key. @type {Set<string>} */
        this.expanded = new Set();
        if (this.expandable && this.headRow !== undefined && this.headRow.querySelector(EXPAND_COLUMN) === null) {
            const th = this.t.identity.add(this.t.identity.make('th'));
            th.setAttribute('scope', 'col');
            th.dataset.kpExpandColumn = '';
            const label = this.t.identity.make('span', 'kp-sr-only');
            label.textContent = this.t.identity.s0.tableDetailsColumn;
            th.append(label);
            this.headRow.prepend(th);
        }
        // Row reorder [wish-1120, homelab 93]: `data-kp-rows-reorder` adds a column of drag handles, first in the row.
        this.reorderable = this.t.wrap.dataset.kpRowsReorder !== undefined && this.headRow !== undefined;
        if (this.reorderable && this.headRow !== undefined && this.headRow.querySelector(REORDER_COLUMN) === null) {
            const th = this.t.identity.add(this.t.identity.make('th'));
            th.setAttribute('scope', 'col');
            th.dataset.kpReorderColumn = '';
            const label = this.t.identity.make('span', 'kp-sr-only');
            label.textContent = this.t.identity.s0.tableReorderColumn;
            th.append(label);
            this.headRow.prepend(th);
        }
        for (const row of this.t.body.rows) {
            this.insertExpandCell(row);
            this.insertReorderCell(row);
        }
    }

    collectDetails() {
        /** @type {HTMLTableRowElement | null} */
        let owner = null;
        for (const row of this.t.body.rows) {
            if (row.matches(DETAIL)) {
                if (owner !== null && !this.details.has(owner)) {
                    this.details.set(owner, row);
                    if (!this.detailsWereHidden.has(row)) this.detailsWereHidden.set(row, row.hidden === true);
                }
            } else if (row.matches(GROUP_ROW)) owner = null;
            else if (row.matches(HELD_ROW)) owner = null;
            else if (!row.matches(SKELETON_ROW)) owner = row;
        }
    }

    /** The consumer's mark on a control this table built [J2, R-DRIVE]. @param {HTMLElement} part @param {Omit<DataTableDecorateInfo, 'host' | 'key'>} info */
    decoratePart(part, info) {
        if (this.t.settings.decorate === undefined) return;
        /** @type {DataTableDecorateInfo} */
        const full = { ...info, host: this.t.wrap };
        if (this.t.wrap.dataset.kpKey !== undefined) full.key = this.t.wrap.dataset.kpKey;
        this.t.settings.decorate(part, full);
    }

    /** The handle's cell, first in the row (before the expand toggle). @param {HTMLTableRowElement} row */
    insertReorderCell(row) {
        if (
            !this.reorderable ||
            row.matches(DETAIL) ||
            row.matches(SKELETON_ROW) ||
            row.matches(GROUP_ROW) ||
            row.querySelector('[data-kp-reorder-cell]') !== null
        )
            return;
        const cell = /** @type {HTMLTableCellElement} */ (this.t.identity.make('td'));
        cell.dataset.kpReorderCell = '';
        cell.dataset.label = '';
        const button = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-button kp-button--ghost kp-button--sm kp-datatable__handle'));
        button.type = 'button';
        button.dataset.kpReorderHandle = '';
        button.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
        const grip = this.t.identity.make('span', 'kp-datatable__grip');
        grip.setAttribute('aria-hidden', 'true');
        button.append(grip);
        cell.append(button);
        row.prepend(cell);
        const rowKey = row.dataset.kpRowKey ?? row.id ?? '';
        this.decoratePart(button, { kind: 'reorder-handle', value: rowKey, label: rowKey });
    }

    /** The toggle's cell, first in the row, so the row's cells line up with the headers. @param {HTMLTableRowElement} row */
    insertExpandCell(row) {
        if (
            !this.expandable ||
            row.matches(DETAIL) ||
            row.matches(SKELETON_ROW) ||
            row.matches(GROUP_ROW) ||
            row.querySelector('[data-kp-expand-cell]') !== null
        )
            return;
        const cell = /** @type {HTMLTableCellElement} */ (this.t.identity.make('td'));
        cell.dataset.kpExpandCell = '';
        cell.dataset.label = '';
        // Where the markup wrote detail rows, only a row that has one gets a
        // button; with a `detail` option or no detail rows at all, every row
        // does, and the app fills the detail when the row first opens.
        /** @type {HTMLButtonElement | null} */
        let button = null;
        if (this.details.has(row) || this.t.settings.detailFn !== undefined || this.details.size === 0) {
            button = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-button kp-button--ghost kp-button--sm kp-datatable__expand'));
            button.type = 'button';
            button.dataset.kpRowToggle = '';
            cell.append(button);
        }
        row.prepend(cell);
        if (button !== null) {
            const rowKey = row.dataset.kpRowKey ?? row.id ?? '';
            this.decoratePart(button, { kind: 'row-toggle', value: rowKey, label: this.t.identity.s0.tableRowDetails(rowKey) });
        }
    }
}
