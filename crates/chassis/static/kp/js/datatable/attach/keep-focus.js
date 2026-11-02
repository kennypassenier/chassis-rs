// The row that holds the focus survives a refresh [medicine-1102, Medicine Cabinet gap 27].
//
// A page that refreshes a table by swapping its body's rows for fresh ones took the row under a field the reader was typing in:
// the focus fell to <body> and the typed value went with the old row, so Medicine Cabinet skipped every refresh while a field
// had the focus. With `data-kp-keep-focused-row` on the wrapper the table keeps that row: when a fresh row with the same key
// (`data-kp-row-key`, else its id) arrives, the old row takes the fresh one's place, with its field, its value, its caret and
// the focus, and `kp-datatable-row-kept` { key, row, fresh } tells the page which fresh row was set aside. The next refresh
// after the focus left the row draws the fresh data as usual. A row whose key is no longer in the data goes, and the focus
// moves to the same cell of the row that took its place, so it never falls to <body>.
//
// Off by default (the fresh row wins, as before), read at every refresh, so the attribute can be set or taken away at any time.
import { ROW_KEPT_EVENT } from '../events.js';

/** The wrapper attribute that turns the keeping on. */
export const KEEP_FOCUSED_ROW = 'data-kp-keep-focused-row';
/** What can take the focus in a cell, for the neighbour that gets it when the focused row left the data. */
const FOCUSABLE = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

/** @typedef {import('./controller.js').DataTableControl} DataTableControl */
/** @typedef {{ row: HTMLTableRowElement, element: HTMLElement, key: string, at: number, cell: number }} KeepMemo */

export class TableKeepFocus {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        /** The row and control that hold the focus now, while the table keeps them. @type {KeepMemo | null} */
        this.memo = null;
        const { body, identity } = t;
        const focusIn = (/** @type {FocusEvent} */ event) => this.onFocusIn(event);
        const focusOut = (/** @type {FocusEvent} */ event) => this.onFocusOut(event);
        body.addEventListener('focusin', focusIn);
        body.addEventListener('focusout', focusOut);
        identity.undo.push(() => {
            body.removeEventListener('focusin', focusIn);
            body.removeEventListener('focusout', focusOut);
            this.memo = null;
        });
    }

    /** Whether this table keeps the focused row, read now. */
    wanted() {
        return this.t.wrap.hasAttribute(KEEP_FOCUSED_ROW);
    }

    /** Note the row the focus went into, when it is one of the table's rows and has a key. @param {FocusEvent} event */
    onFocusIn(event) {
        const { model, columns, body } = this.t;
        const element = event.target instanceof HTMLElement ? event.target : null;
        const row = /** @type {HTMLTableRowElement | null} */ (element?.closest('tr') ?? null);
        const key = row !== null && row.parentElement === body && model.isRow(row) ? columns.keyOf(row) : '';
        const cell = element?.closest('td, th');
        this.memo =
            element !== null && row !== null && key !== ''
                ? { row, element, key, at: model.pageRows.indexOf(row), cell: cell instanceof HTMLTableCellElement ? cell.cellIndex : 0 }
                : null;
    }

    /**
     * The reader moving the focus on forgets the row; a row the page took out keeps it. Checked after the event, because an engine
     * that fires focusout while it removes the row fires it with the row still in the page.
     * @param {FocusEvent} event
     */
    onFocusOut(event) {
        const memo = this.memo;
        if (memo === null || event.target !== memo.element) return;
        queueMicrotask(() => {
            if (this.memo === memo && memo.element.isConnected && document.activeElement !== memo.element) this.memo = null;
        });
    }

    /**
     * Before the rows are read again: put the focused row back in the place of its fresh copy. Returns the control to give the
     * focus back to, the neighbour's slot when the row left the data, or null when there is nothing to keep.
     * @returns {{ element: HTMLElement } | { neighbour: { at: number, cell: number } } | null}
     */
    restore() {
        const memo = this.memo;
        if (memo === null || !this.wanted() || memo.row.isConnected) return null;
        const active = document.activeElement;
        // Something else took the focus in the meantime: that is where the reader is now.
        if (active !== null && active !== document.body && active !== memo.element) return this.forget();
        const { body, model, columns, wrap } = this.t;
        const fresh = [...body.rows].find((row) => model.isRow(row) && columns.keyOf(row) === memo.key);
        if (fresh === undefined) {
            this.memo = null;
            return { neighbour: { at: memo.at, cell: memo.cell } };
        }
        fresh.replaceWith(memo.row);
        // It stands where its fresh copy stood: the order the page rendered is the body's order, not the old row's first place.
        const first = model.rendered.indexOf(memo.row);
        if (first >= 0) model.rendered.splice(first, 1);
        wrap.dispatchEvent(new CustomEvent(ROW_KEPT_EVENT, { bubbles: true, detail: { key: memo.key, row: memo.row, fresh } }));
        return { element: memo.element };
    }

    /** @returns {null} */
    forget() {
        this.memo = null;
        return null;
    }

    /**
     * The focused row left the data: the focus goes to the same cell of the row now in its place on the page (the last row when
     * it was the last), so it stays in the table instead of falling to <body>.
     * @param {{ at: number, cell: number }} slot
     */
    focusNeighbour(slot) {
        const rows = this.t.model.pageRows.filter((row) => !row.hidden);
        if (rows.length === 0 || slot.at < 0) return;
        const row = rows[Math.min(slot.at, rows.length - 1)];
        const cell = row.cells[slot.cell] ?? null;
        const target = /** @type {HTMLElement | null} */ (cell?.querySelector(FOCUSABLE) ?? row.querySelector(FOCUSABLE));
        target?.focus({ preventScroll: true });
    }
}
