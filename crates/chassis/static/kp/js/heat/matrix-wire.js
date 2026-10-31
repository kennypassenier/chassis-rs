// Wires the matrices of a page: one controller per matrix for its pointer, keys and focus.
import { Controller, attachAll } from '../controller.js';
import { attachHoverCards } from '../hovercard.js';
import { MATRIX, MATRIX_CELL, MATRIX_LIGHT_EVENT, MATRIX_PICK_EVENT } from './constants.js';
import { cellGrid, placeStop } from './draw.js';
import { LIT, STOPS } from './grid-state.js';
import { markHot, setMatrixLit, setMatrixPick } from './matrix.js';
import { cellOf, followFocus } from './wire.js';

/** The row and column step of each arrow key. @type {Record<string, [number, number]>} */
const STEPS = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };

/** The indexes of the entries that are there. @param {unknown[]} list */
const present = (list) => list.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);

/** One matrix; its tab stop and lit headers stay in the STOPS and LIT registries the setters share. */
export class MatrixGrid extends Controller {
    connect() {
        const el = this.host;
        this.listen(el, 'click', (event) => this.onClick(event));
        this.listen(el, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(el, 'focusin', (event) => followFocus(el, /** @type {FocusEvent} */ (event), MATRIX_CELL));
        if (el.querySelector(MATRIX_CELL)) {
            const lit = /** @type {NodeListOf<HTMLElement>} */ (
                el.querySelectorAll('button.kp-matrix__col[aria-pressed="true"], button.kp-matrix__row[aria-pressed="true"]')
            );
            LIT.set(el, new Set([...lit].map((b) => b.dataset.key ?? '')));
            markHot(el);
            if (!el.querySelector(`${MATRIX_CELL}[tabindex="0"]`)) placeStop(el, MATRIX_CELL, undefined);
        }
    }

    /** Pin a cell: it is the pick and the tab stop, and the page hears of it. @param {HTMLElement} cell @param {string} source */
    pin(cell, source) {
        const el = this.host;
        const was = cell.getAttribute('aria-pressed') === 'true';
        if (!el.hasAttribute('data-kp-matrix-owned')) setMatrixPick(el, { row: cell.dataset.rowKey ?? '', column: cell.dataset.colKey ?? '' });
        STOPS.set(el, { r: Number(cell.dataset.r), c: Number(cell.dataset.c) });
        const detail = { rowKey: cell.dataset.rowKey, colKey: cell.dataset.colKey, cell, source, again: was };
        el.dispatchEvent(new CustomEvent(MATRIX_PICK_EVENT, { bubbles: true, detail }));
    }

    /** A header lights its row or column; a cell is pinned. @param {Event} event */
    onClick(event) {
        const el = this.host;
        const target = /** @type {Element} */ (event.target);
        const head = /** @type {HTMLElement | null} */ (target.closest('button.kp-matrix__col, button.kp-matrix__row'));
        if (head && el.contains(head)) {
            const key = head.dataset.key ?? '';
            if (!el.hasAttribute('data-kp-matrix-owned')) {
                const lit = new Set(LIT.get(el) ?? []);
                if (lit.has(key)) lit.delete(key);
                else lit.add(key);
                setMatrixLit(el, [...lit]);
            }
            el.dispatchEvent(new CustomEvent(MATRIX_LIGHT_EVENT, { bubbles: true, detail: { keys: [...(LIT.get(el) ?? [])], key } }));
            return;
        }
        const cell = /** @type {HTMLElement | null} */ (target.closest(MATRIX_CELL));
        if (cell && el.contains(cell) && !cell.hasAttribute('aria-disabled')) this.pin(cell, 'pointer');
    }

    /** Escape puts every light out; arrows, Home and End move the stop, and pin it when the matrix follows. @param {KeyboardEvent} event */
    onKey(event) {
        const el = this.host;
        const cell = cellOf(el, event, MATRIX_CELL);
        const lit = (LIT.get(el)?.size ?? 0) > 0;
        if (!cell) {
            if (event.key === 'Escape' && lit && !el.hasAttribute('data-kp-matrix-owned')) {
                setMatrixLit(el, []);
                el.dispatchEvent(new CustomEvent(MATRIX_LIGHT_EVENT, { bubbles: true, detail: { keys: [], key: null } }));
            }
            return;
        }
        if (event.key === 'Escape' && lit) {
            event.preventDefault();
            if (!el.hasAttribute('data-kp-matrix-owned')) setMatrixLit(el, []);
            el.dispatchEvent(new CustomEvent(MATRIX_LIGHT_EVENT, { bubbles: true, detail: { keys: [], key: null } }));
            return;
        }
        const grid = cellGrid(el, MATRIX_CELL);
        const at = this.moveFrom(grid, cell, event);
        if (!at) return;
        event.preventDefault();
        const to = grid[at.r]?.[at.c];
        if (!to) return;
        placeStop(el, MATRIX_CELL, at);
        to.focus();
        if (el.getAttribute('data-kp-matrix-select') === 'follow') this.pin(to, 'keyboard');
    }

    /**
     * Where a key moves the stop from `cell`: arrows wrap round and skip the cells that cannot be pressed; Home and End go to
     * the first or last cell of the row (of the matrix with Ctrl). Null for another key.
     * @param {HTMLElement[][]} grid @param {HTMLElement} cell @param {KeyboardEvent} event
     * @returns {{ r: number, c: number } | null}
     */
    moveFrom(grid, cell, event) {
        const el = this.host;
        const step = STEPS[event.key];
        const rowsN = Math.max(grid.length, el.querySelectorAll('.kp-matrix__grid > .kp-matrix__line').length - 1);
        const colsN = Number(/** @type {HTMLElement} */ (el.querySelector('.kp-matrix__grid')).style.getPropertyValue('--kp-matrix-cols')) || 1;
        let r = Number(cell.dataset.r);
        let c = Number(cell.dataset.c);
        if (step) {
            for (let i = 0; i < rowsN * colsN; i++) {
                r = (r + step[0] + rowsN) % rowsN;
                c = (c + step[1] + colsN) % colsN;
                if (grid[r]?.[c]) break;
            }
            return { r, c };
        }
        if (event.key !== 'Home' && event.key !== 'End') return null;
        const first = event.key === 'Home';
        const pickOf = (/** @type {number[]} */ list) => (first ? list[0] : list[list.length - 1]);
        c = pickOf(present(grid[r] ?? []));
        if (event.ctrlKey) {
            r = pickOf(present(grid));
            c = pickOf(present(grid[r] ?? []));
        }
        return { r, c };
    }
}

/**
 * Wire every matrix under `root`: pin, light the headers, keys.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachMatrices(root = document) {
    const doc = root instanceof Document ? root : /** @type {Element} */ (root).ownerDocument;
    attachHoverCards(doc);
    return attachAll(root, MATRIX, MatrixGrid);
}
