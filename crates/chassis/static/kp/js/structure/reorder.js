// The reorder list [TH46]: a grab handle that moves an item with the arrow keys or the pointer, the move said in words.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { DEFAULTS, REORDER_EVENT } from './shared.js';

/** @typedef {import('../structure.js').ReorderHandle} ReorderHandle */

/** @param {EventTarget | null} target */
const handleAt = (target) => /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (target).closest('[data-kp-handle]'));

export class ReorderControl extends Controller {
    /** Whether the element is already wired: it carries the mark connect() stamps. @param {HTMLElement} element */
    static isAttached(element) {
        return element.dataset.kpReorderAttached !== undefined;
    }

    /** @param {HTMLElement} list @param {import('./shared.js').StructureOptions} [options] */
    constructor(list, options = DEFAULTS) {
        super(list, options);
        this.pointer = list.dataset.kpPointer === undefined ? options.reorderPointer : list.dataset.kpPointer !== 'false';
        /** The children as attach found them; detach puts them back in this order. */
        this.original = [...list.children];
        /** The live region the moves are said in, and whether this module made it. @type {HTMLElement | null} */
        this.live = null;
        this.madeLive = false;
        /** Ends a drag in progress. @type {(() => void) | null} */
        this.endDrag = null;
        /** @type {ReorderHandle} */
        this.handle = { element: list, order: () => this.order(), setOrder: (ids) => this.setOrder(ids) };
    }

    connect() {
        const list = this.host;
        list.dataset.kpReorderAttached = '';
        this.mountLive();
        this.own(() => {
            this.endDrag?.();
            list.replaceChildren(...this.original);
            if (this.madeLive) this.live?.remove();
            delete list.dataset.kpReorderAttached;
        });
        this.listen(list, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(list, 'pointerdown', (event) => this.onPointerDown(/** @type {PointerEvent} */ (event)));
    }

    mountLive() {
        this.live = /** @type {HTMLElement | null} */ (this.host.querySelector('[data-kp-reorder-status]'));
        if (this.live !== null) return;
        const live = document.createElement('span');
        live.className = 'kp-sr-only';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        live.dataset.kpReorderStatus = '';
        this.host.after(live);
        this.live = live;
        this.madeLive = true;
    }

    order() {
        return [...this.host.children].map((child) => /** @type {HTMLElement} */ (child).dataset.kpItem ?? '');
    }

    /** @param {readonly string[]} ids */
    setOrder(ids) {
        const list = this.host;
        for (const id of ids) {
            const item = /** @type {HTMLElement | null} */ (list.querySelector(`[data-kp-item="${CSS.escape(id)}"]`));
            if (item) list.append(item);
        }
        list.dispatchEvent(new CustomEvent(REORDER_EVENT, { bubbles: true, detail: { order: this.order(), id: '', from: -1, to: -1 } }));
    }

    /** @param {HTMLElement} item @param {number} from @param {number} to */
    announce(item, from, to) {
        const name = item.dataset.kpLabel ?? item.querySelector('[data-kp-item-label]')?.textContent?.trim() ?? item.dataset.kpItem ?? '';
        // In words, and not only by moving: a list that reorders silently is one a screen reader user cannot arrange.
        if (this.live) this.live.textContent = getStrings().reorderMoved(name, to + 1, this.host.children.length);
        this.host.dispatchEvent(new CustomEvent(REORDER_EVENT, { bubbles: true, detail: { order: this.order(), id: item.dataset.kpItem ?? '', from, to } }));
    }

    /** @param {HTMLElement} item @param {number} to */
    moveTo(item, to) {
        const children = [...this.host.children];
        const from = children.indexOf(item);
        const target = Math.max(0, Math.min(children.length - 1, to));
        if (from === -1 || from === target) return;
        const ref = children[target];
        if (target < from) this.host.insertBefore(item, ref ?? null);
        else this.host.insertBefore(item, ref?.nextSibling ?? null);
        this.announce(item, from, target);
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const handle = handleAt(event.target);
        if (handle === null) return;
        const item = handle.closest('[data-kp-item]');
        if (!(item instanceof HTMLElement)) return;
        const at = [...this.host.children].indexOf(item);
        /** @type {Record<string, number>} */
        const targets = { ArrowUp: at - 1, ArrowDown: at + 1, Home: 0, End: this.host.children.length - 1 };
        const to = targets[event.key];
        if (to === undefined) return;
        event.preventDefault();
        this.moveTo(item, to);
        // Focus follows the item, not the position: losing focus after every move is what makes keyboard reordering unusable.
        handle.focus();
    }

    /**
     * The pointer route: drag by the handle, drop between siblings. The move and release are heard on the window, not on the
     * handle: moving the row in the DOM detaches the handle for a moment, which releases its pointer capture, and the first
     * version then stopped hearing the pointer after one row [held-60].
     * @param {PointerEvent} event
     */
    onPointerDown(event) {
        if (!this.pointer || event.button !== 0) return;
        const handle = handleAt(event.target);
        const item = handle?.closest('[data-kp-item]');
        if (!handle || !(item instanceof HTMLElement) || item.parentElement !== this.host) return;
        event.preventDefault();
        this.endDrag?.();
        const pointerId = event.pointerId;
        item.dataset.kpDragging = '';
        const onMove = (/** @type {PointerEvent} */ move) => {
            if (move.pointerId === pointerId) this.dragOver(item, move.clientY);
        };
        const onUp = (/** @type {PointerEvent} */ up) => {
            if (up && up.pointerId !== pointerId) return;
            delete item.dataset.kpDragging;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            this.endDrag = null;
        };
        this.endDrag = /** @type {() => void} */ (onUp);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    /** The dragged item takes the place of the sibling under the pointer. @param {HTMLElement} item @param {number} y */
    dragOver(item, y) {
        for (const sibling of this.host.children) {
            if (sibling === item) continue;
            const box = sibling.getBoundingClientRect();
            if (y >= box.top && y <= box.bottom) {
                this.moveTo(item, [...this.host.children].indexOf(sibling));
                break;
            }
        }
    }
}
