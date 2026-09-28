// Movable grid layout, framework-free [TH56].
//
// The dashboard a reader arranges themselves: tiles that move and resize
// on a coarse grid, and a layout that can be handed back to the consumer
// to store. It is the most impressive thing in this round to look at and
// the one where "impressive" and "usable" pull hardest against each other.
//
// So: **every gesture has a keyboard equivalent, and the keyboard one is
// the one that is tested.** Arrows move a tile, Shift+arrows resize it,
// and the tile says where it is and how big it is in words. A drag-only
// dashboard is a dashboard some people simply cannot arrange.
//
//   <div class="kp-grid" data-kp-grid data-kp-columns="6">
//     <div class="kp-grid__tile" data-kp-tile="cpu" data-x="0" data-y="0"
//          data-w="2" data-h="1" tabindex="0" role="group"
//          aria-label="CPU">…</div>
//   </div>
//
// The position lives in data attributes rather than in inline styles,
// because the consumer stores the numbers and the stylesheet turns them
// into a grid area. Reading a layout back out of a style string is how a
// dashboard loses someone's arrangement.
//
// Since 4.0.0 [AR31]: the placement is written as custom properties
// (--kp-tile-x/y/w/h) rather than as inline `grid-column` and `grid-row`.
// An inline style beats any rule in any layer, so the narrow rule in
// css/components.css could never win once a grid was attached.
//
// Since 3.0.0 [KT6]: applyLayout() is the other half of layoutOf() —
// the first version could store a layout and not restore one; a pointer
// drag exists beside the keyboard, with the keyboard still the tested
// route; the tile's own aria-label is kept and the geometry goes into a
// description; the step, the row bound and the commit debounce are
// knobs; and detach removes the placement properties it wrote.

import { getStrings } from './strings.js';
const GRID = '[data-kp-grid]';
const TILE = '[data-kp-tile]';

/** @typedef {{ id: string, x: number, y: number, w: number, h: number }} Tile */

/** Fired on every move or resize. A contract value [TH26]: the detail is the whole layout. */
export const LAYOUT_EVENT = 'kp-grid-layout';
/** Fired once a burst of changes settles (the debounce is `data-kp-commit-ms`). Same detail. */
export const LAYOUT_COMMIT_EVENT = 'kp-grid-commit';

/** Columns when the grid does not say. An operational knob. */
export const COLUMNS = 6;
/** How long after the last change the commit event fires. */
export const COMMIT_MS = 400;

/**
 * @param {HTMLElement} grid
 * @returns {Tile[]}
 */
export function layoutOf(grid) {
    return [...grid.querySelectorAll(TILE)].map((element) => {
        const tile = /** @type {HTMLElement} */ (element);
        return {
            id: tile.dataset.kpTile ?? '',
            x: Number(tile.dataset.x ?? 0),
            y: Number(tile.dataset.y ?? 0),
            w: Number(tile.dataset.w ?? 1),
            h: Number(tile.dataset.h ?? 1),
        };
    });
}

/**
 * Put a stored layout back on the tiles. Tiles the layout does not name
 * keep their place; ids the grid does not have are ignored.
 *
 * @param {HTMLElement} grid
 * @param {readonly Tile[]} layout
 */
export function applyLayout(grid, layout) {
    const columns = Number.parseInt(grid.dataset.kpColumns ?? '', 10) || COLUMNS;
    for (const entry of layout) {
        const tile = /** @type {HTMLElement | null} */ (grid.querySelector(`[data-kp-tile="${CSS.escape(entry.id)}"]`));
        if (tile === null) continue;
        const w = Math.max(1, Math.min(entry.w, columns));
        tile.dataset.w = String(w);
        tile.dataset.h = String(Math.max(1, entry.h));
        tile.dataset.x = String(Math.max(0, Math.min(entry.x, columns - w)));
        tile.dataset.y = String(Math.max(0, entry.y));
        place(tile);
    }
}

/** Write the placement the data attributes describe. @param {HTMLElement} tile */
function place(tile) {
    const x = Number(tile.dataset.x ?? 0);
    const y = Number(tile.dataset.y ?? 0);
    const w = Number(tile.dataset.w ?? 1);
    const h = Number(tile.dataset.h ?? 1);
    // Four numbers, not two track declarations [AR31]. Up to 4.0.0 this
    // wrote `grid-column` and `grid-row` as inline styles, which beat any
    // rule in any layer — so the collapse-to-one-column rule in
    // css/components.css was dead the moment a grid was attached, and
    // attaching is the only way a grid is used. A custom property is a
    // value the stylesheet reads, so the narrow rule can win again.
    tile.style.setProperty('--kp-tile-x', String(x + 1));
    tile.style.setProperty('--kp-tile-y', String(y + 1));
    tile.style.setProperty('--kp-tile-w', String(w));
    tile.style.setProperty('--kp-tile-h', String(h));
    // Said in words, because a tile that only announces itself by moving
    // is a tile nobody without sight can arrange. As a description, not
    // the label: the label is the tile's name and stays the consumer's.
    const s = getStrings();
    const name = tile.dataset.kpLabel ?? tile.getAttribute('aria-label') ?? tile.dataset.kpTile ?? s.tileFallbackName;
    let description = /** @type {HTMLElement | null} */ (tile.querySelector('[data-kp-tile-position]'));
    if (description === null) {
        description = document.createElement('span');
        description.className = 'kp-sr-only';
        description.dataset.kpTilePosition = '';
        description.id = `${tile.dataset.kpTile ?? 'tile'}-position-${Math.random().toString(36).slice(2, 6)}`;
        tile.append(description);
        tile.setAttribute('aria-describedby', [tile.getAttribute('aria-describedby'), description.id].filter(Boolean).join(' '));
    }
    description.textContent = s.tileLabel(name, x + 1, y + 1, w, h);
    if (!tile.hasAttribute('aria-label') && tile.dataset.kpLabel !== undefined) tile.setAttribute('aria-label', tile.dataset.kpLabel);
}

/**
 * @typedef {object} GridHandle
 * @property {HTMLElement} element
 * @property {() => Tile[]} layout
 * @property {(layout: readonly Tile[]) => void} apply
 * @property {() => void} refresh place tiles added after attach
 */

/** @type {WeakMap<Element, GridHandle>} */
const handles = new WeakMap();

/** The handle for an attached grid. @param {Element} element */
export function grid(element) {
    return handles.get(element) ?? null;
}

/**
 * @param {ParentNode} root
 * @param {{ step?: number, rows?: number, commitMs?: number, pointer?: boolean }} [options]
 *   Defaults; each also per grid: `data-kp-step`, `data-kp-rows`, `data-kp-commit-ms`, `data-kp-pointer="false"`.
 * @returns {(() => void) & { handles: GridHandle[] }} detach
 */
export function attachGrids(root = document, { step = 1, rows = Infinity, commitMs = COMMIT_MS, pointer = true } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {GridHandle[]} */
    const created = [];

    for (const element of root.querySelectorAll(GRID)) {
        const grid = /** @type {HTMLElement} */ (element);
        if (grid.dataset.kpGridAttached !== undefined) continue;
        grid.dataset.kpGridAttached = '';
        const columns = Number.parseInt(grid.dataset.kpColumns ?? '', 10) || COLUMNS;
        const stride = Number.parseInt(grid.dataset.kpStep ?? '', 10) || step;
        const maxRows = Number.parseInt(grid.dataset.kpRows ?? '', 10) || rows;
        const settle = Number.parseInt(grid.dataset.kpCommitMs ?? '', 10) || commitMs;
        const drag = grid.dataset.kpPointer === undefined ? pointer : grid.dataset.kpPointer !== 'false';
        const hadColumns = grid.style.getPropertyValue('--kp-grid-columns');
        grid.style.setProperty('--kp-grid-columns', String(columns));

        let timer = 0;
        const announce = () => {
            const detail = { layout: layoutOf(grid) };
            grid.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { bubbles: true, detail }));
            clearTimeout(timer);
            timer = window.setTimeout(
                () => grid.dispatchEvent(new CustomEvent(LAYOUT_COMMIT_EVENT, { bubbles: true, detail: { layout: layoutOf(grid) } })),
                settle,
            );
        };

        /** @param {HTMLElement} tile @param {number} nx @param {number} ny @param {number} nw @param {number} nh */
        const set = (tile, nx, ny, nw, nh) => {
            // Clamped to the grid rather than allowed off the edge: a tile
            // in column nine of a six-column grid is a tile nobody can see
            // and nobody can get back.
            const width = Math.max(1, Math.min(nw, columns));
            const height = Math.max(1, Math.min(nh, maxRows));
            tile.dataset.w = String(width);
            tile.dataset.h = String(height);
            tile.dataset.x = String(Math.max(0, Math.min(nx, columns - width)));
            tile.dataset.y = String(Math.max(0, Math.min(ny, maxRows - height)));
            place(tile);
            announce();
        };

        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const tile = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest(TILE));
            if (tile === null) return;
            const x = Number(tile.dataset.x ?? 0);
            const y = Number(tile.dataset.y ?? 0);
            const w = Number(tile.dataset.w ?? 1);
            const h = Number(tile.dataset.h ?? 1);
            const d = stride;
            /** @type {Record<string, [number, number, number, number]>} */
            const moves = event.shiftKey
                ? { ArrowRight: [x, y, w + d, h], ArrowLeft: [x, y, w - d, h], ArrowDown: [x, y, w, h + d], ArrowUp: [x, y, w, h - d] }
                : { ArrowRight: [x + d, y, w, h], ArrowLeft: [x - d, y, w, h], ArrowDown: [x, y + d, w, h], ArrowUp: [x, y - d, w, h] };
            const to = moves[event.key];
            if (to === undefined) return;
            event.preventDefault();
            set(tile, ...to);
        };

        // The pointer route, beside the keyboard [KT6]. A drag moves the
        // tile by whole cells, measured from the grid's own column width,
        // so a drop lands where the tile will actually be.
        /** @param {PointerEvent} event */
        const onPointerDown = (event) => {
            if (!drag || event.button !== 0) return;
            const tile = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest(TILE));
            if (tile === null || /** @type {HTMLElement} */ (event.target).closest('button, a, input, select, textarea')) return;
            const box = grid.getBoundingClientRect();
            const cell = box.width / columns;
            const rowHeight = Number.parseFloat(getComputedStyle(grid).gridAutoRows) || cell;
            const startX = Number(tile.dataset.x ?? 0);
            const startY = Number(tile.dataset.y ?? 0);
            const w = Number(tile.dataset.w ?? 1);
            const h = Number(tile.dataset.h ?? 1);
            const origin = { x: event.clientX, y: event.clientY };
            tile.dataset.kpDragging = '';
            tile.setPointerCapture(event.pointerId);
            /** @param {PointerEvent} move */
            const onMove = (move) => {
                const dx = Math.round((move.clientX - origin.x) / cell);
                const dy = Math.round((move.clientY - origin.y) / rowHeight);
                if (Number(tile.dataset.x) !== startX + dx || Number(tile.dataset.y) !== startY + dy) set(tile, startX + dx, startY + dy, w, h);
            };
            const onUp = () => {
                delete tile.dataset.kpDragging;
                tile.removeEventListener('pointermove', onMove);
                tile.removeEventListener('pointerup', onUp);
                tile.removeEventListener('pointercancel', onUp);
            };
            tile.addEventListener('pointermove', onMove);
            tile.addEventListener('pointerup', onUp);
            tile.addEventListener('pointercancel', onUp);
        };

        const placeAll = () => {
            for (const tile of grid.querySelectorAll(TILE)) place(/** @type {HTMLElement} */ (tile));
        };
        placeAll();
        grid.addEventListener('keydown', onKey);
        grid.addEventListener('pointerdown', onPointerDown);

        /** @type {GridHandle} */
        const handle = {
            element: grid,
            layout: () => layoutOf(grid),
            apply: (layout) => {
                applyLayout(grid, layout);
                announce();
            },
            refresh: placeAll,
        };
        handles.set(grid, handle);
        created.push(handle);

        cleanups.push(() => {
            clearTimeout(timer);
            grid.removeEventListener('keydown', onKey);
            grid.removeEventListener('pointerdown', onPointerDown);
            for (const element of grid.querySelectorAll(TILE)) {
                const tile = /** @type {HTMLElement} */ (element);
                for (const property of ['--kp-tile-x', '--kp-tile-y', '--kp-tile-w', '--kp-tile-h']) tile.style.removeProperty(property);
                const description = tile.querySelector('[data-kp-tile-position]');
                if (description !== null) {
                    const rest = (tile.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '' && id !== description.id);
                    if (rest.length > 0) tile.setAttribute('aria-describedby', rest.join(' '));
                    else tile.removeAttribute('aria-describedby');
                    description.remove();
                }
            }
            if (hadColumns === '') grid.style.removeProperty('--kp-grid-columns');
            else grid.style.setProperty('--kp-grid-columns', hadColumns);
            handles.delete(grid);
            delete grid.dataset.kpGridAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
