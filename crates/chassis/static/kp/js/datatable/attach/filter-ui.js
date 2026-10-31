// The filter panel: its columns, pills, add menu, editor and choice lists.
import { ADD_FILTER, CHECK_CLASS, FILTERS, FILTER_TOGGLE, PILLS } from '../selectors.js';
import { attachDatePickers } from '../../datepicker.js';
import { splitList } from '../filter.js';
import { collator } from '../../locale.js';
import { compareByOrder } from '../sort.js';
import { getStrings } from '../../strings.js';
/** @typedef {import('../events.js').FilterKind} FilterKind */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableFilterUi {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        // ── Filters, declared on the headers ───────────────────────────
        this.filterColumns = this.t.columns.filterKinds.flatMap((kind, at) => (kind === null ? [] : [at]));
        /** @type {HTMLElement | null} */
        this.panel = null;
        /** @type {HTMLButtonElement | null} */
        this.toggle = null;
        /** @type {HTMLElement | null} */
        this.pills = null;
        this.addMode = (this.t.wrap.dataset.kpFilterMode ?? this.t.settings.filterMode) === 'add';
        /** `data-kp-filter-ui="none"`: the filters work, the page draws them [datatable-r5-1019, O22]. */
        this.bareFilters = this.t.wrap.dataset.kpFilterUi === 'none';
        /** The add-filter mode's button, its menu, the list in the menu and the editor [#filter-add]. */
        /** @type {HTMLButtonElement | null} */
        this.addButton = null;
        /** @type {HTMLElement | null} */
        this.addPop = null;
        /** @type {HTMLElement | null} */
        this.addMenu = null;
        /** @type {HTMLFormElement | null} */
        this.filterEditor = null;
        if (this.filterColumns.length > 0 && this.addMode && !this.bareFilters) this.buildAddMode();
        if (this.filterColumns.length > 0 && !this.addMode && !this.bareFilters) this.buildPanel();
        if (this.filterColumns.length > 0 && !this.bareFilters) this.findPills();
    }

    /** The row of pills that shows the filters set: the page's, or one made here. */
    findPills() {
        this.pills = /** @type {HTMLElement | null} */ (this.t.wrap.querySelector(PILLS));
        if (this.pills === null) {
            this.pills = this.t.identity.add(this.t.identity.make('div', 'kp-datatable__pills'));
            this.pills.dataset.kpDatatablePills = '';
            this.t.wrap.insertBefore(this.pills, this.t.chrome.tableBlock);
        }
    }

    /** The panel mode: the panel of every filter, and the toggle that opens it. */
    buildPanel() {
        const { identity, wrap } = this.t;
        let panel = /** @type {HTMLElement | null} */ (wrap.querySelector(FILTERS));
        if (panel === null) {
            panel = identity.add(identity.make('div', 'kp-datatable__filters'));
            panel.dataset.kpDatatableFilters = '';
            panel.hidden = wrap.dataset.kpFiltersOpen === undefined;
            wrap.insertBefore(panel, this.t.chrome.tableBlock);
        }
        if (panel.id === '') {
            panel.id = `${identity.id}-filters`;
            const node = panel;
            identity.undo.push(() => node.removeAttribute('id'));
        }
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', identity.s0.tableFiltersLabel);
        this.panel = panel;
        for (const at of this.filterColumns) panel.append(this.panelField(at));
        const toggle = this.takeToggle(panel);
        toggle.setAttribute('aria-controls', panel.id);
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
    }

    /** The panel's toggle: the page's, or one made here, in the top bar. @param {HTMLElement} panel */
    takeToggle(panel) {
        const { identity, wrap, chrome } = this.t;
        let toggle = /** @type {HTMLButtonElement | null} */ (wrap.querySelector(FILTER_TOGGLE));
        if (toggle === null) {
            toggle = /** @type {HTMLButtonElement} */ (identity.add(identity.make('button', 'kp-button kp-button--ghost kp-datatable__filter-toggle')));
            toggle.type = 'button';
            toggle.dataset.kpDatatableFilterToggle = '';
            if (chrome.topBar !== null) chrome.topBar.append(toggle);
            else wrap.insertBefore(toggle, panel);
        }
        this.toggle = toggle;
        return toggle;
    }

    /** One filter column's fieldset in the panel: a choice list, or a range of two bounds. @param {number} at */
    panelField(at) {
        const { identity, columns } = this.t;
        const kind = /** @type {FilterKind} */ (columns.filterKinds[at]);
        const set = identity.add(identity.make('fieldset', 'kp-fieldset kp-datatable__filter'));
        set.dataset.kpFilterColumn = String(at);
        const legend = identity.make('legend', 'kp-field__label');
        legend.textContent = columns.labelOf(at);
        set.append(legend);
        if (kind === 'choice') {
            this.fillChoices(set, at, []);
            return set;
        }
        const range = this.rangeField(at, kind);
        set.append(range);
        if (kind === 'date') identity.undo.push(attachDatePickers(range));
        return set;
    }

    /**
     * A range filter's two bounds: numbers, or the package's own date pickers. A date bound is the package's own date picker, not a
     * bare date input, so it wears every theme's picker (scope-58, Kenny's second nostromo pass). The picker holds ISO in
     * data-kp-date-value whatever the field shows.
     * @param {number} at @param {FilterKind} kind
     */
    rangeField(at, kind) {
        const { identity } = this.t;
        const label = this.t.columns.labelOf(at);
        const range = identity.make('div', 'kp-datatable__range');
        for (const bound of ['from', 'to']) {
            const input = /** @type {HTMLInputElement} */ (identity.make('input', 'kp-field__input'));
            input.dataset.kpFilterBound = bound;
            input.setAttribute('aria-label', bound === 'from' ? identity.s0.tableFilterFrom(label) : identity.s0.tableFilterTo(label));
            if (kind === 'range') {
                input.type = 'number';
                range.append(input);
                continue;
            }
            input.id = `${identity.id}-filter-${at}-${bound}`;
            range.append(this.datePickerFor(input));
        }
        return range;
    }

    /** The add-filter mode [#filter-add]: its button (the page's or one made here), its menu and the filter editor. */
    buildAddMode() {
        const { identity } = this.t;
        const s = identity.s0;
        const popId = `${identity.id}-add-filter`;
        const button = this.takeAddButton();
        this.t.details.decoratePart(button, { kind: 'add-filter', label: s.tableAddFilter(0) });
        button.setAttribute('aria-haspopup', 'true');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', popId);
        button.setAttribute('popovertarget', popId);
        // Under its button, as the column menu is placed.
        button.style.setProperty('anchor-name', `--${popId}`);
        const pop = identity.add(identity.make('div', 'kp-popover kp-datatable__add-menu'));
        pop.id = popId;
        pop.setAttribute('popover', 'auto');
        pop.dataset.kpDatatableAddMenu = '';
        pop.style.setProperty('position-anchor', `--${popId}`);
        this.addPop = pop;
        this.addMenu = identity.make('ul', 'kp-menu');
        this.addMenu.setAttribute('aria-label', s.tableAddFilterMenu);
        pop.append(this.addMenu);
        button.after(pop);
        this.makeFilterEditor();
    }

    /**
     * The editor's frame is the package's own, not a .kp-card or a .kp-popover: both carry a clip-path in some registers, which cut
     * off the calendar a date bound opens (measured on the mock, 2026-09-13). The calendar itself goes to the top layer.
     */
    makeFilterEditor() {
        const { identity } = this.t;
        const editor = /** @type {HTMLFormElement} */ (identity.add(identity.make('form', 'kp-datatable__filter-editor')));
        editor.id = `${identity.id}-filter-editor`;
        editor.dataset.kpDatatableFilterEditor = '';
        editor.noValidate = true;
        editor.hidden = true;
        this.t.wrap.insertBefore(editor, this.t.chrome.tableBlock);
        this.filterEditor = editor;
    }

    /** The add-filter button: one made here, or the page's, whose attributes and words the detach gives back. */
    takeAddButton() {
        const { identity, wrap } = this.t;
        const found = /** @type {HTMLButtonElement | null} */ (wrap.querySelector(ADD_FILTER));
        if (found === null) {
            const made = /** @type {HTMLButtonElement} */ (identity.add(identity.make('button', 'kp-button kp-datatable__add-filter')));
            made.type = 'button';
            made.dataset.kpDatatableAddFilter = '';
            this.t.chrome.ensureTopBar().append(made);
            this.addButton = made;
            return made;
        }
        const was = ['aria-haspopup', 'aria-expanded', 'aria-controls', 'popovertarget'].map((name) => [name, found.getAttribute(name)]);
        const text = found.textContent;
        identity.undo.push(() => {
            for (const [name, value] of was) {
                if (value === null || value === undefined) found.removeAttribute(/** @type {string} */ (name));
                else found.setAttribute(/** @type {string} */ (name), value);
            }
            found.style.removeProperty('anchor-name');
            found.textContent = text;
        });
        this.addButton = found;
        return found;
    }

    /**
     * A choice filter's values: the header's `data-kp-filter-options`, else
     * every value the rows hold, in the column's declared order or the
     * locale's. The add-filter editor asks when it opens and the filter
     * panel asks again on refresh(), so rows written after the attach are
     * in both.
     *
     * @param {number} at
     */
    choiceValues(at) {
        const declared = splitList(this.t.columns.headers[at]?.dataset.kpFilterOptions);
        if (declared.length > 0) return declared;
        const values = [...new Set(this.t.model.all.map((row) => this.t.columns.choiceText(row, at)).filter((v) => v !== ''))];
        const order = this.t.columns.orders[at];
        return values.sort((a, b) => (order ? compareByOrder(order, a, b, collator(this.t.controls.locale).compare) : collator(this.t.controls.locale).compare(a, b)));
    }

    /**
     * Put a panel fieldset's boxes in step with the choice values: one box
     * per value the rows hold now, ticked where `ticked` has it, and a
     * ticked value no row holds any more stays, so it can still be
     * unticked. Nothing is rebuilt while the list already matches, so a
     * focused box keeps its focus.
     *
     * @param {Element} set @param {number} at @param {string[]} ticked
     */
    fillChoices(set, at, ticked) {
        const values = [...this.choiceValues(at)];
        for (const value of ticked) if (!values.includes(value)) values.push(value);
        const boxes = /** @type {HTMLInputElement[]} */ ([...set.querySelectorAll('input[type="checkbox"]')]);
        if (boxes.length === values.length && boxes.every((box, i) => box.value === values[i])) return;
        for (const box of boxes) box.closest('.kp-field__option')?.remove();
        for (const value of values) {
            const option = this.t.identity.make('label', 'kp-field__option');
            const box = /** @type {HTMLInputElement} */ (this.t.identity.make('input', CHECK_CLASS));
            box.type = 'checkbox';
            box.value = value;
            box.checked = ticked.includes(value);
            option.append(box, ` ${value}`);
            set.append(option);
        }
    }

    /**
     * The package's date picker around a text field: the markup the
     * standalone picker has, class for class and string for string — a
     * plain button with the glyph, named by aria-label and title
     * [Kenny's note of 2026-09-13 — it was a ghost button reading
     * "Calendar"]. The caller attaches it.
     *
     * @param {HTMLInputElement} input
     */
    datePickerFor(input) {
        const picker = this.t.identity.make('div', 'kp-datepicker');
        picker.dataset.kpDatepicker = '';
        picker.dataset.kpLocale = this.t.controls.locale;
        input.type = 'text';
        input.inputMode = 'numeric';
        input.dataset.kpDateInput = '';
        const s = getStrings();
        const opener = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-button'));
        opener.type = 'button';
        opener.dataset.kpDateOpen = '';
        opener.setAttribute('aria-label', s.calendarOpen);
        opener.title = s.calendarOpen;
        const glyph = this.t.identity.make('span');
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = s.calendarButton;
        opener.append(glyph);
        const datePanel = this.t.identity.make('div', 'kp-datepicker__panel');
        datePanel.dataset.kpDatePanel = '';
        datePanel.hidden = true;
        picker.append(input, opener, datePanel);
        return picker;
    }
}
