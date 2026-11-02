// Syncs the table's column choice: the hidden columns, the column menu's list of boxes and its count.
import { CHECK_CLASS, DETAIL, GROUP_ROW } from '../selectors.js';
import { getStrings } from '../../strings.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableSyncColumns {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
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
}
