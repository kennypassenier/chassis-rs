// Clicks in the table's wrapper: the chrome's buttons (clear the selection, the search and filters, Retry, the sort reset, expand
// and collapse all, Undo), a group row that folds, a row that opens, and a cell's edit button.
import { CLEAR, CLEAR_SELECTION, COLLAPSE_ALL, DETAIL, EDIT_CELL, EXPAND_ALL, GROUP_ROW, GROUP_TOGGLE, RETRY, ROW_CONTROLS, ROW_TOGGLE, SORT_RESET } from '../selectors.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

/**
 * The control a click landed on inside a row, if any: a cell or row the keyboard grid made focusable is not a control of its own.
 * @param {HTMLElement} target
 */
function controlAt(target) {
    const interactive = target.closest(ROW_CONTROLS);
    return interactive !== null && !interactive.matches('td, th, tr') ? interactive : null;
}

/** Whether the click ended a text selection rather than pressing something. */
function selecting() {
    return (window.getSelection?.()?.toString() ?? '') !== '';
}

export class TableWrapClick {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
    }

    /** @param {MouseEvent} event */
    onWrapClick(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        this.clickChrome(target);
        const groupRow = /** @type {HTMLTableRowElement | null} */ (target.closest(GROUP_ROW));
        if (groupRow !== null && groupRow.parentElement === this.t.body && this.t.groups.groups.get(groupRow.dataset.kpRowGroup ?? '') === groupRow)
            this.clickGroup(target, groupRow);
        const rowToggle = /** @type {HTMLElement | null} */ (target.closest(ROW_TOGGLE));
        if (rowToggle !== null && this.t.body.contains(rowToggle)) {
            const row = /** @type {HTMLTableRowElement} */ (rowToggle.closest('tr'));
            this.t.expand.setExpanded(row, !this.t.details.expanded.has(this.t.columns.keyOf(row)));
            /** @type {HTMLElement | null} */ (row.querySelector(ROW_TOGGLE))?.focus();
        } else if (this.t.details.expandable && this.t.body.contains(target)) this.clickRow(target);
        const editButton = /** @type {HTMLElement | null} */ (target.closest(EDIT_CELL));
        if (editButton !== null && this.t.body.contains(editButton)) {
            const cell = /** @type {HTMLTableCellElement} */ (editButton.closest('td, th'));
            void this.t.edit.openEditor(/** @type {HTMLTableRowElement} */ (cell.parentElement), cell.cellIndex);
        }
    }

    /** The chrome's own buttons. @param {HTMLElement} target */
    clickChrome(target) {
        const { controls, handlers, expand, details, model, columns } = this.t;
        if (target.closest(CLEAR_SELECTION) !== null && controls.actions?.contains(target)) this.t.selection.onClearSelection();
        if (target.closest(CLEAR) !== null && controls.empty?.contains(target)) handlers.onClear();
        if (target.closest(RETRY) !== null && controls.failedSlot?.contains(target)) handlers.onRetry();
        if (target.closest(SORT_RESET) !== null) handlers.commitSorts(this.t.wire.initialSorts.map((key) => ({ ...key })));
        if (target.closest(EXPAND_ALL) !== null) {
            const openable = model.pageRows.filter((row) => row.querySelector(ROW_TOGGLE) !== null).map((row) => columns.keyOf(row));
            expand.expandKeys([...new Set([...details.expanded, ...openable])]);
        }
        if (target.closest(COLLAPSE_ALL) !== null) expand.expandKeys([]);
        if (target.closest('[data-kp-datatable-undo]') !== null && this.t.sortSetup.editLog?.contains(target)) void this.t.edit.undoEdit();
    }

    /**
     * A group row folds from its toggle, or from a click anywhere in it that is not on a control of its own or a selection [J2].
     * @param {HTMLElement} target @param {HTMLTableRowElement} groupRow
     */
    clickGroup(target, groupRow) {
        const groupToggle = target.closest(GROUP_TOGGLE);
        const control = controlAt(target);
        if (groupToggle === null && ((control !== null && groupRow.contains(control)) || selecting())) return;
        const key = groupRow.dataset.kpRowGroup ?? '';
        this.t.expand.setFolded(key, !this.t.groups.folded.has(key));
        if (groupToggle !== null) /** @type {HTMLElement | null} */ (groupRow.querySelector(GROUP_TOGGLE))?.focus();
    }

    /**
     * A click anywhere in an expandable row opens or closes it, as its toggle does (Kenny, 2026-10-02: "als we ergens in die rij
     * klikken, niet enkel op dat icoon"); not one on a control in the row, which does its own thing, and not one that ends a text
     * selection.
     * @param {HTMLElement} target
     */
    clickRow(target) {
        const row = /** @type {HTMLTableRowElement | null} */ (target.closest('tr'));
        const control = controlAt(target);
        if (row === null || row.parentElement !== this.t.body || row.matches(DETAIL) || row.matches(GROUP_ROW)) return;
        if (row.querySelector(ROW_TOGGLE) === null || (control !== null && row.contains(control)) || selecting()) return;
        this.t.expand.setExpanded(row, !this.t.details.expanded.has(this.t.columns.keyOf(row)));
    }
}
