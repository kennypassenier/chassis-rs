// Writes the controls from the state, reads them back, and applies sorts and filters.
import { datePicker } from '../../datepicker.js';
import { filterActive, matchesFilter } from '../filter.js';
import { compareByOrder } from '../sort.js';
/** @typedef {import('../events.js').FilterValue} FilterValue */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableApply {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        /** True while writeControls sets a date picker, whose change event must not be read back. */
        this.writing = false;
    }

    /** Write the filter state into the panel's controls, so a pill or the handle and the panel agree. */
    writeControls() {
        if (this.t.filterUi.panel === null) return;
        for (const set of this.t.filterUi.panel.querySelectorAll('[data-kp-filter-column]')) {
            const at = Number(/** @type {HTMLElement} */ (set).dataset.kpFilterColumn);
            const value = this.t.model.filters.get(at);
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
                this.writing = true;
                try {
                    handle.set(wanted === '' ? null : wanted);
                } finally {
                    this.writing = false;
                }
            }
        }
    }

    /**
     * The panel's choice lists, read again from the rows. At attach they
     * hold the rows the markup had; a page that writes its rows afterwards
     * (and calls refresh) would otherwise keep an empty list for good.
     */
    refreshChoices() {
        if (this.t.filterUi.panel === null) return;
        for (const set of this.t.filterUi.panel.querySelectorAll('[data-kp-filter-column]')) {
            const at = Number(/** @type {HTMLElement} */ (set).dataset.kpFilterColumn);
            if (this.t.columns.filterKinds[at] !== 'choice') continue;
            const value = this.t.model.filters.get(at);
            this.t.filterUi.fillChoices(set, at, Array.isArray(value) ? value : []);
        }
    }

    /** Read the panel's controls into the filter state. */
    readControls() {
        if (this.t.filterUi.panel === null) return;
        this.t.model.filters.clear();
        for (const set of this.t.filterUi.panel.querySelectorAll('[data-kp-filter-column]')) {
            const at = Number(/** @type {HTMLElement} */ (set).dataset.kpFilterColumn);
            const kind = this.t.columns.filterKinds[at];
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
            if (kind !== null && kind !== undefined && filterActive(kind, value)) this.t.model.filters.set(at, value);
        }
    }

    /** @param {HTMLTableRowElement} a @param {HTMLTableRowElement} b */
    compareRows(a, b) {
        for (const key of this.t.model.sorts) {
            const kind = this.t.columns.headers[key.column]?.dataset.kpSort ?? 'text';
            const order = this.t.columns.orders[key.column];
            /** @param {string} x @param {string} y */
            const by = (x, y) => this.t.settings.compareFn(x, y, kind, this.t.controls.locale);
            const left = this.t.columns.cellValue(a, key.column);
            const right = this.t.columns.cellValue(b, key.column);
            const c = order ? compareByOrder(order, left, right, by) : by(left, right);
            if (c !== 0) return key.direction === 'ascending' ? c : -c;
        }
        return 0;
    }

    applySorts() {
        if (this.t.controls.externalSort) {
            // The order the page rendered, which it changes itself on kp-datatable-sort and then refresh().
            const keep = new Set(this.t.model.shownRows);
            this.t.model.shownRows = this.t.groups.arrange(this.t.model.all.filter((row) => keep.has(row)));
            return;
        }
        if (this.t.model.sorts.length === 0) {
            // Back to the rendered order, filtered.
            const keep = new Set(this.t.model.shownRows);
            this.t.model.shownRows = this.t.model.rendered.filter((row) => keep.has(row));
        } else this.t.model.shownRows = [...this.t.model.shownRows].sort(this.t.bound(this, this.compareRows));
        // Group rows keep their rows together [J2]: the sort above is
        // stable, so this orders the rows within each group.
        this.t.model.shownRows = this.t.groups.arrange(this.t.model.shownRows);
    }

    /** @param {{ keepPage?: boolean }} [options] */
    applyFilter({ keepPage = false } = {}) {
        if (this.t.controls.serverMode) {
            if (!keepPage) this.t.model.page = 0;
            this.t.server.request();
            return;
        }
        const needle = this.t.model.query.trim().toLowerCase();
        this.t.model.shownRows = this.t.model.all.filter((row) => {
            if (needle !== '') {
                const hit = this.t.model.scope === null ? this.t.settings.filterFn(row, needle) : this.t.columns.cellText(row, this.t.model.scope).toLowerCase().includes(needle);
                if (!hit) return false;
            }
            for (const [at, value] of this.t.model.filters) {
                const kind = this.t.columns.filterKinds[at];
                if (kind && !matchesFilter(kind, value, kind === 'choice' ? this.t.columns.choiceText(row, at) : this.t.columns.cellValue(row, at), this.t.controls.locale)) return false;
            }
            return true;
        });
        this.applySorts();
        if (!keepPage) this.t.model.page = 0;
        this.t.render.render();
    }
}
