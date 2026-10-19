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
// attachTileKeys(root) returns a detach.

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

/** The marker of a board whose tiles are one place in the tab order, moved with the arrow keys. */
export const TILES_KEYS = '[data-kp-tiles-keys]';

/** Fired on the board when the arrow keys moved the focus to another tile: `{ from, to, key }`. */
export const TILES_MOVE_EVENT = 'kp-tiles-move';

/** Fired on the board when Up was pressed on the first row: `{ direction: 'up' }`. */
export const TILES_EXIT_EVENT = 'kp-tiles-exit';

/** What a tile's stop may be, when it names none. */
const STOP_CANDIDATES =
    'a[href], button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]';

/** The keys that move. */
const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * The element of a tile that takes the focus: the one marked `data-kp-tile-stop`, else the tile itself when it can be focused,
 * else its first link, button or field.
 * @param {Element} tile
 * @returns {HTMLElement | null}
 */
export function tileStop(tile) {
    const marked = tile.querySelector('[data-kp-tile-stop]');
    if (marked instanceof HTMLElement) return marked;
    if (tile instanceof HTMLElement && tile.matches(STOP_CANDIDATES)) return tile;
    const first = [...tile.querySelectorAll(STOP_CANDIDATES)].find((el) => !el.hasAttribute('data-kp-tile-secondary'));
    return first instanceof HTMLElement ? first : null;
}

/** @param {Element} board @returns {HTMLElement[]} every tile that can take the focus now, in document order */
function keyTiles(board) {
    const grids = [...(board.matches('.kp-tiles') ? [board] : []), ...board.querySelectorAll('.kp-tiles')];
    return grids
        .flatMap((grid) => [...grid.children])
        .filter((tile) => tile instanceof HTMLElement && visible(tile) && tileStop(tile) !== null)
        .map((tile) => /** @type {HTMLElement} */ (tile));
}

/**
 * Where to go from a tile: pure geometry over the tiles' boxes. Left and Right keep to the row (the tiles whose centres stand
 * within half a tile of this one's), and wrap to the next or the previous row at its end; Up and Down take the nearest row in
 * that direction and, in it, the tile nearest in the column, so a group with a short last row sends Down to its last tile rather
 * than skipping a row.
 *
 * @param {readonly { left: number, right: number, top: number, bottom: number }[]} boxes the tiles, in document order
 * @param {number} from index of the tile the focus is on
 * @param {'left' | 'right' | 'up' | 'down' | 'first' | 'last'} way
 * @returns {number | null} the index to go to; null where there is nowhere (the first row's Up, the last row's Down)
 */
export function nextTile(boxes, from, way) {
    const box = boxes[from];
    if (!box) return null;
    if (way === 'first') return boxes.length ? 0 : null;
    if (way === 'last') return boxes.length ? boxes.length - 1 : null;
    /** @typedef {{ left: number, right: number, top: number, bottom: number }} Box */
    const cx = (/** @type {Box} */ b) => (b.left + b.right) / 2;
    const cy = (/** @type {Box} */ b) => (b.top + b.bottom) / 2;
    const half = (/** @type {Box} */ b) => (b.bottom - b.top) / 2;
    /** Same row: the centres within half of the shorter tile. @param {Box} a @param {Box} b */
    const sameRow = (a, b) => Math.abs(cy(a) - cy(b)) <= Math.min(half(a), half(b));
    const others = boxes.map((b, i) => ({ b, i })).filter(({ i }) => i !== from);
    if (way === 'left' || way === 'right') {
        const sign = way === 'right' ? 1 : -1;
        const row = others.filter(({ b }) => sameRow(box, b) && (cx(b) - cx(box)) * sign > 0);
        if (row.length) return row.reduce((best, c) => (Math.abs(cx(c.b) - cx(box)) < Math.abs(cx(best.b) - cx(box)) ? c : best)).i;
        // The end of the row: the nearest row after (before) this one, its first (last) tile.
        const rows = others.filter(({ b }) => !sameRow(box, b) && (cy(b) - cy(box)) * sign > 0);
        if (!rows.length) return null;
        const near = rows.reduce((best, c) => (Math.abs(cy(c.b) - cy(box)) < Math.abs(cy(best.b) - cy(box)) ? c : best));
        const inRow = rows.filter(({ b }) => sameRow(near.b, b));
        return inRow.reduce((best, c) => (cx(c.b) * sign < cx(best.b) * sign ? c : best)).i;
    }
    const sign = way === 'down' ? 1 : -1;
    const beyond = others.filter(({ b }) => !sameRow(box, b) && (cy(b) - cy(box)) * sign > 0);
    if (!beyond.length) return null;
    // The nearest row, then the nearest column in it.
    const near = beyond.reduce((best, c) => (Math.abs(cy(c.b) - cy(box)) < Math.abs(cy(best.b) - cy(box)) ? c : best));
    const inRow = beyond.filter(({ b }) => sameRow(near.b, b));
    return inRow.reduce((best, c) => (Math.abs(cx(c.b) - cx(box)) < Math.abs(cx(best.b) - cx(box)) ? c : best)).i;
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
    /** @type {HTMLElement[]} */
    const boards = [];
    if (root instanceof HTMLElement && root.matches(TILES_KEYS)) boards.push(root);
    for (const el of root.querySelectorAll(TILES_KEYS)) boards.push(/** @type {HTMLElement} */ (el));
    /** @type {(() => void)[]} */
    const undo = [];
    for (const board of boards) {
        if (wiredBoards.has(board)) continue;
        wiredBoards.add(board);
        const off = wireBoard(board, view);
        undo.push(() => {
            off();
            wiredBoards.delete(board);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}

/** The boards wired already. */
const wiredBoards = new WeakSet();

/**
 * @param {HTMLElement} board
 * @param {Window & typeof globalThis} view
 * @returns {() => void}
 */
function wireBoard(board, view) {
    const doc = board.ownerDocument;
    /** The tile that holds the tab stop. @type {Element | null} */
    let stop = null;
    /** The stops this script set to -1, with what they had, so detach puts it back. @type {Map<HTMLElement, string | null>} */
    const taken = new Map();
    let queued = 0;
    const on = () => board.getAttribute('data-kp-tiles-keys') !== 'off';

    /** One stop at 0, the rest at -1: the whole board is one place in the tab order. */
    const restore = () => {
        for (const [el, was] of taken) {
            if (was === null) el.removeAttribute('tabindex');
            else el.setAttribute('tabindex', was);
        }
        taken.clear();
    };
    const sync = () => {
        queued = 0;
        if (!on()) return restore();
        const tiles = keyTiles(board);
        if (!stop || !tiles.includes(/** @type {HTMLElement} */ (stop))) stop = tiles[0] ?? null;
        for (const tile of tiles) {
            const el = tileStop(tile);
            if (!el) continue;
            if (!taken.has(el)) taken.set(el, el.getAttribute('tabindex'));
            const want = tile === stop ? '0' : '-1';
            if (el.getAttribute('tabindex') !== want) el.setAttribute('tabindex', want);
        }
        // A tile that left (hidden, folded, removed) takes its -1 with it only if it is still around.
        for (const [el, was] of taken) {
            if (!board.contains(el)) taken.delete(el);
            else if (!tiles.some((tile) => tileStop(tile) === el)) {
                if (was === null) el.removeAttribute('tabindex');
                else el.setAttribute('tabindex', was);
                taken.delete(el);
            }
        }
    };
    const queue = () => {
        if (!queued) queued = view.requestAnimationFrame(sync);
    };

    /** @param {EventTarget | null} target @returns {HTMLElement | null} the tile that holds it */
    const tileOf = (target) => {
        if (!(target instanceof Element)) return null;
        return keyTiles(board).find((tile) => tile.contains(target)) ?? null;
    };
    const onFocus = (/** @type {FocusEvent} */ event) => {
        if (!on()) return;
        const tile = tileOf(event.target);
        if (tile && tile !== stop) {
            stop = tile;
            sync();
        }
    };
    const onKey = (/** @type {KeyboardEvent} */ event) => {
        if (!on() || !MOVES.has(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
        const target = /** @type {Element} */ (event.target);
        // A field, a slider, a menu or an editable area keeps its own arrows.
        if (
            target.closest(
                'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="menu"], [role="listbox"], [data-kp-tiles-keys-ignore]',
            )
        )
            return;
        const tiles = keyTiles(board);
        const from = tiles.findIndex((tile) => tile.contains(target));
        if (from < 0) return;
        const boxes = tiles.map((tile) => tile.getBoundingClientRect());
        const rtl = view.getComputedStyle(board).direction === 'rtl';
        /** @type {Record<string, 'left' | 'right' | 'up' | 'down' | 'first' | 'last'>} */
        const ways = {
            ArrowLeft: rtl ? 'right' : 'left',
            ArrowRight: rtl ? 'left' : 'right',
            ArrowUp: 'up',
            ArrowDown: 'down',
            Home: 'first',
            End: 'last',
        };
        let way = ways[event.key];
        let to = from;
        let exit = false;
        if (event.key === 'PageUp' || event.key === 'PageDown') {
            // A screenful of rows: as many as stand in the view, at least one.
            const down = event.key === 'PageDown';
            const rows = Math.max(1, Math.floor(view.innerHeight / Math.max(1, boxes[from].height + 16)) - 1);
            way = down ? 'down' : 'up';
            for (let i = 0; i < rows; i += 1) {
                const next = nextTile(boxes, to, way);
                if (next === null) {
                    exit = !down && to === from;
                    break;
                }
                to = next;
            }
        } else {
            const next = nextTile(boxes, from, way);
            if (next === null) exit = way === 'up';
            else to = next;
        }
        event.preventDefault();
        if (to === from) {
            if (exit) leave();
            return;
        }
        const key = event.key;
        const el = tileStop(tiles[to]);
        if (!el) return;
        stop = tiles[to];
        sync();
        el.focus();
        board.dispatchEvent(new CustomEvent(TILES_MOVE_EVENT, { bubbles: true, detail: { from: tiles[from], to: tiles[to], key } }));
    };
    /** Up from the first row: say so, and hand the focus to the element the board names. */
    const leave = () => {
        board.dispatchEvent(new CustomEvent(TILES_EXIT_EVENT, { bubbles: true, detail: { direction: 'up' } }));
        const named = board.getAttribute('data-kp-tiles-keys-exit');
        if (!named) return;
        let aim = doc.getElementById(named);
        if (!aim) {
            try {
                aim = doc.querySelector(named);
            } catch {
                aim = null;
            }
        }
        if (aim instanceof HTMLElement) aim.focus();
    };

    board.addEventListener('keydown', onKey);
    board.addEventListener('focusin', onFocus);
    const sizes = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(queue) : null;
    sizes?.observe(board);
    const changes = new view.MutationObserver(queue);
    changes.observe(board, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'open', 'class', 'data-kp-tiles-keys', 'data-kp-folding', 'data-kp-tile-stop'],
    });
    board.addEventListener('toggle', queue, true);
    sync();
    return () => {
        board.removeEventListener('keydown', onKey);
        board.removeEventListener('focusin', onFocus);
        board.removeEventListener('toggle', queue, true);
        changes.disconnect();
        sizes?.disconnect();
        if (queued) view.cancelAnimationFrame(queued);
        restore();
    };
}
