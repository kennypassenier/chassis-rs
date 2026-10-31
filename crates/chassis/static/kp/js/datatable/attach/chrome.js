// The chrome around the table: the scroll box, the top and bottom bars.
import { CHECK_CLASS } from '../selectors.js';
import { watchScrolled } from '../grid.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableChrome {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        this.themeBox(t.controls.selectAll);
        this.nameUnlabelled(t.controls.selectAll, t.identity.s0.tableSelectAll);
        // A max height makes the header stick [Kenny, 2026-09-13]: the
        // stylesheet does the sticking, this only carries the value.
        this.maxHeight = this.t.wrap.dataset.kpMaxHeight;
        if (this.maxHeight !== undefined && this.maxHeight !== '') {
            this.t.wrap.style.setProperty('--kp-datatable-max-height', this.maxHeight);
            this.t.identity.undo.push(() => this.t.wrap.style.removeProperty('--kp-datatable-max-height'));
        }
        // The header's reach shows only while the box is scrolled [scope-90].
        this.scrollBox = /** @type {HTMLElement | null} */ (this.t.wrap.querySelector(':scope > .kp-table-wrap'));
        if (this.scrollBox !== null) this.t.identity.undo.push(watchScrolled(this.t.wrap, this.scrollBox));
        /** The direct child of the wrapper that holds the table: generated parts go before it. */
        this.tableBlock = /** @type {Element} */ (this.t.table);
        while (this.tableBlock.parentElement !== null && this.tableBlock.parentElement !== this.t.wrap) this.tableBlock = this.tableBlock.parentElement;
        /** @type {HTMLElement | null} */
        this.topBar = /** @type {HTMLElement | null} */ (
            [...this.t.wrap.children].find(
                (child) =>
                    child.classList.contains('kp-datatable__bar') && child.compareDocumentPosition(this.tableBlock) & Node.DOCUMENT_POSITION_FOLLOWING,
            ) ?? null
        );
        /** The bar under the table, where the status is, for the lines a feature adds. */
        this.bottomBar = /** @type {HTMLElement | null} */ (this.t.controls.status?.closest('.kp-datatable__bar') ?? null);
        this.fillScope();
        this.fillDensity();
    }

    /**
     * Name a control the page left without a label, for as long as the table is wired.
     * @param {HTMLInputElement | HTMLSelectElement | null} control
     * @param {string} name
     */
    nameUnlabelled(control, name) {
        if (control === null || control.hasAttribute('aria-label') || control.labels?.length !== 0) return;
        control.setAttribute('aria-label', name);
        this.t.identity.undo.push(() => control.removeAttribute('aria-label'));
    }

    /** The "In" choice: every column, then one per searchable column, unless the markup wrote its options. */
    fillScope() {
        const { controls, identity, columns } = this.t;
        const scopeSelect = controls.scopeSelect;
        if (scopeSelect === null) return;
        if (scopeSelect.options.length === 0) {
            const every = identity.make('option');
            every.setAttribute('value', '');
            every.textContent = identity.s0.tableSearchAllColumns;
            scopeSelect.append(identity.add(every));
            columns.headers.forEach((header, at) => {
                if (header.dataset.kpSearch === 'false' || columns.controlColumn(at) || columns.labelOf(at) === '') return;
                const option = /** @type {HTMLOptionElement} */ (identity.make('option'));
                option.value = String(at);
                option.textContent = columns.labelOf(at);
                scopeSelect.append(identity.add(option));
            });
        }
        this.nameUnlabelled(scopeSelect, identity.s0.tableSearchScope);
        this.t.model.scope = scopeSelect.value === '' ? null : Number(scopeSelect.value);
    }

    /** The density choice: comfortable and compact, unless the markup wrote its options. */
    fillDensity() {
        const { controls, identity } = this.t;
        const densitySelect = controls.densitySelect;
        if (densitySelect === null) return;
        if (densitySelect.options.length === 0) {
            for (const [value, text] of [
                ['comfortable', identity.s0.tableDensityComfortable],
                ['compact', identity.s0.tableDensityCompact],
            ]) {
                const option = /** @type {HTMLOptionElement} */ (identity.make('option'));
                option.value = value ?? '';
                option.textContent = text ?? '';
                densitySelect.append(identity.add(option));
            }
        }
        this.nameUnlabelled(densitySelect, identity.s0.tableDensity);
        densitySelect.value = this.t.wrap.getAttribute('data-density') === 'compact' ? 'compact' : 'comfortable';
    }

    // The package's own checkbox, whatever the markup wrote [gap-13,
    // Kenny's note]: a data table's boxes were the browser's, next to
    // themed boxes everywhere else on the page.
    /** @param {Element | null} box */
    themeBox(box) {
        if (box === null || box.classList.contains(CHECK_CLASS)) return;
        box.classList.add(CHECK_CLASS);
        this.t.identity.undo.push(() => box.classList.remove(CHECK_CLASS));
    }

    /** The bar a generated control goes in: the top bar, made when the markup has none. */
    ensureTopBar() {
        if (this.topBar !== null) return this.topBar;
        this.topBar = this.t.identity.add(this.t.identity.make('div', 'kp-datatable__bar'));
        this.t.wrap.insertBefore(this.topBar, this.t.wrap.firstElementChild);
        return this.topBar;
    }

    /** @param {HTMLElement} line */
    putUnder(line) {
        if (this.bottomBar !== null) this.bottomBar.append(line);
        else this.t.wrap.insertBefore(line, this.tableBlock.nextSibling);
    }
}
