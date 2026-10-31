// The keyboard grid over a table (GridControl) and the scrolled mark of a table's box (ScrollMark), one controller per element.
import { Controller } from '../controller.js';
import { shown } from './filter.js';
import { DETAIL, EDITOR_WRAP, GROUP_ROW, SKELETON_ROW } from './selectors.js';
/** @typedef {{ row: number, rows: number, column: number, cell: HTMLTableCellElement }} GridPosition */
/** @typedef {{ pageRows: number, onMove?: (position: GridPosition) => void }} GridSettings */

/** What a cell may hold that takes the focus. */
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]';
/** The controls the grid takes out of the tab order, so Tab leaves the grid. */
const CONTROLS = 'button, a[href], input, select, textarea';

/** A roving focus grid over one table [Kenny, 2026-09-13, #keyboard; APG grid]: see attachGrid() in grid.js. */
export class GridControl extends Controller {
    /** @param {HTMLElement} host the table @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        const { pageRows, onMove } = /** @type {GridSettings} */ (/** @type {unknown} */ (options));
        this.table = /** @type {HTMLTableElement} */ (host);
        this.pageRows = pageRows;
        this.onMove = onMove;
        /** The table's own role, given back on detach. */
        this.roleWas = host.getAttribute('role');
        /** The cell that holds the tab stop. */
        this.at = { row: -1, column: 0 };
        /** Elements given a tabindex here, with the value they had. @type {Map<HTMLElement, string | null>} */
        this.touched = new Map();
    }

    connect() {
        const { table } = this;
        table.setAttribute('role', 'grid');
        // Registered first, so it runs after the listeners are gone.
        this.own(() => {
            for (const [element, was] of this.touched) {
                if (was === null) element.removeAttribute('tabindex');
                else element.setAttribute('tabindex', was);
            }
            if (this.roleWas === null) table.removeAttribute('role');
            else table.setAttribute('role', this.roleWas);
        });
        this.listen(table, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(table, 'focusin', (event) => this.onFocusIn(/** @type {FocusEvent} */ (event)));
        this.sync();
    }

    /** The rows a reader can move through. */
    rows() {
        return [...this.table.rows].filter((row) => shown(row) && !row.matches(SKELETON_ROW) && row.cells.length > 0);
    }

    /** @param {HTMLTableRowElement} row */
    cellsOf(row) {
        return [...row.cells].filter(shown);
    }

    /** The one control a cell hands its focus to, or the cell. @param {HTMLTableCellElement} cell */
    targetOf(cell) {
        const controls = [...cell.querySelectorAll(FOCUSABLE)].filter((control) => control.closest(EDITOR_WRAP) === null && shown(control));
        return /** @type {HTMLElement} */ (controls.length === 1 ? controls[0] : cell);
    }

    /** @param {HTMLElement} element @param {number} value */
    setTab(element, value) {
        if (!this.touched.has(element)) this.touched.set(element, element.getAttribute('tabindex'));
        if (element.tabIndex !== value || !element.hasAttribute('tabindex')) element.tabIndex = value;
    }

    /** The rows, and the row and column of the tab stop kept inside them. @returns {[HTMLTableRowElement[], number, number]} */
    clamp() {
        const list = this.rows();
        const header = list.findIndex((row) => row.parentElement?.tagName !== 'THEAD');
        const row = this.at.row < 0 ? Math.max(header, 0) : Math.max(0, Math.min(list.length - 1, this.at.row));
        const cells = list[row] === undefined ? [] : this.cellsOf(list[row]);
        return [list, row, Math.max(0, Math.min(cells.length - 1, this.at.column))];
    }

    /** Re-read the rows and cells after they changed; keeps one cell in the tab order. */
    sync() {
        const [list, row, column] = this.clamp();
        for (const tr of this.table.rows) {
            for (const cell of tr.cells) {
                this.setTab(cell, -1);
                for (const control of cell.querySelectorAll(CONTROLS)) {
                    if (control.closest(EDITOR_WRAP) === null) this.setTab(/** @type {HTMLElement} */ (control), -1);
                }
            }
        }
        const current = list[row] === undefined ? undefined : this.cellsOf(list[row])[column];
        if (current !== undefined) this.setTab(this.targetOf(current), 0);
    }

    /** Move the tab stop to a cell, and the focus with it unless `take` is false. @param {number} row @param {number} column @param {boolean} [take] */
    move(row, column, take = true) {
        const list = this.rows();
        if (list.length === 0) return;
        const r = Math.max(0, Math.min(list.length - 1, row));
        const cells = this.cellsOf(/** @type {HTMLTableRowElement} */ (list[r]));
        const c = Math.max(0, Math.min(cells.length - 1, column));
        this.at = { row: r, column: c };
        this.sync();
        const cell = cells[c];
        if (cell === undefined) return;
        if (take) this.targetOf(cell).focus();
        this.onMove?.({ ...this.bodyPosition(list, r), column: c, cell });
    }

    /**
     * Where row `r` stands among the body's rows of data: a detail row and a group's heading row are not rows of data.
     * @param {HTMLTableRowElement[]} list @param {number} r
     */
    bodyPosition(list, r) {
        const header = list.filter((tr) => tr.parentElement?.tagName === 'THEAD').length;
        const data = (/** @type {HTMLTableRowElement} */ tr) => !tr.matches(DETAIL) && !tr.matches(GROUP_ROW);
        const rows = list.filter((tr) => tr.parentElement?.tagName !== 'THEAD' && data(tr)).length;
        const row = r < header ? 0 : list.slice(header, r + 1).filter(data).length;
        return { row, rows };
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        if (target.closest(EDITOR_WRAP) !== null || event.altKey || event.metaKey) return;
        const [, row, column] = this.clamp();
        const ctrl = event.ctrlKey;
        const last = Number.MAX_SAFE_INTEGER;
        /** @type {Record<string, [number, number]>} */
        const moves = {
            ArrowUp: [row - 1, column],
            ArrowDown: [row + 1, column],
            ArrowLeft: [row, column - 1],
            ArrowRight: [row, column + 1],
            Home: ctrl ? [0, 0] : [row, 0],
            End: ctrl ? [this.rows().length - 1, last] : [row, last],
            PageUp: [row - this.pageRows, column],
            PageDown: [row + this.pageRows, column],
        };
        const next = moves[event.key];
        if (next === undefined) return;
        // A text field keeps its own left, right, Home and End.
        if (target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select') && !event.key.startsWith('Page')) return;
        event.preventDefault();
        this.move(next[0], next[1]);
    }

    /** @param {FocusEvent} event */
    onFocusIn(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        if (target.closest(EDITOR_WRAP) !== null) return;
        const cell = /** @type {HTMLTableCellElement | null} */ (target.closest('td, th'));
        const tr = /** @type {HTMLTableRowElement | null} */ (cell?.parentElement ?? null);
        if (cell === null || tr === null || cell.closest('table') !== this.table) return;
        const r = this.rows().indexOf(tr);
        const c = this.cellsOf(tr).indexOf(cell);
        if (r === -1 || c === -1) return;
        this.move(r, c, false);
    }
}

/** `data-kp-scrolled` on a data table while its scroll box is scrolled away from the top [scope-90]: see watchScrolled() in grid.js. */
export class ScrollMark extends Controller {
    /** @param {HTMLElement} host the `.kp-datatable` @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The box that scrolls. */
        this.box = /** @type {{ box: HTMLElement }} */ (/** @type {unknown} */ (options)).box;
        this.view = this.box.ownerDocument.defaultView;
        /** The frame a scroll queued the decision for. */
        this.frame = 0;
    }

    connect() {
        // Registered first, so it runs after the listener is gone.
        this.own(() => {
            if (this.frame !== 0) this.view?.cancelAnimationFrame(this.frame);
            this.host.removeAttribute('data-kp-scrolled');
        });
        this.decide();
        this.listen(this.box, 'scroll', () => this.onScroll(), { passive: true });
    }

    decide() {
        this.frame = 0;
        this.host.toggleAttribute('data-kp-scrolled', this.box.scrollTop > 0);
    }

    /** One decision per frame. */
    onScroll() {
        if (this.frame === 0 && this.view !== null) this.frame = this.view.requestAnimationFrame(() => this.decide());
    }
}
