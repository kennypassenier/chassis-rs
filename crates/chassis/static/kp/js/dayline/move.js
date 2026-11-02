// Moving an item of the day timeline by its handle [parts-1102], in steps of the day's step: a pointer drags it (Escape during
// the drag puts it back), ↑ and ↓ walk it (Shift: an hour) and the walk is one change once the keys rest, or at once on Enter;
// Escape puts a walk back. The block follows on its rows; every step is said; the controller fires the event.

import { DRAG_THRESHOLD_PX, SETTLE_MS } from './constants.js';

/** @typedef {import('./constants.js').Placed} Placed */

/**
 * What a move needs from its day timeline.
 * @typedef {object} MoveHost
 * @property {HTMLElement} grid
 * @property {() => number} rowsTotal
 * @property {() => number} perHour rows in an hour
 * @property {(id: string) => Placed | undefined} placed
 * @property {(p: Placed, row: number) => void} show stand the block on a row and say its time
 * @property {(p: Placed, row: number, source: 'pointer' | 'keyboard') => void} commit a finished move to another row
 * @property {(p: Placed) => void} putBack the move was taken back: the block on its own row again, said
 */

/** A row inside the day for a block of `rows` rows. @param {number} row @param {number} rows @param {number} total */
const clampRow = (row, rows, total) => Math.min(total - rows, Math.max(0, row));

/** The item a handle moves. @param {EventTarget | null} target @param {MoveHost} host */
function placedOf(target, host) {
    const handle = target instanceof Element ? target.closest('.kp-dayline__handle') : null;
    const id = handle?.closest('[data-kp-dayline-id]')?.getAttribute('data-kp-dayline-id');
    const p = id == null ? undefined : host.placed(id);
    return p && handle ? { p, handle: /** @type {HTMLElement} */ (handle) } : null;
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
 * One drag from a press on a handle: the block follows the pointer in whole rows until it is let go (a change) or Escape is
 * pressed (put back). Returns nothing; its listeners go with the drag.
 * @param {PointerEvent} down @param {MoveHost} host
 */
export function dragFrom(down, host) {
    const hit = placedOf(down.target, host);
    if (!hit || down.button !== 0) return;
    down.preventDefault();
    const { p, handle } = hit;
    const rowPx = host.grid.getBoundingClientRect().height / host.rowsTotal();
    const block = /** @type {HTMLElement} */ (handle.closest('.kp-dayline__item'));
    let row = p.row;
    let moved = false;
    handle.setPointerCapture?.(down.pointerId);
    block.dataset.kpDragging = '';
    const onMove = (/** @type {PointerEvent} */ e) => {
        const dy = e.clientY - down.clientY;
        if (!moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        moved = true;
        const next = clampRow(p.row + Math.round(dy / rowPx), p.rows, host.rowsTotal());
        if (next !== row) host.show(p, (row = next));
    };
    const end = (/** @type {'commit' | 'back'} */ how) => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onCancel);
        handle.ownerDocument.removeEventListener('keydown', onKey, true);
        delete block.dataset.kpDragging;
        if (how === 'commit' && moved && row !== p.row) host.commit(p, row, 'pointer');
        else if (moved) host.putBack(p);
    };
    const onUp = () => end('commit');
    const onCancel = () => end('back');
    const onKey = (/** @type {KeyboardEvent} */ e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        end('back');
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
    handle.ownerDocument.addEventListener('keydown', onKey, true);
}
