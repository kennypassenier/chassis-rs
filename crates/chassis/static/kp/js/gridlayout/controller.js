// One movable grid: its keyboard and pointer routes, the layout events with their debounce, and the way the placement is taken back.

import { Controller } from '../controller.js';
import { applyLayout, layoutOf } from './layout.js';
import { place, unplace } from './place.js';
import { COLUMNS, COMMIT_MS, DEFAULT_STEP, LAYOUT_COMMIT_EVENT, LAYOUT_EVENT, TILE } from './values.js';

/**
 * @typedef {object} GridOptions
 * @property {number} [step]
 * @property {number} [rows]
 * @property {number} [commitMs]
 * @property {boolean} [pointer]
 */

export class MovableGrid extends Controller {
    /**
     * @param {HTMLElement} host the grid
     * @param {GridOptions} [options] page defaults; each also per grid as `data-kp-step`, `data-kp-rows`, `data-kp-commit-ms`, `data-kp-pointer="false"`
     */
    constructor(host, options = {}) {
        super(host, options);
        const { step = DEFAULT_STEP, rows = Infinity, commitMs = COMMIT_MS, pointer = true } = options;
        this.columns = Number.parseInt(host.dataset.kpColumns ?? '', 10) || COLUMNS;
        this.stride = Number.parseInt(host.dataset.kpStep ?? '', 10) || step;
        this.maxRows = Number.parseInt(host.dataset.kpRows ?? '', 10) || rows;
        this.settle = Number.parseInt(host.dataset.kpCommitMs ?? '', 10) || commitMs;
        this.drag = host.dataset.kpPointer === undefined ? pointer : host.dataset.kpPointer !== 'false';
        /** The commit timer, and the pointer drag under way, if any. */
        this.timer = 0;
        /** @type {(() => void) | null} */
        this.endDrag = null;
        /** What the page gets back, the same object every time. @type {import('../gridlayout.js').GridHandle} */
        this.handle = {
            element: host,
            layout: () => layoutOf(host),
            apply: (layout) => {
                applyLayout(host, layout);
                this.announce();
            },
            refresh: () => this.placeAll(),
        };
    }

    connect() {
        const grid = this.host;
        const hadColumns = grid.style.getPropertyValue('--kp-grid-columns');
        grid.dataset.kpGridAttached = '';
        grid.style.setProperty('--kp-grid-columns', String(this.columns));
        // Registered first, so they run last on detach: the columns and the mark go after the tiles are given back.
        this.own(() => {
            if (hadColumns === '') grid.style.removeProperty('--kp-grid-columns');
            else grid.style.setProperty('--kp-grid-columns', hadColumns);
            delete grid.dataset.kpGridAttached;
        });
        this.own(() => {
            for (const tile of grid.querySelectorAll(TILE)) unplace(/** @type {HTMLElement} */ (tile));
        });
        this.placeAll();
        this.listen(grid, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(grid, 'pointerdown', (event) => this.onPointerDown(/** @type {PointerEvent} */ (event)));
        this.own(() => this.endDrag?.());
        this.own(() => clearTimeout(this.timer));
    }

    placeAll() {
        for (const tile of this.host.querySelectorAll(TILE)) place(/** @type {HTMLElement} */ (tile));
    }

    /** Every move or resize is told at once, and once more when the burst settles. */
    announce() {
        const grid = this.host;
        grid.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { bubbles: true, detail: { layout: layoutOf(grid) } }));
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => grid.dispatchEvent(new CustomEvent(LAYOUT_COMMIT_EVENT, { bubbles: true, detail: { layout: layoutOf(grid) } })), this.settle);
    }

    /** @param {HTMLElement} tile @param {number} nx @param {number} ny @param {number} nw @param {number} nh */
    set(tile, nx, ny, nw, nh) {
        const { columns, maxRows } = this;
        // Clamped to the grid rather than allowed off the edge: a tile in column nine of a six-column grid is a tile nobody can see
        // and nobody can get back.
        const width = Math.max(1, Math.min(nw, columns));
        const height = Math.max(1, Math.min(nh, maxRows));
        tile.dataset.w = String(width);
        tile.dataset.h = String(height);
        tile.dataset.x = String(Math.max(0, Math.min(nx, columns - width)));
        tile.dataset.y = String(Math.max(0, Math.min(ny, maxRows - height)));
        place(tile);
        this.announce();
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const tile = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest(TILE));
        if (tile === null) return;
        const x = Number(tile.dataset.x ?? 0);
        const y = Number(tile.dataset.y ?? 0);
        const w = Number(tile.dataset.w ?? 1);
        const h = Number(tile.dataset.h ?? 1);
        const d = this.stride;
        /** @type {Record<string, [number, number, number, number]>} */
        const moves = event.shiftKey
            ? { ArrowRight: [x, y, w + d, h], ArrowLeft: [x, y, w - d, h], ArrowDown: [x, y, w, h + d], ArrowUp: [x, y, w, h - d] }
            : { ArrowRight: [x + d, y, w, h], ArrowLeft: [x - d, y, w, h], ArrowDown: [x, y + d, w, h], ArrowUp: [x, y - d, w, h] };
        const to = moves[event.key];
        if (to === undefined) return;
        event.preventDefault();
        this.set(tile, ...to);
    }

    /**
     * The pointer route, beside the keyboard [KT6]. A drag moves the tile by whole cells, measured from the grid's own column width,
     * so a drop lands where the tile will actually be.
     * @param {PointerEvent} event
     */
    onPointerDown(event) {
        if (!this.drag || event.button !== 0) return;
        const tile = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest(TILE));
        if (tile === null || /** @type {HTMLElement} */ (event.target).closest('button, a, input, select, textarea')) return;
        const cell = this.host.getBoundingClientRect().width / this.columns;
        const rowHeight = Number.parseFloat(getComputedStyle(this.host).gridAutoRows) || cell;
        const start = { x: Number(tile.dataset.x ?? 0), y: Number(tile.dataset.y ?? 0), w: Number(tile.dataset.w ?? 1), h: Number(tile.dataset.h ?? 1) };
        const origin = { x: event.clientX, y: event.clientY };
        tile.dataset.kpDragging = '';
        tile.setPointerCapture(event.pointerId);
        /** @param {PointerEvent} move */
        const onMove = (move) => {
            const dx = Math.round((move.clientX - origin.x) / cell);
            const dy = Math.round((move.clientY - origin.y) / rowHeight);
            if (Number(tile.dataset.x) !== start.x + dx || Number(tile.dataset.y) !== start.y + dy) this.set(tile, start.x + dx, start.y + dy, start.w, start.h);
        };
        const onUp = () => {
            delete tile.dataset.kpDragging;
            tile.removeEventListener('pointermove', onMove);
            tile.removeEventListener('pointerup', onUp);
            tile.removeEventListener('pointercancel', onUp);
            this.endDrag = null;
        };
        tile.addEventListener('pointermove', onMove);
        tile.addEventListener('pointerup', onUp);
        tile.addEventListener('pointercancel', onUp);
        this.endDrag = onUp;
    }
}
