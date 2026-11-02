// In-cell editing, the field and the app: the editor's control per kind, the check of a value, and the app's say on a change.
import { getStrings } from '../../strings.js';
import { splitList } from '../filter.js';
import { attachSelect, drawsSelect } from '../../combobox.js';
import { attachDatePickers, datePicker } from '../../datepicker.js';
import { EDIT_EVENT } from '../events.js';
/** @typedef {import('../events.js').EditDetail} EditDetail */
/** @typedef {import('../events.js').EditKind} EditKind */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableEditField {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
    }

    /**
     * The editor's field, put in `holder`: a select of the column's values, a number or text input, or the package's date picker.
     * @param {EditKind} kind @param {number} column @param {string} previous @param {HTMLElement} holder
     * @returns {HTMLInputElement | HTMLSelectElement}
     */
    editField(kind, column, previous, holder) {
        const { identity, columns } = this.t;
        const header = columns.headers[column];
        if (kind === 'select') {
            const select = /** @type {HTMLSelectElement} */ (identity.make('select', 'kp-field__input'));
            const declared = splitList(header?.dataset.kpEditOptions);
            const values = declared.length > 0 ? declared : [...new Set(this.t.model.all.map((r) => columns.cellText(r, column)).filter((v) => v !== ''))];
            if (!values.includes(previous)) values.unshift(previous);
            for (const value of values) {
                const option = /** @type {HTMLOptionElement} */ (identity.make('option'));
                option.value = value;
                option.textContent = value;
                select.append(option);
            }
            select.value = previous;
            holder.append(select);
            return select;
        }
        const input = /** @type {HTMLInputElement} */ (identity.make('input', 'kp-field__input'));
        input.value = kind === 'date' ? '' : previous;
        if (kind === 'number') {
            input.type = 'number';
            if (header?.dataset.kpEditMin !== undefined) input.min = header.dataset.kpEditMin;
            if (header?.dataset.kpEditMax !== undefined) input.max = header.dataset.kpEditMax;
        } else if (kind === 'text') input.type = 'text';
        if (kind === 'date') {
            input.id = `${identity.id}-edit-date`;
            holder.append(this.t.filterUi.choices.datePickerFor(input));
        } else holder.append(input);
        return input;
    }

    /**
     * Wire the field once it is in the cell: the drawn list of a select, the date picker with the cell's date.
     * @param {EditKind} kind @param {HTMLInputElement | HTMLSelectElement} control @param {HTMLElement} holder @param {string} previous
     * @returns {() => void} what takes that wiring away
     */
    startField(kind, control, holder, previous) {
        if (kind === 'select' && drawsSelect(control)) return attachSelect(/** @type {HTMLSelectElement} */ (control));
        if (kind !== 'date') return () => {};
        const detachPickers = attachDatePickers(holder);
        const picker = holder.querySelector('[data-kp-datepicker]');
        const handle = picker === null ? null : datePicker(picker);
        if (previous !== '') handle?.set(previous);
        return detachPickers;
    }

    /**
     * Tell the app about a change and wait for its answer: null when it
     * accepts, the message when it refuses.
     *
     * @param {HTMLTableRowElement} row @param {number} column @param {string} value @param {string} previous @param {boolean} isUndo
     * @returns {Promise<string | null>}
     */
    async askApp(row, column, value, previous, isUndo) {
        const s = getStrings();
        /** @type {string | null} */
        let refused = null;
        /** @type {Promise<unknown>[]} */
        const waits = [];
        /** @type {EditDetail} */
        const detail = {
            key: this.t.columns.keyOf(row),
            row,
            cell: /** @type {HTMLTableCellElement} */ (row.cells[column]),
            column,
            label: this.t.columns.labelOf(column),
            value,
            previous,
            undo: isUndo,
            reject: (message) => {
                refused = message ?? s.tableEditInvalid;
            },
            waitUntil: (promise) => {
                waits.push(promise);
            },
        };
        const event = new CustomEvent(EDIT_EVENT, { bubbles: true, cancelable: true, detail });
        this.t.wrap.dispatchEvent(event);
        if (event.defaultPrevented && refused === null) refused = s.tableEditInvalid;
        const onEdit = this.t.settings.onEdit;
        if (onEdit !== undefined) waits.push(Promise.resolve().then(() => onEdit(detail)));
        if (refused === null && waits.length > 0) {
            try {
                for (const answer of await Promise.all(waits)) {
                    if (typeof answer === 'string') refused = answer;
                    else if (answer === false) refused = s.tableEditInvalid;
                }
            } catch (error) {
                refused = error instanceof Error && error.message !== '' ? error.message : s.tableEditInvalid;
            }
        }
        return refused;
    }

    /**
     * Why a value cannot be saved: a required cell left empty, or a number that is not one; null when it can.
     * @param {EditKind} kind @param {number} column @param {string} value @param {ReturnType<typeof getStrings>} s
     */
    checkValue(kind, column, value, s) {
        if (value === '' && this.t.columns.headers[column]?.dataset.kpEditRequired !== undefined) return s.tableEditRequired;
        if (kind === 'number' && value !== '' && Number.isNaN(Number(value))) return s.tableEditInvalid;
        return null;
    }
}
