// Tile keys: the tiles of a `[data-kp-tiles-keys]` board are one place in the tab order, moved with the arrow keys, Home,
// End and Page Up/Down, and (with `letters`) found by typing their name; Up on the first row leaves the board.

import { Controller } from '../controller.js';
import { KEEPS_KEYS, MOVES, TILES_EXIT_EVENT, TILES_MOVE_EVENT, keyTiles, letterTile, nextTile, tileName, tileStop } from './geometry.js';

/** How long typed letters keep adding up [ms]. */
const LETTERS_MS = 700;
/** The gap a Page Up/Down counts per row on top of a tile's height [px]. */
const ROW_GAP_PX = 16;
/** The attributes that can change which tiles there are. */
const WATCHED = ['hidden', 'open', 'class', 'data-kp-tiles-keys', 'data-kp-folding', 'data-kp-tile-stop'];

/** @typedef {'left' | 'right' | 'up' | 'down' | 'first' | 'last'} Way */

export class TileBoard extends Controller {
    /** @param {HTMLElement} board @param {{ view: Window & typeof globalThis }} options */
    constructor(board, options) {
        super(board, options);
        this.view = options.view;
        this.doc = board.ownerDocument;
        /** The tile that holds the tab stop. @type {Element | null} */
        this.stop = null;
        /** The stops this script set to -1, with what they had, so detach puts it back. @type {Map<HTMLElement, string | null>} */
        this.taken = new Map();
        this.queued = 0;
        /** The letters typed lately, and the timer that forgets them. */
        this.typed = '';
        this.forget = 0;
    }

    connect() {
        const board = this.host;
        // Registered first, so it runs last: the tab stops are put back once nothing listens.
        this.own(() => {
            if (this.queued) this.view.cancelAnimationFrame(this.queued);
            this.restore();
        });
        this.observe(new this.view.MutationObserver(() => this.queue())).observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED });
        if (typeof this.view.ResizeObserver === 'function') this.observe(new this.view.ResizeObserver(() => this.queue())).observe(board);
        this.listen(board, 'toggle', () => this.queue(), true);
        this.listen(board, 'focusin', (event) => this.onFocus(event));
        this.own(() => this.view.clearTimeout(this.forget));
        this.listen(board, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.sync();
    }

    on() {
        return this.host.getAttribute('data-kp-tiles-keys') !== 'off';
    }

    /** Put back the tab stops this script changed. */
    restore() {
        for (const [el, was] of this.taken) {
            if (was === null) el.removeAttribute('tabindex');
            else el.setAttribute('tabindex', was);
        }
        this.taken.clear();
    }

    /** One stop at 0, the rest at -1: the whole board is one place in the tab order. */
    sync() {
        this.queued = 0;
        if (!this.on()) return this.restore();
        const tiles = keyTiles(this.host);
        if (!this.stop || !tiles.includes(/** @type {HTMLElement} */ (this.stop))) this.stop = tiles[0] ?? null;
        for (const tile of tiles) {
            const el = tileStop(tile);
            if (!el) continue;
            if (!this.taken.has(el)) this.taken.set(el, el.getAttribute('tabindex'));
            const want = tile === this.stop ? '0' : '-1';
            if (el.getAttribute('tabindex') !== want) el.setAttribute('tabindex', want);
        }
        // A tile that left (hidden, folded, removed) takes its -1 with it only if it is still around.
        for (const [el, was] of this.taken) {
            if (!this.host.contains(el)) this.taken.delete(el);
            else if (!tiles.some((tile) => tileStop(tile) === el)) {
                if (was === null) el.removeAttribute('tabindex');
                else el.setAttribute('tabindex', was);
                this.taken.delete(el);
            }
        }
    }

    queue() {
        if (!this.queued) this.queued = this.view.requestAnimationFrame(() => this.sync());
    }

    /** @param {Event} event */
    onFocus(event) {
        if (!this.on() || !(event.target instanceof Element)) return;
        const target = event.target;
        const tile = keyTiles(this.host).find((t) => t.contains(target)) ?? null;
        if (tile && tile !== this.stop) {
            this.stop = tile;
            this.sync();
        }
    }

    /** Move the stop and the focus to a tile, and say so. @param {HTMLElement[]} tiles @param {number} from @param {number} to @param {string} key */
    go(tiles, from, to, key) {
        const el = tileStop(tiles[to]);
        if (!el) return;
        this.stop = tiles[to];
        this.sync();
        el.focus();
        this.host.dispatchEvent(new CustomEvent(TILES_MOVE_EVENT, { bubbles: true, detail: { from: tiles[from], to: tiles[to], key } }));
    }

    /** With `data-kp-tiles-keys="letters"`, a letter goes to the next tile whose name starts with what was typed. @param {KeyboardEvent} event */
    onLetter(event) {
        if (!this.on() || this.host.getAttribute('data-kp-tiles-keys') !== 'letters' || event.defaultPrevented) return;
        if (event.key.length !== 1 || event.key === ' ' || event.altKey || event.ctrlKey || event.metaKey) return;
        const target = /** @type {Element} */ (event.target);
        if (target.closest(KEEPS_KEYS)) return;
        const tiles = keyTiles(this.host);
        const from = tiles.findIndex((tile) => tile.contains(target));
        if (from < 0) return;
        this.typed += event.key.toLowerCase();
        this.view.clearTimeout(this.forget);
        this.forget = this.view.setTimeout(() => (this.typed = ''), LETTERS_MS);
        const to = letterTile(tiles.map(tileName), from, this.typed);
        if (to === null) return;
        event.preventDefault();
        this.go(tiles, from, to, event.key);
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        this.onLetter(event);
        if (!this.on() || !MOVES.has(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
        const target = /** @type {Element} */ (event.target);
        if (target.closest(KEEPS_KEYS)) return;
        const tiles = keyTiles(this.host);
        const from = tiles.findIndex((tile) => tile.contains(target));
        if (from < 0) return;
        const boxes = tiles.map((tile) => tile.getBoundingClientRect());
        const { to, exit } = event.key === 'PageUp' || event.key === 'PageDown' ? this.page(boxes, from, event.key === 'PageDown') : this.step(boxes, from, event.key);
        event.preventDefault();
        if (to === from) {
            if (exit) this.leave();
            return;
        }
        this.go(tiles, from, to, event.key);
    }

    /** One arrow, Home or End. @param {DOMRect[]} boxes @param {number} from @param {string} key */
    step(boxes, from, key) {
        const rtl = this.view.getComputedStyle(this.host).direction === 'rtl';
        /** @type {Record<string, Way>} */
        const ways = { ArrowLeft: rtl ? 'right' : 'left', ArrowRight: rtl ? 'left' : 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'first', End: 'last' };
        const way = ways[key];
        const next = nextTile(boxes, from, way);
        return next === null ? { to: from, exit: way === 'up' } : { to: next, exit: false };
    }

    /** A screenful of rows: as many as stand in the view, at least one. @param {DOMRect[]} boxes @param {number} from @param {boolean} down */
    page(boxes, from, down) {
        const rows = Math.max(1, Math.floor(this.view.innerHeight / Math.max(1, boxes[from].height + ROW_GAP_PX)) - 1);
        let to = from;
        for (let i = 0; i < rows; i += 1) {
            const next = nextTile(boxes, to, down ? 'down' : 'up');
            if (next === null) return { to, exit: !down && to === from };
            to = next;
        }
        return { to, exit: false };
    }

    /** Up from the first row: say so, and hand the focus to the element the board names. */
    leave() {
        const board = this.host;
        board.dispatchEvent(new CustomEvent(TILES_EXIT_EVENT, { bubbles: true, detail: { direction: 'up' } }));
        const named = board.getAttribute('data-kp-tiles-keys-exit');
        if (!named) return;
        let aim = this.doc.getElementById(named);
        if (!aim) {
            try {
                aim = this.doc.querySelector(named);
            } catch {
                aim = null;
            }
        }
        if (aim instanceof HTMLElement) aim.focus();
    }
}
