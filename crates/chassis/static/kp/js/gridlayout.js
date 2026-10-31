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

import { attachOne, controllerOf } from './controller.js';
import { MovableGrid } from './gridlayout/controller.js';
import { GRID } from './gridlayout/values.js';

export { COLUMNS, COMMIT_MS, LAYOUT_EVENT, LAYOUT_COMMIT_EVENT } from './gridlayout/values.js';
export { layoutOf, applyLayout } from './gridlayout/layout.js';

/** @typedef {{ id: string, x: number, y: number, w: number, h: number }} Tile */

/**
 * @typedef {object} GridHandle
 * @property {HTMLElement} element
 * @property {() => Tile[]} layout
 * @property {(layout: readonly Tile[]) => void} apply
 * @property {() => void} refresh place tiles added after attach
 */

/** The handle for an attached grid. @param {Element} element @returns {GridHandle | null} */
export function grid(element) {
    return controllerOf(element, MovableGrid)?.handle ?? null;
}

/**
 * @param {ParentNode} root
 * @param {{ step?: number, rows?: number, commitMs?: number, pointer?: boolean }} [options]
 *   Defaults; each also per grid: `data-kp-step`, `data-kp-rows`, `data-kp-commit-ms`, `data-kp-pointer="false"`.
 * @returns {(() => void) & { handles: GridHandle[] }} detach
 */
export function attachGrids(root = document, options = {}) {
    // Below the root only, and only a grid that is not yet marked as wired.
    const made = [...root.querySelectorAll(GRID)]
        .filter((node) => !node.hasAttribute('data-kp-grid-attached'))
        .map((node) => attachOne(/** @type {HTMLElement} */ (node), MovableGrid, options))
        .filter((controller) => controller !== undefined);
    const detach = () => {
        for (const controller of made) controller.destroy();
    };
    return Object.assign(detach, { handles: made.map((controller) => controller.handle) });
}
