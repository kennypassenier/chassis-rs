// The add-filter mode's editor (#filter-add): one column's filter, opened from its pill or the add menu, applied or cancelled.
import { getStrings } from '../../strings.js';
import { readFilterBounds } from '../filter.js';
import { CHECK_CLASS } from '../selectors.js';
import { attachDatePickers, datePicker } from '../../datepicker.js';
/** @typedef {import('../events.js').FilterKind} FilterKind */
/** @typedef {import('../events.js').FilterValue} FilterValue */
/** @typedef {import('../../strings/types.js').Strings} Strings */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */
/** @typedef {{ from?: string, to?: string } | undefined} Bounds */

/** The two ends of a range or date filter. */
const BOUNDS = /** @type {const} */ (['from', 'to']);

export class TableFilterEditor {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        /** The column whose editor is open. @type {number | null} */
        this.editingFilter = null;
        /** The pill the focus returns to when the editor closes; null for the add button. @type {number | null} */
        this.editorReturn = null;
        /** Takes away the date pickers of the open editor. */
        this.detachEditorPickers = () => {};
    }

    /** Open column `at`'s editor, with the filter it has. @param {number} at @param {number | null} returnTo the pill the focus goes back to */
    openFilterEditor(at, returnTo) {
        const kind = this.t.columns.filterKinds[at];
        const form = this.t.filterUi.filterEditor;
        if (form === null || !kind) return;
        this.closeFilterEditor(false);
        const s = getStrings();
        const label = this.t.columns.labelOf(at);
        const current = this.t.model.filters.get(at);
        const range = /** @type {Bounds} */ (Array.isArray(current) ? undefined : current);
        this.editingFilter = at;
        this.editorReturn = returnTo;
        form.setAttribute('aria-label', s.tableFilterEditor(label));
        form.dataset.kpFilterColumn = String(at);
        const title = this.t.identity.make('p', 'kp-datatable__filter-editor-title');
        title.textContent = label;
        form.append(title);
        form.append(kind === 'choice' ? this.choicesField(at, current, s, label) : this.boundsField(kind, range, s, label));
        form.append(...this.editorFoot(s));
        form.hidden = false;
        if (kind === 'date') this.startPickers(form, range);
        this.t.pills.renderPills();
        /** @type {HTMLElement | null} */ (form.querySelector('input'))?.focus();
    }

    /**
     * A choice filter's boxes, one per value, ticked as the filter is.
     * @param {number} at @param {FilterValue | undefined} current @param {Strings} s @param {string} label
     */
    choicesField(at, current, s, label) {
        const { identity } = this.t;
        const set = identity.make('fieldset', 'kp-fieldset');
        const legend = identity.make('legend', 'kp-sr-only');
        legend.textContent = s.tableFilterChoicesLegend(label);
        const choices = identity.make('div', 'kp-datatable__filter-editor-choices');
        for (const value of this.t.filterUi.choiceValues(at)) {
            const option = identity.make('label', 'kp-field__option');
            const box = /** @type {HTMLInputElement} */ (identity.make('input', CHECK_CLASS));
            box.type = 'checkbox';
            box.name = 'values';
            box.value = value;
            box.checked = Array.isArray(current) && current.includes(value);
            option.append(box, ` ${value}`);
            choices.append(option);
        }
        set.append(legend, choices);
        return set;
    }

    /**
     * A range or date filter's two bounds: number fields, or the package's date pickers with the label on the row above the field.
     * @param {'range' | 'date'} kind @param {Bounds} range @param {Strings} s @param {string} label
     */
    boundsField(kind, range, s, label) {
        const { identity } = this.t;
        const pair = identity.make('div', 'kp-datatable__filter-editor-pair');
        for (const bound of BOUNDS) {
            const input = /** @type {HTMLInputElement} */ (identity.make('input', 'kp-field__input'));
            input.id = `${identity.id}-filter-editor-${bound}`;
            input.dataset.kpFilterBound = bound;
            input.autocomplete = 'off';
            input.setAttribute('aria-describedby', `${identity.id}-filter-editor-error`);
            const text = /** @type {HTMLLabelElement} */ (identity.make('label', 'kp-field__label'));
            text.htmlFor = input.id;
            text.textContent = s.tableFilterBound(kind, bound, label);
            if (kind === 'range') {
                input.type = 'text';
                input.inputMode = 'decimal';
                input.value = range?.[bound] ?? '';
                const field = identity.make('div', 'kp-field');
                field.append(text, input);
                pair.append(field);
            } else {
                const picker = this.t.filterUi.datePickerFor(input);
                picker.prepend(text);
                pair.append(picker);
            }
        }
        return pair;
    }

    /** The editor's error line and its Apply and Cancel. @param {Strings} s */
    editorFoot(s) {
        const { identity } = this.t;
        const error = identity.make('p', 'kp-field__error');
        error.id = `${identity.id}-filter-editor-error`;
        error.dataset.kpFilterError = '';
        error.setAttribute('role', 'alert');
        error.hidden = true;
        const actions = identity.make('div', 'kp-datatable__filter-editor-actions');
        const apply = /** @type {HTMLButtonElement} */ (identity.make('button', 'kp-button kp-button--primary kp-button--sm'));
        apply.type = 'submit';
        apply.textContent = s.tableFilterApply;
        const cancel = /** @type {HTMLButtonElement} */ (identity.make('button', 'kp-button kp-button--ghost kp-button--sm'));
        cancel.type = 'button';
        cancel.dataset.kpFilterCancel = '';
        cancel.textContent = s.tableFilterCancel;
        actions.append(apply, cancel);
        return [error, actions];
    }

    /** Wire the editor's date pickers and give them the filter's dates. @param {HTMLFormElement} form @param {Bounds} range */
    startPickers(form, range) {
        this.detachEditorPickers = attachDatePickers(form);
        for (const bound of BOUNDS) {
            const wanted = range?.[bound] ?? '';
            const picker = form.querySelector(`[data-kp-filter-bound="${bound}"]`)?.closest('[data-kp-datepicker]');
            if (wanted !== '' && picker) datePicker(picker)?.set(wanted);
        }
    }

    /** @param {boolean} [focus] hand the focus back to the pill, or to the add button */
    closeFilterEditor(focus = true) {
        const { filterUi } = this.t;
        const form = filterUi.filterEditor;
        if (this.editingFilter === null || form === null) return;
        this.detachEditorPickers();
        this.detachEditorPickers = () => {};
        const back = this.editorReturn;
        this.editingFilter = null;
        this.editorReturn = null;
        form.hidden = true;
        form.textContent = '';
        delete form.dataset.kpFilterColumn;
        form.removeAttribute('aria-label');
        this.t.pills.renderPills();
        if (!focus) return;
        const pill = back === null ? null : /** @type {HTMLElement | null} */ (filterUi.pills?.querySelector(`[data-kp-filter-pill="${back}"]`) ?? null);
        (pill ?? filterUi.addButton)?.focus();
    }

    /** @param {SubmitEvent} event */
    onEditorSubmit(event) {
        event.preventDefault();
        const at = this.editingFilter;
        const form = this.t.filterUi.filterEditor;
        if (at === null || form === null) return;
        const kind = this.t.columns.filterKinds[at];
        /** @type {FilterValue | null} */
        let next = null;
        if (kind === 'choice') {
            const values = [...form.querySelectorAll('input[name="values"]:checked')].map((box) => /** @type {HTMLInputElement} */ (box).value);
            next = values.length > 0 ? values : null;
        } else if (kind === 'range' || kind === 'date') {
            const read = this.readBounds(form, at, kind);
            if (read.refused) return;
            next = read.value;
        }
        // A filter just applied returns the focus to its own pill.
        if (next !== null) this.editorReturn = at;
        this.t.handlers.setFilter(at, next);
        this.closeFilterEditor(true);
    }

    /**
     * Read the editor's two bounds; a bound that does not read is marked, said and focused.
     * @param {HTMLFormElement} form @param {number} at @param {'range' | 'date'} kind
     * @returns {{ refused: true } | { refused: false, value: FilterValue | null }}
     */
    readBounds(form, at, kind) {
        const s = getStrings();
        const read = (/** @type {'from' | 'to'} */ bound) => {
            const input = /** @type {HTMLInputElement} */ (form.querySelector(`[data-kp-filter-bound="${bound}"]`));
            const label = bound === 'from' ? s.tableFilterFrom(this.t.columns.labelOf(at)) : s.tableFilterTo(this.t.columns.labelOf(at));
            return { text: input.value, iso: input.dataset.kpDateValue, label };
        };
        const result = readFilterBounds(kind, { from: read('from'), to: read('to') }, s, this.t.controls.locale);
        for (const input of form.querySelectorAll('[data-kp-filter-bound]')) input.removeAttribute('aria-invalid');
        if (result.error === undefined) return { refused: false, value: result.value };
        const error = /** @type {HTMLElement} */ (form.querySelector('[data-kp-filter-error]'));
        error.textContent = result.error;
        error.hidden = false;
        const field = /** @type {HTMLElement} */ (form.querySelector(`[data-kp-filter-bound="${result.bound}"]`));
        field.setAttribute('aria-invalid', 'true');
        field.focus();
        return { refused: true };
    }

    /** @param {MouseEvent} event */
    onEditorClick(event) {
        if (/** @type {HTMLElement} */ (event.target).closest('[data-kp-filter-cancel]') !== null) this.closeFilterEditor(true);
    }

    /** @param {KeyboardEvent} event */
    onEditorKeydown(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        // Escape inside an open calendar closes the calendar, not the editor.
        if (event.key !== 'Escape' || event.defaultPrevented || target.closest('[data-kp-date-panel]') !== null) return;
        if (target.getAttribute('aria-expanded') === 'true') return;
        event.preventDefault();
        this.closeFilterEditor(true);
    }
}
