// One press on something the day timeline lets a person drag [parts-1102 r2]: a block's handle, a block's body, or a source in a
// list beside the day. It follows the press from pointerdown until it is a drag, a plain press or a scroll, for every pointer:
//
//   now    (a handle, `touch-action: none`)  any pointer is a drag once it travels DRAG_THRESHOLD_PX
//   hold   (a body, a source)                a mouse or a pen is a drag once it travels DRAG_THRESHOLD_PX, and a press that does
//                                            not travel stays a press (its click goes through: the body opens); a finger lifts
//                                            the item after holding still for the hold time and then follows, while a finger that
//                                            moves sooner is a scroll and is let go at once, so the page and the box still scroll
//
// While a finger holds an item, scrolling is held back through `holdScroll` (a listener that is not passive, put on the parts
// beforehand, because a browser decides at the touch's start whether it may wait for one), and the long press's own menu is
// swallowed. Escape or a cancelled pointer puts the drag back; the click a drag's release makes is swallowed.

import { DRAG_THRESHOLD_PX, TOUCH_SLOP_PX } from './constants.js';

/**
 * What a press tells its owner.
 * @typedef {object} PressHandlers
 * @property {'now' | 'hold'} mode
 * @property {number} holdMs how long a finger holds still before it lifts (the `hold` mode)
 * @property {Element} capture the element that takes the pointer once the press is a drag
 * @property {(e: PointerEvent) => boolean} start the press is a drag from here; false refuses it (nothing moves)
 * @property {(e: PointerEvent) => void} move a step of the drag
 * @property {(how: 'drop' | 'back', e: PointerEvent | null) => void} end let go (`drop`), or put back (`back`: Escape, cancelled)
 * @property {() => void} [lift] a finger held still long enough: the item is lifted and the next move drags it
 */

/** Whether a finger is holding a lifted item now, so the touch listeners hold the scroll back. */
let holding = false;

/** Hold back the scroll of a touch that lifted an item. Put on an element before any touch starts on it. @param {EventTarget} el */
export function holdScroll(el) {
    const stop = (/** @type {Event} */ e) => {
        if (holding && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
}

/** Swallow the click a drag's release makes (it lands on what was pressed), once; a browser that makes none (the pointer was
 * captured) leaves it to the next press or a moment later to stand down, so that press's own click is never eaten. @param {Document} doc */
function swallowClick(doc) {
    const win = doc.defaultView;
    if (!win) return;
    const eat = (/** @type {Event} */ e) => {
        e.preventDefault();
        e.stopPropagation();
        done();
    };
    const done = () => {
        win.removeEventListener('click', eat, true);
        win.removeEventListener('pointerdown', done, true);
    };
    win.addEventListener('click', eat, true);
    win.addEventListener('pointerdown', done, true);
    setTimeout(done, 400);
}

/**
 * Follow one press. Its listeners go when it ends.
 * @param {PointerEvent} down
 * @param {PressHandlers} h
 */
export function followPress(down, h) {
    const doc = /** @type {Document} */ (/** @type {Node} */ (down.target).ownerDocument);
    const finger = down.pointerType === 'touch';
    /** @type {'pending' | 'lifted' | 'dragging'} */
    let phase = 'pending';
    let timer = /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined);
    const off = () => {
        clearTimeout(timer);
        holding = false;
        doc.removeEventListener('pointermove', onMove);
        doc.removeEventListener('pointerup', onUp);
        doc.removeEventListener('pointercancel', onCancel);
        doc.removeEventListener('keydown', onKey, true);
        doc.removeEventListener('contextmenu', onMenu, true);
    };
    const begin = (/** @type {PointerEvent} */ e) => {
        if (!h.start(e)) return void off();
        phase = 'dragging';
        holding = finger;
        try {
            h.capture.setPointerCapture(down.pointerId);
        } catch {
            // The pointer is already gone (released between the events): the up that follows ends the drag.
        }
        h.move(e);
    };
    const onMove = (/** @type {PointerEvent} */ e) => {
        if (e.pointerId !== down.pointerId) return;
        const travel = Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY);
        if (phase === 'dragging') return void h.move(e);
        if (phase === 'lifted') return void begin(e);
        const waits = finger && h.mode === 'hold';
        if (waits && travel > TOUCH_SLOP_PX) return void off();
        if (!waits && travel >= DRAG_THRESHOLD_PX) begin(e);
    };
    const onUp = (/** @type {PointerEvent} */ e) => {
        if (e.pointerId !== down.pointerId) return;
        const was = phase;
        off();
        if (was === 'dragging') h.end('drop', e);
        else if (was === 'lifted') h.end('back', e);
        if (was !== 'pending') swallowClick(doc);
    };
    const onCancel = (/** @type {PointerEvent} */ e) => {
        if (e.pointerId !== down.pointerId) return;
        const was = phase;
        off();
        if (was !== 'pending') h.end('back', null);
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
        if (e.key !== 'Escape' || phase === 'pending') return;
        e.preventDefault();
        e.stopPropagation();
        off();
        h.end('back', null);
        swallowClick(doc);
    };
    const onMenu = (/** @type {Event} */ e) => {
        if (!finger) return;
        e.preventDefault();
        e.stopPropagation();
    };
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onUp);
    doc.addEventListener('pointercancel', onCancel);
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('contextmenu', onMenu, true);
    if (finger && h.mode === 'hold') {
        timer = setTimeout(() => {
            if (phase !== 'pending') return;
            phase = 'lifted';
            holding = true;
            h.lift?.();
        }, h.holdMs);
    }
}
