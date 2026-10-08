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

import { sizeMotion } from './motion.js';

/** The marker of a board whose grids share one tile height. */
export const TILES_SET = '[data-kp-tiles-set]';

/** The variable a set writes on each of its grids: the floor of a row. */
export const TILE_ROW_MIN = '--kp-tile-row-min';

/** @param {Element} tile */
const visible = (tile) => {
    if (tile instanceof HTMLElement && tile.hidden) return false;
    // A fold that is folding shut counts as shut from its first frame.
    const fold = tile.closest('details:not([open]), details[data-kp-folding]');
    if (fold && !tile.closest('summary')) return false;
    return tile.getClientRects().length > 0;
};

/**
 * The sets under `root`, each with its grids: by name where the marker has
 * one, else by the marked element.
 * @param {ParentNode} root
 * @returns {Map<unknown, HTMLElement[]>}
 */
export function tileSets(root) {
    /** @type {Map<unknown, HTMLElement[]>} */
    const sets = new Map();
    const scope = /** @type {ParentNode} */ (root);
    const grids = [...(scope instanceof Element && scope.matches('.kp-tiles') ? [scope] : []), ...scope.querySelectorAll('.kp-tiles')];
    for (const grid of grids) {
        const mark = grid.closest(TILES_SET);
        if (!mark || !(grid instanceof HTMLElement)) continue;
        const name = mark.getAttribute('data-kp-tiles-set');
        const key = name ? `name:${name}` : mark;
        const list = sets.get(key) ?? [];
        list.push(grid);
        sets.set(key, list);
    }
    return sets;
}

/**
 * Even one set: every grid's rows at least as tall as the set's tallest
 * visible tile. Each tile is read at its natural height while the grids
 * carry `data-kp-tiles-measuring` (the stylesheet lets their rows size to
 * content for that one synchronous step), and the floor is written only
 * where it changed.
 * @param {HTMLElement[]} grids
 * @returns {number} the floor, in px (0 for a set with no visible tile)
 */
export function evenTileSet(grids) {
    const tiles = grids.flatMap((grid) => [...grid.children].filter(visible));
    let tallest = 0;
    if (tiles.length) {
        for (const grid of grids) grid.setAttribute('data-kp-tiles-measuring', '');
        for (const tile of tiles) tallest = Math.max(tallest, tile.getBoundingClientRect().height);
        for (const grid of grids) grid.removeAttribute('data-kp-tiles-measuring');
    }
    const value = tallest > 0 ? `${Math.round(tallest * 100) / 100}px` : '';
    for (const grid of grids) {
        if (grid.style.getPropertyValue(TILE_ROW_MIN) === value) continue;
        if (value) grid.style.setProperty(TILE_ROW_MIN, value);
        else grid.style.removeProperty(TILE_ROW_MIN);
    }
    return tallest;
}

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
    const evenAll = () => {
        for (const grids of tileSets(root).values()) evenTileSet(grids);
    };
    if (!view || typeof view.ResizeObserver !== 'function') {
        evenAll();
        return () => {};
    }
    /** @type {Set<Element>} */
    const observed = new Set();
    let queued = 0;
    /** The height each tile was last drawn at, where its next move starts. @type {WeakMap<Element, number>} */
    const drawn = new WeakMap();
    /** The sets whose tiles are moving now, with their moves. @type {Map<unknown, Animation[]>} */
    const moving = new Map();
    /** @param {HTMLElement[]} grids */
    const shown = (grids) => grids.flatMap((grid) => [...grid.children].filter(visible));
    /** @param {Element[]} tiles */
    const remember = (tiles) => {
        for (const tile of tiles) drawn.set(tile, tile.getBoundingClientRect().height);
    };
    /**
     * Even one set; with `move`, ease its tiles from where they were drawn
     * to where they now stand.
     * @param {unknown} key @param {HTMLElement[]} grids @param {boolean} move
     */
    const even = (key, grids, move) => {
        const busy = moving.get(key);
        // A resize during a move is the move's own frames; the move's end
        // looks again.
        if (busy && !move) return;
        /** @type {Map<Element, number>} */
        const from = new Map();
        if (busy) {
            // A change during a move continues from where each tile stands.
            for (const tile of shown(grids)) from.set(tile, tile.getBoundingClientRect().height);
            moving.delete(key);
            for (const grid of grids) grid.removeAttribute('data-kp-tiles-easing');
            for (const animation of busy) animation.cancel();
        }
        const floor = evenTileSet(grids);
        const tiles = shown(grids);
        if (!move) return remember(tiles);
        for (const tile of tiles) if (!from.has(tile) && drawn.has(tile)) from.set(tile, /** @type {number} */ (drawn.get(tile)));
        /** @type {Map<Element, number>} */
        const to = new Map(tiles.map((tile) => [tile, tile.getBoundingClientRect().height]));
        const change = Math.max(0, ...tiles.map((tile) => Math.abs((to.get(tile) ?? 0) - (from.get(tile) ?? to.get(tile) ?? 0))));
        const first = grids[0];
        const { duration, easing } = change >= 1 && first ? sizeMotion(first, floor - (from.get(tiles[0]) ?? floor)) : { duration: 0, easing: '' };
        if (duration <= 0) return remember(tiles);
        // Rows follow the tiles while they move: each tile is held at its
        // eased height (`[data-kp-tiles-easing]`, css/components.css), all of
        // them on one curve, so the rows of every grid stay one height.
        for (const grid of grids) grid.setAttribute('data-kp-tiles-easing', '');
        const moves = tiles.map((tile) => {
            const end = /** @type {number} */ (to.get(tile));
            const start = from.get(tile) ?? end;
            return tile.animate([{ height: `${start}px` }, { height: `${end}px` }], { duration, easing, fill: 'forwards' });
        });
        moving.set(key, moves);
        void Promise.all(moves.map((m) => m.finished)).then(
            () => {
                if (moving.get(key) !== moves) return;
                moving.delete(key);
                for (const grid of grids) grid.removeAttribute('data-kp-tiles-easing');
                for (const m of moves) m.cancel();
                remember(tiles);
                queue();
            },
            () => undefined,
        );
    };
    const run = (move = false) => {
        if (queued) view.cancelAnimationFrame(queued);
        queued = 0;
        const sets = tileSets(root);
        /** @type {Set<Element>} */
        const now = new Set();
        for (const grids of sets.values())
            for (const grid of grids) {
                now.add(grid);
                for (const tile of grid.children) now.add(tile);
            }
        for (const el of observed) if (!now.has(el)) sizes.unobserve(el);
        for (const el of now) if (!observed.has(el)) sizes.observe(el);
        observed.clear();
        for (const el of now) observed.add(el);
        for (const [key, grids] of sets) even(key, grids, move);
    };
    const queue = () => {
        if (!queued) queued = view.requestAnimationFrame(() => run());
    };
    const sizes = new view.ResizeObserver(queue);
    const changes = new view.MutationObserver((records) => {
        const grid = `.kp-tiles, ${TILES_SET}`;
        const leaves = (/** @type {Node} */ n) => n instanceof view.Element && (n.matches(grid) || n.querySelector(grid) !== null);
        /** @param {MutationRecord} r */
        const counts = (r) => {
            const el = r.target instanceof view.Element ? r.target : r.target.parentElement;
            if (!el) return false;
            // Anything inside a set.
            if (el.closest(TILES_SET)) return true;
            // Above a set, only a set or grid that comes or goes, or a fold or
            // `hidden` that shows or hides one: a probe another module draws
            // for an instant beside the board is not a change to the board
            // (js/motion.js reads the theme's motion that way, and a move
            // that answered its own probe never ended).
            if (r.type === 'childList') return [...r.addedNodes, ...r.removedNodes].some(leaves);
            return el.querySelector(TILES_SET) !== null;
        };
        // In the same task as the change, before a frame of it is drawn.
        if (records.some(counts)) run(true);
    });
    changes.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['hidden', 'open', 'class', 'data-kp-tiles-set', 'data-kp-folding'],
    });
    // A fold's `toggle` does not bubble; caught on the way down.
    const target = /** @type {EventTarget} */ (/** @type {unknown} */ (root));
    target.addEventListener('toggle', queue, true);
    doc.fonts?.addEventListener?.('loadingdone', queue);
    run();
    return () => {
        changes.disconnect();
        sizes.disconnect();
        target.removeEventListener('toggle', queue, true);
        doc.fonts?.removeEventListener?.('loadingdone', queue);
        if (queued) view.cancelAnimationFrame(queued);
        for (const moves of moving.values()) for (const m of moves) m.cancel();
        moving.clear();
    };
}
