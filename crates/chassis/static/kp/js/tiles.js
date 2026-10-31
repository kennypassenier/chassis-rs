// Tiles of one height across a board [scope-143; port spec H].
//
// `.kp-tiles` makes every tile of ONE grid as tall as its tallest, in CSS
// alone. A board of several grids (groups of tiles, each under its own
// heading, a fold, a column) needs the tiles of all of them to share one
// height, or the groups drift apart as soon as one tile wraps a line. Mark
// the board, and the grids under it are one set:
//
//   <div class="board" data-kp-tiles-set="apps">
//       <details open><summary>Media</summary><ul class="kp-tiles">…</ul></details>
//       <ul class="kp-tiles">…</ul>
//   </div>
//
// A `.kp-tiles` inside an element with `data-kp-tiles-set`, or carrying it
// itself, belongs to that set; two branches of the page that carry the same
// non-empty name are one set. attachTileSets(root) measures the natural
// height of every visible tile in a set (not in a closed `<details>`, not
// hidden), the tallest wins, and every grid in the set gets it as
// `--kp-tile-row-min`, the floor of its rows. It runs in one animation frame
// after a tile's size or content changes, a grid's width changes, a fold
// opens or closes or a set gains or loses a grid; it writes only when the
// height changed, so a refresh that redraws the same tiles writes nothing,
// and its own write never wakes it again. A skeleton tile counts as a tile.
//
// A change the reader caused (a tile's content, a fold opened or closed)
// moves the tiles at the theme's size motion rather than in one jump (Kenny,
// 2026-10-05: "animation isn't smooth at all for opening and closing the
// tile, and growing it is too abrupt … We have grow/shrink elements already
// so take a look at those"): every visible tile of the set eases from the
// height it was drawn at to the set's new one, together, on the duration and
// curve js/motion.js gives a growing box in that theme (sizeMotion), before
// a frame of the jump is painted. A fold that closes lets its tiles go as it
// starts to fold (`data-kp-folding`), so the rest of the board shrinks with
// it instead of after it. A width change, a font arriving or a theme switch
// still takes the new height at once, as the rest of the page does.
//
// Nothing runs on import; attachTileSets(root) returns a detach.
//
// Arrow keys over a grid of tiles [gap-tab-count; the admin dashboard's Apps board]. A board of tiles that open something
// (an app, a stack) is a row of links that wraps: with every link a tab stop the keyboard crosses thirty of them to leave it,
// and a hand-made arrow handler counts columns from widths and goes wrong where a group has fewer tiles in its last row.
// `data-kp-tiles-keys` on a grid, on a board (`data-kp-tiles-set`) or on any element above grids makes all the tiles under it ONE
// place in the tab order, moved with the arrow keys by where the tiles are drawn, not by an index:
//
//   <div class="board" data-kp-tiles-set="apps" data-kp-tiles-keys data-kp-tiles-keys-exit="app-search">…</div>
//
//   Left, Right   the next tile in the same row; at the end of a row, the first tile of the next row (the last of the one before)
//   Up, Down      the nearest tile above or below, the one in the same column first; crossing from one group to the next
//   Home, End     the first and the last tile; PageUp, PageDown a screenful of rows up or down
//
// A tile's stop is its first link or button (`[data-kp-tile-stop]` names another); a second control in it (a star, a menu) stays in
// the tab order. A tile that is `hidden`, in a fold that is shut, or has nothing to focus (a skeleton tile) is skipped. Up from the
// first row fires `kp-tiles-exit` and focuses the element named by `data-kp-tiles-keys-exit` (an id or a selector: the search box
// above the board). Every move fires `kp-tiles-move` `{ from, to, key }`. `data-kp-tiles-keys="off"` gives the tab order back;
// writing the attribute again turns it on again. Under a right-to-left page Left and Right swap.
//
// An entity grid's tiles (`[data-kp-entity-grid]`, js/entity-card.js with `data-kp-entity-kind="tile"`) are tiles too, and
// `data-kp-tiles-keys="letters"` adds type-ahead [wish-1120, homelab 120]: a letter jumps to the next tile whose name (`data-kp-tile-name`,
// else `.kp-entity__name`) starts with it, more letters typed within 700 ms narrow the match, the same letter again steps on to the
// next tile with that letter. A field keeps its letters. Under `letters` an entity tile's star key defaults to `.` (not `s`), so the
// star never takes a letter away; an explicit `data-kp-entity-star-key` is kept.
// attachTileKeys(root) returns a detach.
//
// Each tile set root is a TileSetWatch and each keyed board a TileBoard controller (js/tiles/, on js/controller.js); the
// parts are listed in js/README.md.

import { attachOne, controllerOf } from './controller.js';
import { TILES_KEYS } from './tiles/geometry.js';
import { TileBoard } from './tiles/keys.js';
import { TileSetWatch, evenTileSet, tileSets } from './tiles/sets.js';

export { TILES_SET, TILE_ROW_MIN, TILES_KEYS, TILES_MOVE_EVENT, TILES_EXIT_EVENT, tileStop, letterTile, nextTile } from './tiles/geometry.js';
export { tileSets, evenTileSet } from './tiles/sets.js';

/**
 * Keep every tile set under `root` even: now, and whenever a tile changes
 * size or content, a grid's width changes, a fold opens or closes, or a set
 * or grid is added or removed.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTileSets(root = document) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    // Without a ResizeObserver the sets are evened once, as they stand.
    if (!view || typeof view.ResizeObserver !== 'function') {
        for (const grids of tileSets(root).values()) evenTileSet(grids);
        return () => {};
    }
    const watch = new TileSetWatch(root, view);
    watch.connect();
    return () => watch.destroy();
}

/**
 * Make the tiles under every `[data-kp-tiles-keys]` one place in the tab order, moved with the arrow keys. Idempotent.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTileKeys(root = document) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    if (!view) return () => {};
    const boards = [...(root instanceof HTMLElement && root.matches(TILES_KEYS) ? [root] : []), .../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(TILES_KEYS))];
    /** @type {TileBoard[]} */
    const made = [];
    for (const board of boards) {
        // A board wired already belongs to the attach that wired it.
        if (controllerOf(board, TileBoard)) continue;
        const fresh = attachOne(board, TileBoard, { view });
        if (fresh) made.push(fresh);
    }
    return () => made.splice(0).forEach((board) => board.destroy());
}
