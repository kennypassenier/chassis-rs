// Row selection: focus memory, announcements and the select-all.
import { GROUP_ROW, GROUP_TOGGLE, ROW_TOGGLE, SELECT_ROW } from '../selectors.js';
import { SELECT_EVENT } from '../events.js';
/** @typedef {{ element: HTMLElement, selector: string, key: string | null, group: string | null }} FocusMemo */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableSelection {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        /** @type {FocusMemo | null} */
        this.focusMemo = null;
    }

    /** @param {HTMLElement} element @returns {FocusMemo | null} */
    toggleMemo(element) {
        const selector = element.matches(ROW_TOGGLE) ? ROW_TOGGLE : element.matches(GROUP_TOGGLE) ? GROUP_TOGGLE : null;
        const row = /** @type {HTMLTableRowElement | null} */ (element.closest('tr'));
        if (selector === null || row === null) return null;
        const isGroup = row.matches(GROUP_ROW);
        return { element, selector, key: isGroup ? null : this.t.columns.keyOf(row), group: isGroup ? (row.dataset.kpRowGroup ?? null) : null };
    }

    /** @param {FocusEvent} event */
    onBodyFocusIn(event) {
        this.focusMemo = event.target instanceof HTMLElement ? this.toggleMemo(event.target) : null;
    }

    /** Focus that moved on, while the toggle is still in the page, is the reader's choice: forget it. @param {FocusEvent} event */
    onBodyFocusOut(event) {
        if (this.focusMemo !== null && event.target === this.focusMemo.element && this.focusMemo.element.isConnected) this.focusMemo = null;
    }

    announceSelection() {
        const rows = this.t.sync.selectedRows();
        const keys = rows.map(this.t.bound(this.t.columns, this.t.columns.keyOf));
        this.t.wrap.dispatchEvent(new CustomEvent(SELECT_EVENT, { bubbles: true, detail: { keys, rows } }));
    }

    /** @param {Event} event */
    onBodyChange(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        if (!target.matches(SELECT_ROW)) return;
        if (this.t.controls.serverMode) {
            const row = target.closest('tr');
            if (row !== null) {
                if (/** @type {HTMLInputElement} */ (target).checked) this.t.sync.serverSelection.add(this.t.columns.keyOf(row));
                else this.t.sync.serverSelection.delete(this.t.columns.keyOf(row));
            }
        }
        this.t.sync.syncSelectAll();
        this.t.sync.syncActions();
        this.announceSelection();
    }

    onSelectAll() {
        if (this.t.controls.selectAll === null) return;
        // The page, and only the page [gap-13]: ticking rows on pages
        // nobody has looked at is how a bulk action reaches rows its
        // user never saw.
        for (const row of this.t.model.pageRows) {
            const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
            if (box !== null) box.checked = this.t.controls.selectAll.checked;
            if (this.t.controls.serverMode) {
                if (this.t.controls.selectAll.checked) this.t.sync.serverSelection.add(this.t.columns.keyOf(row));
                else this.t.sync.serverSelection.delete(this.t.columns.keyOf(row));
            }
        }
        this.t.controls.selectAll.indeterminate = false;
        this.t.sync.syncActions();
        this.announceSelection();
    }

    /** @param {readonly string[]} keys */
    select(keys) {
        const want = new Set(keys);
        if (this.t.controls.serverMode) {
            this.t.sync.serverSelection.clear();
            for (const key of keys) this.t.sync.serverSelection.add(key);
        }
        for (const row of this.t.model.all) {
            const box = /** @type {HTMLInputElement | null} */ (row.querySelector(SELECT_ROW));
            if (box !== null) box.checked = want.has(this.t.columns.keyOf(row));
        }
        this.t.sync.syncSelectAll();
        this.t.sync.syncActions();
        this.announceSelection();
    }

    onClearSelection() {
        return this.select([]);
    }
}
