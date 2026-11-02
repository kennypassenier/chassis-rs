// In-cell editing: open, commit, undo and the app's say.
import { getStrings } from '../../strings.js';
import { EDIT_CELL, EDIT_VALUE } from '../selectors.js';
import { drawsSelect } from '../../combobox.js';
import { TableEditField } from './edit-field.js';
/** @typedef {import('../events.js').EditDetail} EditDetail */
/** @typedef {import('../events.js').EditKind} EditKind */
/**
 * @typedef {{ row: HTMLTableRowElement, column: number, kind: EditKind, button: HTMLButtonElement, holder: HTMLElement,
 *   control: HTMLInputElement | HTMLSelectElement, error: HTMLElement, previous: string, detach: () => void, busy: boolean }} Editing
 */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableEdit {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        // ── Inline edit (#inline-edit) ─────────────────────────────────

        /** @type {Editing | null} */
        this.editing = null;
        /** @type {{ row: HTMLTableRowElement, column: number, before: string, after: string } | null} */
        this.lastEdit = null;
        /** Whether the drawn list of the select being edited was open when a key went down. */
        this.listWasOpen = false;
        /** The field, the check and the app's say. */
        this.field = new TableEditField(t);
    }

    /** @param {string} text @param {{ undo?: boolean }} [options] */
    logEdit(text, { undo: withUndo = false } = {}) {
        if (this.t.sortSetup.editLog === null) return;
        this.t.sortSetup.editLog.textContent = text;
        if (!withUndo) return;
        const button = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-button kp-button--ghost kp-button--sm'));
        button.type = 'button';
        button.dataset.kpDatatableUndo = '';
        button.textContent = getStrings().undo;
        this.t.sortSetup.editLog.append(' ', button);
    }

    /** Write a saved value into its cell, into the badge or the element that held the text. @param {HTMLTableCellElement} cell @param {string} value */
    writeCell(cell, value) {
        const holder = /** @type {HTMLElement} */ (cell.querySelector(EDIT_VALUE) ?? cell);
        const only = holder.children.length === 1 && holder.children[0]?.children.length === 0 ? holder.children[0] : null;
        if (only !== null && (holder.textContent ?? '').trim() === (only.textContent ?? '').trim()) only.textContent = value;
        else holder.textContent = value;
    }

    closeEditor() {
        if (this.editing === null) return;
        const current = this.editing;
        this.editing = null;
        current.detach();
        current.holder.remove();
        current.button.hidden = false;
        this.t.sync.grid?.sync();
    }

    /** Open the editor of cell `column` of `row`, saving the one that is open first. @param {HTMLTableRowElement} row @param {number} column */
    async openEditor(row, column) {
        if (this.editing !== null && !(await this.commitEdit(true))) return;
        const { columns, identity } = this.t;
        const kind = columns.editKinds[column];
        const cell = row.cells[column];
        const button = /** @type {HTMLButtonElement | null} */ (cell?.querySelector(EDIT_CELL) ?? null);
        if (kind === null || kind === undefined || cell === undefined || button === null) return;
        const s = getStrings();
        const key = columns.keyOf(row);
        const previous = columns.cellText(row, column);
        const holder = identity.make('div', 'kp-datatable__editor');
        holder.dataset.kpDatatableEditorWrap = '';
        holder.setAttribute('data-density', 'compact');
        const errorId = `${identity.id}-edit-error`;
        const error = identity.make('p', 'kp-field__error');
        error.id = errorId;
        error.hidden = true;
        const control = this.field.editField(kind, column, previous, holder);
        control.dataset.kpDatatableEditor = '';
        control.setAttribute('aria-label', s.tableEditField(columns.labelOf(column), key));
        control.setAttribute('aria-describedby', errorId);
        if (columns.headers[column]?.dataset.kpEditRequired !== undefined) control.setAttribute('aria-required', 'true');
        holder.append(error);
        button.hidden = true;
        cell.append(holder);
        const detach = this.field.startField(kind, control, holder, previous);
        this.editing = { row, column, kind, button, holder, control, error, previous, detach, busy: false };
        control.focus();
        if (control instanceof HTMLInputElement && kind !== 'date') control.select();
        this.logEdit(s.tableEditing(columns.labelOf(column), key));
    }

    /** @param {string} message */
    refuse(message) {
        if (this.editing === null) return;
        this.editing.error.textContent = message;
        this.editing.error.hidden = false;
        this.editing.control.setAttribute('aria-invalid', 'true');
        this.editing.control.focus();
    }

    /** @param {boolean} save @returns {Promise<boolean>} whether the editor closed */
    async commitEdit(save) {
        const current = this.editing;
        if (current === null) return true;
        if (current.busy) return false;
        const s = getStrings();
        const { row, column, kind, button, control, previous } = current;
        const key = this.t.columns.keyOf(row);
        if (!save) {
            this.closeEditor();
            this.logEdit(s.tableEditCancelled);
            button.focus();
            return true;
        }
        const value =
            kind === 'date' ? (control.dataset.kpDateValue ?? (control.value.trim() === '' ? '' : control.value.trim())) : control.value.trim();
        const wrong = this.field.checkValue(kind, column, value, s);
        if (wrong !== null) {
            this.refuse(wrong);
            return false;
        }
        if (value === previous) {
            this.closeEditor();
            button.focus();
            return true;
        }
        current.busy = true;
        const refused = await this.field.askApp(row, column, value, previous, false);
        current.busy = false;
        if (this.editing !== current) return true;
        if (refused !== null) {
            this.refuse(refused);
            return false;
        }
        const cell = /** @type {HTMLTableCellElement} */ (row.cells[column]);
        this.writeCell(cell, value);
        this.closeEditor();
        this.lastEdit = { row, column, before: previous, after: value };
        this.t.reorder.labelRow(row);
        this.logEdit(s.tableEdited(key, this.t.columns.labelOf(column), previous, value), { undo: true });
        button.focus();
        return true;
    }

    async undoEdit() {
        const last = this.lastEdit;
        if (last === null) return;
        const s = getStrings();
        const refused = await this.field.askApp(last.row, last.column, last.before, last.after, true);
        if (refused !== null) {
            this.logEdit(refused);
            return;
        }
        this.lastEdit = null;
        this.writeCell(/** @type {HTMLTableCellElement} */ (last.row.cells[last.column]), last.before);
        this.t.reorder.labelRow(last.row);
        this.logEdit(s.tableEditUndone(this.t.columns.keyOf(last.row), this.t.columns.labelOf(last.column), last.before));
        /** @type {HTMLElement | null} */ (last.row.cells[last.column]?.querySelector(EDIT_CELL) ?? null)?.focus();
    }

    /** @param {KeyboardEvent} event */
    onEditorKeyCapture(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        if (target.matches('select[data-kp-datatable-editor]')) this.listWasOpen = target.getAttribute('aria-expanded') === 'true';
    }

    /** @param {KeyboardEvent} event */
    onEditorKey(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        if (this.editing === null || !target.matches('[data-kp-datatable-editor]')) return;
        const isSelect = target instanceof HTMLSelectElement;
        if (event.key === 'Enter') {
            event.preventDefault();
            // Enter on a closed drawn list only opened it; Enter on an open
            // list took the highlighted option, and that is the save.
            if (!isSelect || this.listWasOpen || !drawsSelect(target)) void this.commitEdit(true);
        } else if (event.key === 'Escape') {
            const panelOpen = this.editing.holder.querySelector('[data-kp-date-panel]:not([hidden])') !== null;
            if ((isSelect && this.listWasOpen) || panelOpen) return;
            event.preventDefault();
            void this.commitEdit(false);
        }
    }

    /** Saving on blur, after the click that caused it has been handled. @param {FocusEvent} event */
    onEditorFocusOut(event) {
        if (this.editing === null || !this.editing.holder.contains(/** @type {Node} */ (event.target))) return;
        const current = this.editing;
        setTimeout(() => {
            if (this.editing !== current || current.busy) return;
            if (current.holder.contains(document.activeElement)) return;
            void this.commitEdit(true);
        }, 0);
    }
}
