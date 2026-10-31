// Tile sets: the grids of a set share one row height, kept even now and whenever a tile, a grid, a fold or a font changes,
// with the tiles eased from the height they were drawn at.

import { Controller } from '../controller.js';
import { sizeMotion } from '../motion.js';
import { TILES_SET, TILE_ROW_MIN, visible } from './geometry.js';

/** The attributes that can show, hide or regroup a set. */
const WATCHED = ['hidden', 'open', 'class', 'data-kp-tiles-set', 'data-kp-folding'];
/** A change of height smaller than this is not eased [px]. */
const EASE_MIN_PX = 1;

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

/** @param {HTMLElement[]} grids */
const shown = (grids) => grids.flatMap((grid) => [...grid.children].filter(visible));

/** Every tile set under a root (an element or a whole document), kept even. */
export class TileSetWatch extends Controller {
    /** @param {ParentNode} root @param {Window & typeof globalThis} view */
    constructor(root, view) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (root)));
        this.root = root;
        this.view = view;
        this.doc = root instanceof Document ? root : (root.ownerDocument ?? document);
        /** The grids and tiles under observation. @type {Set<Element>} */
        this.observed = new Set();
        this.queued = 0;
        /** The height each tile was last drawn at, where its next move starts. @type {WeakMap<Element, number>} */
        this.drawn = new WeakMap();
        /** The sets whose tiles are moving now, with their moves. @type {Map<unknown, Animation[]>} */
        this.moving = new Map();
        this.sizes = new view.ResizeObserver(() => this.queue());
    }

    connect() {
        const root = this.root;
        // Registered first, so it runs last: the frame and the moves stop once nothing listens.
        this.own(() => {
            if (this.queued) this.view.cancelAnimationFrame(this.queued);
            for (const moves of this.moving.values()) for (const m of moves) m.cancel();
            this.moving.clear();
        });
        this.observe(this.sizes);
        this.observe(new this.view.MutationObserver((records) => this.onRecords(records))).observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: WATCHED,
        });
        // A fold's `toggle` does not bubble; caught on the way down.
        this.listen(/** @type {EventTarget} */ (/** @type {unknown} */ (root)), 'toggle', () => this.queue(), true);
        // A document without a font set (an old engine, a test) has nothing to hear.
        const fonts = /** @type {FontFaceSet | undefined} */ (this.doc.fonts);
        if (fonts) this.listen(fonts, 'loadingdone', () => this.queue());
        this.run();
    }

    queue() {
        if (!this.queued) this.queued = this.view.requestAnimationFrame(() => this.run());
    }

    /** @param {Element[]} tiles */
    remember(tiles) {
        for (const tile of tiles) this.drawn.set(tile, tile.getBoundingClientRect().height);
    }

    /** Observe the grids and tiles there are now, and even every set. @param {boolean} [move] */
    run(move = false) {
        if (this.queued) this.view.cancelAnimationFrame(this.queued);
        this.queued = 0;
        const sets = tileSets(this.root);
        /** @type {Set<Element>} */
        const now = new Set();
        for (const grids of sets.values())
            for (const grid of grids) {
                now.add(grid);
                for (const tile of grid.children) now.add(tile);
            }
        for (const el of this.observed) if (!now.has(el)) this.sizes.unobserve(el);
        for (const el of now) if (!this.observed.has(el)) this.sizes.observe(el);
        this.observed = now;
        for (const [key, grids] of sets) this.even(key, grids, move);
    }

    /**
     * Even one set; with `move`, ease its tiles from where they were drawn to where they now stand.
     * @param {unknown} key @param {HTMLElement[]} grids @param {boolean} move
     */
    even(key, grids, move) {
        const busy = this.moving.get(key);
        // A resize during a move is the move's own frames; the move's end looks again.
        if (busy && !move) return;
        /** @type {Map<Element, number>} */
        const from = new Map();
        if (busy) {
            // A change during a move continues from where each tile stands.
            for (const tile of shown(grids)) from.set(tile, tile.getBoundingClientRect().height);
            this.moving.delete(key);
            for (const grid of grids) grid.removeAttribute('data-kp-tiles-easing');
            for (const animation of busy) animation.cancel();
        }
        const floor = evenTileSet(grids);
        const tiles = shown(grids);
        if (!move) return this.remember(tiles);
        for (const tile of tiles) if (!from.has(tile) && this.drawn.has(tile)) from.set(tile, /** @type {number} */ (this.drawn.get(tile)));
        this.ease(key, grids, tiles, from, floor);
    }

    /**
     * Rows follow the tiles while they move: each tile is held at its eased height (`[data-kp-tiles-easing]`,
     * css/components.css), all of them on one curve, so the rows of every grid stay one height.
     * @param {unknown} key @param {HTMLElement[]} grids @param {Element[]} tiles @param {Map<Element, number>} from @param {number} floor
     */
    ease(key, grids, tiles, from, floor) {
        /** @type {Map<Element, number>} */
        const to = new Map(tiles.map((tile) => [tile, tile.getBoundingClientRect().height]));
        const change = Math.max(0, ...tiles.map((tile) => Math.abs((to.get(tile) ?? 0) - (from.get(tile) ?? to.get(tile) ?? 0))));
        const first = grids[0];
        const { duration, easing } = change >= EASE_MIN_PX && first ? sizeMotion(first, floor - (from.get(tiles[0]) ?? floor)) : { duration: 0, easing: '' };
        if (duration <= 0) return this.remember(tiles);
        for (const grid of grids) grid.setAttribute('data-kp-tiles-easing', '');
        const moves = tiles.map((tile) => {
            const end = /** @type {number} */ (to.get(tile));
            const start = from.get(tile) ?? end;
            return tile.animate([{ height: `${start}px` }, { height: `${end}px` }], { duration, easing, fill: 'forwards' });
        });
        this.moving.set(key, moves);
        void Promise.all(moves.map((m) => m.finished)).then(
            () => {
                if (this.moving.get(key) !== moves) return;
                this.moving.delete(key);
                for (const grid of grids) grid.removeAttribute('data-kp-tiles-easing');
                for (const m of moves) m.cancel();
                this.remember(tiles);
                this.queue();
            },
            () => undefined,
        );
    }

    /**
     * Even again, in the same task as the change, before a frame of it is drawn: anything inside a set; above a set, only a
     * set or grid that comes or goes, or a fold or `hidden` that shows or hides one. A probe another module draws for an
     * instant beside the board is not a change to the board (js/motion.js reads the theme's motion that way, and a move that
     * answered its own probe never ended).
     * @param {MutationRecord[]} records
     */
    onRecords(records) {
        const view = this.view;
        const grid = `.kp-tiles, ${TILES_SET}`;
        const leaves = (/** @type {Node} */ n) => n instanceof view.Element && (n.matches(grid) || n.querySelector(grid) !== null);
        const counts = (/** @type {MutationRecord} */ r) => {
            const el = r.target instanceof view.Element ? r.target : r.target.parentElement;
            if (!el) return false;
            if (el.closest(TILES_SET)) return true;
            if (r.type === 'childList') return [...r.addedNodes, ...r.removedNodes].some(leaves);
            return el.querySelector(TILES_SET) !== null;
        };
        if (records.some(counts)) this.run(true);
    }
}
