// Moving an item of the day timeline [parts-1102; r2: the whole block], in steps of the day's step. A pointer drags a block by its
// handle (at once) or by its body (a mouse or a pen once it travels a few pixels, so a plain press still opens it; a finger after
// holding it still, so a swipe still scrolls: js/dayline/press.js); held near the box's edge the hours scroll under it; Escape
// during the drag puts it back. ↑ and ↓ on the handle walk it (Shift: an hour) and the walk is one change once the keys rest, or
// at once on Enter; Escape puts a walk back. The block follows on its rows; every step is said; the controller fires the event.

import { SETTLE_MS } from './constants.js';
import { edgeScroller } from './edge-scroll.js';
import { followPress } from './press.js';

/** @typedef {import('./constants.js').Placed} Placed */

/**
 * What a move needs from its day timeline.
 * @typedef {object} MoveHost
 * @property {HTMLElement} grid
 * @property {HTMLElement} scroll the box the hours scroll in
 * @property {() => number} holdMs how long a finger holds a block still before it lifts
 * @property {(p: Placed) => void} lifted a finger lifted a block: said, so it is known the next move drags it
 * @property {() => number} rowsTotal
 * @property {() => number} perHour rows in an hour
 * @property {(id: string) => Placed | undefined} placed
 * @property {(p: Placed, row: number) => void} show stand the block on a row and say its time
 * @property {(p: Placed, row: number, source: 'pointer' | 'keyboard') => void} commit a finished move to another row
 * @property {(p: Placed) => void} putBack the move was taken back: the block on its own row again, said
 */

/** A row inside the day for a block of `rows` rows. @param {number} row @param {number} rows @param {number} total */
const clampRow = (row, rows, total) => Math.min(total - rows, Math.max(0, row));

/** The item a handle moves (the keyboard walk). @param {EventTarget | null} target @param {MoveHost} host */
function placedOf(target, host) {
    const handle = target instanceof Element ? target.closest('.kp-dayline__handle') : null;
    const id = handle?.closest('[data-kp-dayline-id]')?.getAttribute('data-kp-dayline-id');
    const p = id == null ? undefined : host.placed(id);
    return p && handle ? { p, handle: /** @type {HTMLElement} */ (handle) } : null;
}

/** The movable block a press landed on, and whether it was its handle; a read-only block is never one. @param {EventTarget | null} target @param {MoveHost} host */
function grabbed(target, host) {
    const el = target instanceof Element ? target : null;
    const block = /** @type {HTMLElement | null} */ (el?.closest('.kp-dayline__item:not([data-kp-readonly])') ?? null);
    const id = block?.getAttribute('data-kp-dayline-id');
    const p = id == null ? undefined : host.placed(id);
    return p && block ? { p, block, onHandle: el?.closest('.kp-dayline__handle') != null } : null;
}

/** The keyboard walk on a handle, one per day timeline. */
export class KeyWalk {
    /** @param {MoveHost} host */
    constructor(host) {
        this.host = host;
        /** @type {{ p: Placed, row: number } | null} */
        this.walk = null;
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        this.timer = undefined;
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const hit = placedOf(event.target, this.host);
        if (!hit || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Enter' && this.walk) return void (event.preventDefault(), this.finish());
        if (event.key === 'Escape' && this.walk) return void (event.preventDefault(), event.stopPropagation(), this.cancel());
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        if (this.walk && this.walk.p !== hit.p) this.finish();
        const walk = (this.walk ??= { p: hit.p, row: hit.p.row });
        const by = (event.shiftKey ? this.host.perHour() : 1) * (event.key === 'ArrowUp' ? -1 : 1);
        walk.row = clampRow(walk.row + by, walk.p.rows, this.host.rowsTotal());
        this.host.show(walk.p, walk.row);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.finish(), SETTLE_MS);
    }

    /** The walk becomes one change. */
    finish() {
        clearTimeout(this.timer);
        const walk = this.walk;
        this.walk = null;
        if (walk && walk.row !== walk.p.row) this.host.commit(walk.p, walk.row, 'keyboard');
    }

    /** The walk is put back. */
    cancel() {
        clearTimeout(this.timer);
        const walk = this.walk;
        this.walk = null;
        if (walk) this.host.putBack(walk.p);
    }

    stop() {
        clearTimeout(this.timer);
        this.walk = null;
    }
}

/**
 * One drag from a press on a block: it follows the pointer in whole rows (the box's own scroll counted) until it is let go (a
 * change) or put back (Escape, a cancelled pointer). Returns nothing; its listeners go with the drag.
 * @param {PointerEvent} down @param {MoveHost} host
 */
export function dragFrom(down, host) {
    const hit = grabbed(down.target, host);
    if (!hit || (down.pointerType === 'mouse' && down.button !== 0)) return;
    if (hit.onHandle) down.preventDefault();
    const { p, block } = hit;
    const rowPx = host.grid.getBoundingClientRect().height / host.rowsTotal();
    const top = host.scroll.scrollTop;
    let row = p.row;
    let lastY = down.clientY;
    const place = () => {
        const dy = lastY - down.clientY + (host.scroll.scrollTop - top);
        const next = clampRow(p.row + Math.round(dy / rowPx), p.rows, host.rowsTotal());
        if (next !== row) host.show(p, (row = next));
    };
    const edge = edgeScroller(host.scroll, place);
    const stop = () => {
        edge.stop();
        delete block.dataset.kpDragging;
    };
    followPress(down, {
        mode: hit.onHandle ? 'now' : 'hold',
        holdMs: host.holdMs(),
        capture: block,
        lift: () => {
            block.dataset.kpDragging = '';
            host.lifted(p);
        },
        start: () => {
            block.dataset.kpDragging = '';
            return true;
        },
        move: (e) => {
            lastY = e.clientY;
            edge.at(e.clientY);
            place();
        },
        end: (how) => {
            stop();
            if (how === 'drop' && row !== p.row) host.commit(p, row, 'pointer');
            else host.putBack(p);
        },
    });
}
