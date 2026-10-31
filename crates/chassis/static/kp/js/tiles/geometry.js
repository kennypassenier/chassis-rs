// The tiles' selectors and events, and the pure helpers both features share: whether a tile shows, a tile's stop and
// name, the tiles of a board, the letter search and the arrow geometry.

/** The marker of a board whose grids share one tile height. */
export const TILES_SET = '[data-kp-tiles-set]';

/** The variable a set writes on each of its grids: the floor of a row. */
export const TILE_ROW_MIN = '--kp-tile-row-min';

/** @param {Element} tile */
export const visible = (tile) => {
    if (tile instanceof HTMLElement && tile.hidden) return false;
    // A fold that is folding shut counts as shut from its first frame.
    const fold = tile.closest('details:not([open]), details[data-kp-folding]');
    if (fold && !tile.closest('summary')) return false;
    return tile.getClientRects().length > 0;
};

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
export const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

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
export function keyTiles(board) {
    // An entity grid's cards are tiles too (js/entity-card.js, `data-kp-entity-kind="tile"`) [wish-1120, homelab 120].
    const GRIDS = '.kp-tiles, [data-kp-entity-grid]';
    const grids = [...(board.matches(GRIDS) ? [board] : []), ...board.querySelectorAll(GRIDS)];
    return grids
        .flatMap((grid) => [...grid.children].filter((tile) => !grid.matches('[data-kp-entity-grid]') || tile.matches('[data-kp-entity]')))
        .filter((tile) => tile instanceof HTMLElement && visible(tile) && tileStop(tile) !== null)
        .map((tile) => /** @type {HTMLElement} */ (tile));
}

/**
 * The words a tile is found by when a letter is typed: `data-kp-tile-name`, else its name (`.kp-entity__name`), else its stop's text.
 * @param {HTMLElement} tile
 */
export function tileName(tile) {
    const named = tile.querySelector('[data-kp-tile-name], .kp-entity__name') ?? tileStop(tile) ?? tile;
    // The name without the hidden "(opens in a new tab)" the link carries.
    const clone = /** @type {HTMLElement} */ (named.cloneNode(true));
    clone.querySelectorAll('.kp-sr-only').forEach((n) => n.remove());
    return (clone.textContent ?? '').trim().toLowerCase();
}

/**
 * The next tile whose name starts with the letters typed, from the one after `from` and round again. A letter typed again and again
 * (the whole buffer one repeated letter) steps through the tiles of that letter. Pure.
 * @param {readonly string[]} names the tiles' names, lower case, in document order
 * @param {number} from the index the focus is on
 * @param {string} typed the buffer, lower case
 * @returns {number | null}
 */
export function letterTile(names, from, typed) {
    if (!typed || !names.length) return null;
    const same = [...typed].every((c) => c === typed[0]);
    const want = same ? typed[0] : typed;
    for (let step = same ? 1 : 0; step <= names.length; step += 1) {
        const i = (from + step + names.length) % names.length;
        if (names[i].startsWith(want)) return i;
    }
    return null;
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

/** A field, a slider, a menu or an editable area keeps its own arrows and letters. */
export const KEEPS_KEYS =
    'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="menu"], [role="listbox"], [data-kp-tiles-keys-ignore]';
