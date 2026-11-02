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
// Rows that share a key are told apart by their place among them. A focus inside an expanded detail row is remembered by its
// owner row: the detail is drawn again by the refresh, so the focus goes to the first control of the fresh owner row, never to <body>.
//
// Off by default (the fresh row wins, as before), read at every refresh, so the attribute can be set or taken away at any time.
import { ROW_KEPT_EVENT } from '../events.js';
import { DETAIL } from '../selectors.js';

/** The wrapper attribute that turns the keeping on. */
export const KEEP_FOCUSED_ROW = 'data-kp-keep-focused-row';
/** What can take the focus in a cell, for the neighbour that gets it when the focused row left the data. */
const FOCUSABLE = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

/** @typedef {import('./controller.js').DataTableControl} DataTableControl */
/**
 * What the focus was in: the row (the owner row, when the focus was in an expanded detail row), its key, which of the rows
 * that share the key it was (`twin`), the visible slot it had on the page and the cell the control sat in.
 * @typedef {{ row: HTMLTableRowElement, element: HTMLElement, key: string, twin: number, detail: boolean, at: number, cell: number }} KeepMemo
 */

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

    /** The row the focus is in, or for a focus in an expanded detail row, the row that owns the detail. @param {Element | null} from */
    ownerOf(from) {
        const { model, body } = this.t;
        let row = /** @type {HTMLTableRowElement | null} */ (from?.closest('tr') ?? null);
        if (row === null || row.parentElement !== body) return { row: null, detail: false };
        if (model.isRow(row)) return { row, detail: false };
        if (!row.matches(DETAIL)) return { row: null, detail: false };
        while (row !== null && !model.isRow(row)) row = /** @type {HTMLTableRowElement | null} */ (row.previousElementSibling);
        return { row, detail: row !== null };
    }

    /** The rows of the body that carry `key`, in body order. @param {string} key */
    twins(key) {
        const { body, model, columns } = this.t;
        return [...body.rows].filter((row) => model.isRow(row) && columns.keyOf(row) === key);
    }

    /** Where a row stands among the rows the page shows now. @param {HTMLTableRowElement} row */
    slotOf(row) {
        return this.t.model.pageRows.filter((r) => !r.hidden || r === row).indexOf(row);
    }

    /** Note the row the focus went into, when it is one of the table's rows and has a key. @param {FocusEvent} event */
    onFocusIn(event) {
        const { columns } = this.t;
        const element = event.target instanceof HTMLElement ? event.target : null;
        const { row, detail } = this.ownerOf(element);
        const key = row !== null ? columns.keyOf(row) : '';
        const cell = element?.closest('td, th');
        this.memo =
            element !== null && row !== null && key !== ''
                ? { row, element, key, twin: this.twins(key).indexOf(row), detail, at: this.slotOf(row), cell: !detail && cell instanceof HTMLTableCellElement ? cell.cellIndex : 0 }
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
     * @returns {{ element: HTMLElement } | { neighbour: { at: number, cell: number, key: string } } | null}
     */
    restore() {
        const memo = this.memo;
        if (memo === null || !this.wanted() || memo.row.isConnected) return null;
        const active = document.activeElement;
        // Something else took the focus in the meantime: that is where the reader is now.
        if (active !== null && active !== document.body && active !== memo.element) return this.forget();
        const { model, wrap } = this.t;
        // A page that sorted or filtered since the focus went in moved the row's slot: read it again from the page's rows.
        const at = model.pageRows.includes(memo.row) ? this.slotOf(memo.row) : memo.at;
        const twins = this.twins(memo.key);
        const fresh = twins[Math.min(memo.twin, twins.length - 1)];
        // A focus in a detail row cannot be kept (the refresh draws the details again): it goes to the fresh owner row.
        if (fresh === undefined || memo.detail) {
            this.memo = null;
            return { neighbour: { at, cell: memo.cell, key: fresh === undefined ? '' : memo.key } };
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
     * @param {{ at: number, cell: number, key: string }} slot `key` is set when the row is still in the data and only its detail went
     */
    focusNeighbour(slot) {
        const { model, columns } = this.t;
        const rows = model.pageRows.filter((row) => !row.hidden);
        if (rows.length === 0 || slot.at < 0) return;
        const row = (slot.key !== '' ? rows.find((r) => columns.keyOf(r) === slot.key) : undefined) ?? rows[Math.min(slot.at, rows.length - 1)];
        const cell = row.cells[slot.cell] ?? null;
        const target = /** @type {HTMLElement | null} */ (cell?.querySelector(FOCUSABLE) ?? row.querySelector(FOCUSABLE));
        target?.focus({ preventScroll: true });
    }
}
