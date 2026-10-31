// A layout as data: read off the tiles, and put back on them.

import { place } from './place.js';
import { COLUMNS, TILE } from './values.js';

/** @typedef {import('../gridlayout.js').Tile} Tile */

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
