// The reorder list [TH46]: a grab handle that moves an item with the arrow keys or the pointer, the move said in words. Lists that
// share `data-kp-reorder-group` also take each other's items [habits-1101]: dragged over the other list, or ← → on the handle.

import { Controller, controllerOf } from '../controller.js';
import { getStrings } from '../strings.js';
import { groupLists, groupOf, indexAt, listAt, listKey, listName, neighbour, nudgeScroll } from './reorder-group.js';
import { DEFAULTS, REORDER_EVENT } from './shared.js';

/** @typedef {import('../structure.js').ReorderHandle} ReorderHandle */

/** @param {EventTarget | null} target */
const handleAt = (target) => /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (target).closest('[data-kp-handle]'));

/**
 * Put the items back in the order attach found them, moving only what moved, and keep the focus where it was:
 * moving a node that holds the focus drops it to <body> without a blur [habits-1101 focus-after-detach].
 * @param {HTMLElement} list @param {readonly Element[]} original
 */
function restoreOrder(list, original) {
    const children = [...list.children];
    if (children.length === original.length && children.every((child, i) => child === original[i])) return;
    const focused = list.ownerDocument.activeElement;
    const held = focused instanceof HTMLElement && list.contains(focused) ? focused : null;
    list.replaceChildren(...original);
    if (held?.isConnected && list.ownerDocument.activeElement !== held) held.focus({ preventScroll: true });
}

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
            // A list that shares its items gives none back: they may stand in another list now, which keeps them.
            if (groupOf(list) === null) restoreOrder(list, this.original);
            if (this.madeLive) this.live?.remove();
            delete list.dataset.kpReorderAttached;
        });
        this.listen(list, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(list, 'pointerdown', (event) => this.onPointerDown(/** @type {PointerEvent} */ (event)));
        this.listen(list, 'focusin', (event) => this.describeHandle(event.target));
    }

    /** A handle in a list that shares its items says its keys, ← → included, when it gets the focus. @param {EventTarget | null} target */
    describeHandle(target) {
        if (groupOf(this.host) === null || !(target instanceof HTMLElement) || !target.matches('[data-kp-handle]')) return;
        target.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Home End');
        if (!target.hasAttribute('aria-description')) target.setAttribute('aria-description', getStrings().reorderGroupKeys);
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

    /** @param {HTMLElement} item */
    static nameOf(item) {
        return item.dataset.kpLabel ?? item.querySelector('[data-kp-item-label]')?.textContent?.trim() ?? item.dataset.kpItem ?? '';
    }

    /**
     * Say the move and report it. A list in a group adds `fromList` and `toList` (the lists' keys) to the detail; `source` is the list
     * the item came from when it crossed over.
     * @param {HTMLElement} item @param {number} from @param {number} to @param {HTMLElement} [source]
     */
    announce(item, from, to, source = this.host) {
        const name = ReorderControl.nameOf(item);
        const strings = getStrings();
        // In words, and not only by moving: a list that reorders silently is one a screen reader user cannot arrange.
        const said = source === this.host ? strings.reorderMoved(name, to + 1, this.host.children.length) : strings.reorderMovedTo(name, listName(this.host), to + 1, this.host.children.length);
        this.say(said);
        /** @type {Record<string, unknown>} */
        const detail = { order: this.order(), id: item.dataset.kpItem ?? '', from, to };
        if (groupOf(this.host) !== null) Object.assign(detail, { fromList: listKey(source), toList: listKey(this.host) });
        this.host.dispatchEvent(new CustomEvent(REORDER_EVENT, { bubbles: true, detail }));
    }

    /** @param {string} words */
    say(words) {
        if (this.live) this.live.textContent = words;
    }

    /**
     * Take an item from another list of the group and put it at `index` here.
     * @param {HTMLElement} item @param {number} index
     */
    receive(item, index) {
        const source = /** @type {HTMLElement} */ (item.parentElement);
        const from = [...source.children].indexOf(item);
        const children = [...this.host.children];
        const at = Math.max(0, Math.min(children.length, index));
        this.host.insertBefore(item, children[at] ?? null);
        this.announce(item, from, at, source);
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
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && groupOf(this.host) !== null) {
            event.preventDefault();
            this.keyAcross(item, event.key === 'ArrowRight' ? 1 : -1);
            handle.focus();
            return;
        }
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
     * ← or →: the item goes to the list before or after in the group (mirrored right to left), at the same place or the last one.
     * @param {HTMLElement} item @param {number} side 1 for →, -1 for ←
     */
    keyAcross(item, side) {
        const rtl = getComputedStyle(this.host).direction === 'rtl';
        const target = neighbour(this.host, rtl ? -side : side);
        const control = target ? controllerOf(target, ReorderControl) : undefined;
        if (!control) {
            this.say(getStrings().reorderGroupEnd);
            return;
        }
        control.receive(item, [...this.host.children].indexOf(item));
        // A list off to the side (a board's lane on a phone) comes into view with the item.
        item.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
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
            if (move.pointerId === pointerId) this.dragOver(item, move.clientX, move.clientY);
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

    /**
     * The dragged item goes over to another list of the group under the pointer, or takes the place of the sibling under it in the
     * list it stands in now (which may no longer be this one).
     * @param {HTMLElement} item @param {number} x @param {number} y
     */
    dragOver(item, x, y) {
        const here = /** @type {HTMLElement} */ (item.parentElement);
        const owner = controllerOf(here, ReorderControl) ?? this;
        if (groupOf(this.host) !== null) {
            nudgeScroll(item, x);
            const over = listAt(groupLists(this.host), x, y);
            const control = over && over !== here ? controllerOf(over, ReorderControl) : undefined;
            if (over && control) {
                control.receive(item, indexAt(over, item, y));
                return;
            }
        }
        for (const sibling of here.children) {
            if (sibling === item) continue;
            const box = sibling.getBoundingClientRect();
            if (y >= box.top && y <= box.bottom) {
                owner.moveTo(item, [...here.children].indexOf(sibling));
                break;
            }
        }
    }
}
