// The filter panel's choice lists and date field: a choice filter's values, the boxes that follow them, and the picker's markup.
import { CHECK_CLASS } from '../selectors.js';
import { splitList } from '../filter.js';
import { collator } from '../../locale.js';
import { compareByOrder } from '../sort.js';
import { getStrings } from '../../strings.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableFilterChoices {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
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
