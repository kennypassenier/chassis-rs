// The sort and column controls and the remembered columns.
import { CARD_SORT, SORT_RESET, SORT_SUMMARY } from '../selectors.js';
import { getStrings } from '../../strings.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableSortSetup {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        // ── The card layout's sort control ─────────────────────────────
        this.sortable = this.t.columns.headers.flatMap((header, at) => (header.dataset.kpSort === undefined ? [] : [at]));
        /** @type {HTMLSelectElement | null} */
        this.sortBy = null;
        /** @type {HTMLButtonElement | null} */
        this.sortDirection = null;
        if (this.t.wrap.dataset.kpCards !== undefined && this.sortable.length > 0 && this.t.wrap.querySelector(CARD_SORT) === null) this.makeCardSort();
        // ── The multi-sort summary (#multi-sort) ───────────────────────
        /** @type {HTMLElement | null} */
        this.sortSummary = null;
        /** The opening sort, as a key, once it is known; the way back to it is shown only when the sort differs [fix-83]. @type {string | null} */
        this.openingSort = null;
        if (this.t.controls.multi) this.findSortSummary();
        // ── The column menu (#columns) ─────────────────────────────────
        this.locked = this.t.columns.headers.map(
            (header, at) =>
                !this.t.columns.controlColumn(at) && (header.dataset.kpColumnLocked === undefined ? at === this.t.columns.keyColumn : header.dataset.kpColumnLocked !== 'false'),
        );
        /** @type {Set<number>} */
        this.hiddenColumns = new Set(this.t.columns.headers.flatMap((header, at) => (header.dataset.kpColumnHidden !== undefined && !this.locked[at] ? [at] : [])));
        this.choosable = this.t.columns.headers.flatMap((_, at) => (this.t.columns.controlColumn(at) ? [] : [at]));
        /** @type {HTMLElement | null} */
        this.columnList = null;
        /** @type {HTMLElement | null} */
        this.columnCount = null;
        if (this.t.wrap.dataset.kpColumnMenu !== undefined && this.choosable.length > 0) this.makeColumnMenu();
        // ── The edit log (#inline-edit) ────────────────────────────────
        this.editable = this.t.columns.editKinds.some((kind) => kind !== null);
        /** @type {HTMLElement | null} */
        this.editLog = null;
        if (this.editable) this.makeEditLog();
    }

    /** The card layout's sort control: a column choice and a direction button. */
    makeCardSort() {
        const control = this.t.identity.add(this.t.identity.make('div', 'kp-datatable__card-sort'));
        control.dataset.kpDatatableCardSort = '';
        const label = this.t.identity.make('label', 'kp-datatable__label');
        label.append(this.t.identity.s0.tableSortBy, ' ');
        this.sortBy = /** @type {HTMLSelectElement} */ (this.t.identity.make('select', 'kp-field__input kp-datatable__select'));
        this.sortBy.dataset.kpDatatableSortBy = '';
        this.sortBy.setAttribute('aria-label', this.t.identity.s0.tableSortBy);
        const none = /** @type {HTMLOptionElement} */ (this.t.identity.make('option'));
        none.value = '';
        none.textContent = this.t.identity.s0.tableSortNone;
        this.sortBy.append(none);
        for (const at of this.sortable) {
            const option = /** @type {HTMLOptionElement} */ (this.t.identity.make('option'));
            option.value = String(at);
            option.textContent = this.t.columns.labelOf(at);
            this.sortBy.append(option);
        }
        label.append(this.sortBy);
        this.sortDirection = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-button kp-button--ghost'));
        this.sortDirection.type = 'button';
        this.sortDirection.dataset.kpDatatableSortDirection = '';
        control.append(label, this.sortDirection);
        this.t.wrap.insertBefore(control, this.t.chrome.tableBlock);
    }

    /** The multi-sort summary (#multi-sort): the page's, or a line of its own with the way back to the opening sort. */
    findSortSummary() {
        this.sortSummary = /** @type {HTMLElement | null} */ (this.t.wrap.querySelector(SORT_SUMMARY));
        if (this.sortSummary === null) {
            // A line of its own under the toolbar, one line high whatever it
            // says. It used to be prepended to the toolbar and grew with its
            // words, so the search shrank and moved with every key added
            // [fix-83].
            const line = this.t.identity.add(this.t.identity.make('div', 'kp-datatable__bar kp-datatable__sort-line'));
            this.sortSummary = this.t.identity.make('p', 'kp-datatable__status kp-datatable__sort-summary');
            this.sortSummary.dataset.kpDatatableSortSummary = '';
            this.sortSummary.setAttribute('aria-live', 'polite');
            line.append(this.sortSummary);
            if (this.t.wrap.querySelector(SORT_RESET) === null) {
                const back = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-button kp-button--ghost kp-button--sm'));
                back.type = 'button';
                back.dataset.kpDatatableSortReset = '';
                back.textContent = getStrings().tableSortReset;
                line.append(back);
            }
            this.t.wrap.insertBefore(line, this.t.chrome.tableBlock);
        }
    }

    /** The column menu (#columns): a button in the top bar, its menu of columns and the count of those shown. */
    makeColumnMenu() {
        const bar = this.t.chrome.ensureTopBar();
        const popId = `${this.t.identity.id}-columns`;
        const button = /** @type {HTMLButtonElement} */ (this.t.identity.add(this.t.identity.make('button', 'kp-button kp-button--ghost kp-datatable__columns-toggle')));
        button.type = 'button';
        button.dataset.kpDatatableColumnsToggle = '';
        button.textContent = this.t.identity.s0.tableColumns;
        button.setAttribute('aria-haspopup', 'true');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', popId);
        button.setAttribute('popovertarget', popId);
        // Anchor positioning puts the menu under its button, as the theme
        // picker's menu is placed [css/components.css, .kp-popover].
        button.style.setProperty('anchor-name', `--${popId}`);
        const pop = this.t.identity.add(this.t.identity.make('div', 'kp-popover kp-datatable__columns'));
        pop.id = popId;
        pop.setAttribute('popover', 'auto');
        pop.dataset.kpDatatableColumns = '';
        pop.style.setProperty('position-anchor', `--${popId}`);
        pop.addEventListener('toggle', (event) => {
            button.setAttribute('aria-expanded', String(/** @type {ToggleEvent} */ (event).newState === 'open'));
        });
        this.columnList = this.t.identity.make('ul', 'kp-menu');
        this.columnList.setAttribute('aria-label', this.t.identity.s0.tableColumnsLabel);
        pop.append(this.columnList);
        this.columnCount = this.t.identity.add(this.t.identity.make('span', 'kp-datatable__status kp-datatable__columns-count'));
        this.columnCount.dataset.kpDatatableColumnsCount = '';
        bar.append(button, pop, this.columnCount);
    }

    /** The edit log (#inline-edit): what was edited, under the table. */
    makeEditLog() {
        this.editLog = this.t.identity.add(this.t.identity.make('p', 'kp-datatable__status kp-datatable__edit-log'));
        this.editLog.dataset.kpDatatableEditLog = '';
        this.editLog.setAttribute('role', 'status');
        this.editLog.setAttribute('aria-live', 'polite');
        this.t.chrome.putUnder(this.editLog);
    }
}
