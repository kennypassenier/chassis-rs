// The resize grip: drag, keys and reset.
//
// Resize by dragging [Kenny, 2026-10-13, from the libraries survey]. A handle on the edge that faces the content, inside the panel so
// it covers none of the page: a `separator` the pointer drags and the arrow keys move. It writes `--kp-sidenav-width`, the one knob
// the content's offset already reads, and keeps it when the panel remembers. The handle is not there in the collapsed rail.
import { getStrings } from '../strings.js';
import { OPTIONS } from './options.js';
import { RESIZE_MAX_WIDTH, RESIZE_MIN_WIDTH, RESIZE_SHIFT_STEPS, RESIZE_STEP, SIDENAV_RESIZER } from './constants.js';
import { SidenavNarrow } from './narrow.js';

export class SidenavResizer extends SidenavNarrow {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The handle, on a resizable panel. @type {HTMLElement | null} */
        this.grip = null;
        /** Whether the width on the panel was written here, so the detach takes it away. */
        this.wroteWidth = false;
        /** The panel's width with the pointer where the handle is held, so the handle does not jump. */
        this.gripOffset = 0;
        /** The panel's own transition, put back when the handle is let go. */
        this.heldTransition = '';
        /** The pointer holding the handle. @type {number | null} */
        this.held = null;
    }

    /** Make the handle on a panel that asks for one, start it at a painted width, and wire it. */
    setupResizer() {
        if (!this.on(OPTIONS.resizable, false)) return;
        const { panel } = this;
        const s = { ...getStrings(), ...this.strings };
        const grip = this.doc.createElement('div');
        grip.className = SIDENAV_RESIZER.slice(1);
        grip.setAttribute('role', 'separator');
        grip.setAttribute('aria-orientation', 'vertical');
        grip.setAttribute('aria-label', s.resizeSidebar);
        grip.setAttribute('aria-controls', panel.id);
        grip.tabIndex = 0;
        this.grip = grip;
        panel.append(grip);
        const painted = parseFloat(panel.style.getPropertyValue('--kp-sidenav-width'));
        if (Number.isFinite(painted)) this.setWidth(painted, false);
        else this.sayWidth();
        const up = (/** @type {Event} */ event) => this.onGripUp(/** @type {PointerEvent} */ (event));
        this.listen(grip, 'pointerdown', (event) => this.onGripDown(/** @type {PointerEvent} */ (event)));
        this.listen(grip, 'pointermove', (event) => this.onGripMove(/** @type {PointerEvent} */ (event)));
        this.listen(grip, 'pointerup', up);
        this.listen(grip, 'pointercancel', up);
        this.listen(grip, 'keydown', (event) => this.onGripKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(grip, 'dblclick', () => this.onGripReset());
    }

    /** A limit the panel names, in pixels; a length that does not resolve is the fallback. @param {string} name @param {string} fallback */
    limit(name, fallback) {
        const px = this.threshold(this.read(name) ?? fallback);
        return Number.isFinite(px) && px > 0 ? px : this.threshold(fallback);
    }

    minWidth() {
        return this.limit(OPTIONS.minWidth, RESIZE_MIN_WIDTH);
    }

    maxWidth() {
        return Math.max(this.minWidth(), this.limit(OPTIONS.maxWidth, RESIZE_MAX_WIDTH));
    }

    /** Whether the panel's growing side is to the right on screen. */
    startsAtLeft() {
        return (this.edge() === 'start') !== (getComputedStyle(this.panel).direction === 'rtl');
    }

    /** @param {number} px */
    clampWidth(px) {
        return Math.round(Math.min(this.maxWidth(), Math.max(this.minWidth(), px)));
    }

    sayWidth() {
        if (this.grip === null) return;
        this.grip.setAttribute('aria-valuemin', String(Math.round(this.minWidth())));
        this.grip.setAttribute('aria-valuemax', String(Math.round(this.maxWidth())));
        this.grip.setAttribute('aria-valuenow', String(Math.round(this.panel.getBoundingClientRect().width)));
    }

    /** @param {number} px @param {boolean} [save] */
    setWidth(px, save = true) {
        const next = this.clampWidth(px);
        this.panel.style.setProperty('--kp-sidenav-width', `${next}px`);
        this.wroteWidth = true;
        this.offsetContent(this.isOpen());
        this.sayWidth();
        if (save) this.memory?.write('width', next);
        return next;
    }

    /** @param {PointerEvent} event */
    pointerWidth(event) {
        const rect = this.panel.getBoundingClientRect();
        return this.startsAtLeft() ? event.clientX - rect.left : rect.right - event.clientX;
    }

    /** @param {PointerEvent} event */
    onGripDown(event) {
        if (this.grip === null || event.button !== 0) return;
        event.preventDefault();
        try {
            this.grip.setPointerCapture(event.pointerId);
        } catch {
            // A pointer the browser does not know (a scripted one): the moves still arrive on the handle.
        }
        this.held = event.pointerId;
        this.gripOffset = this.panel.getBoundingClientRect().width - this.pointerWidth(event);
        this.heldTransition = this.panel.style.transition;
        // The width follows the pointer, not a transition's catch-up.
        this.panel.style.transition = 'none';
        this.panel.setAttribute(OPTIONS.resizing, '');
    }

    /** @param {PointerEvent} event */
    onGripMove(event) {
        if (this.grip === null || this.held !== event.pointerId) return;
        this.setWidth(this.pointerWidth(event) + this.gripOffset, false);
    }

    /** @param {PointerEvent} event */
    onGripUp(event) {
        if (this.grip === null || this.held !== event.pointerId) return;
        this.held = null;
        if (this.grip.hasPointerCapture(event.pointerId)) this.grip.releasePointerCapture(event.pointerId);
        this.panel.style.transition = this.heldTransition;
        this.panel.removeAttribute(OPTIONS.resizing);
        this.memory?.write('width', this.clampWidth(this.panel.getBoundingClientRect().width));
    }

    /** @param {KeyboardEvent} event */
    onGripKey(event) {
        const grow = this.startsAtLeft() ? 'ArrowRight' : 'ArrowLeft';
        const shrink = this.startsAtLeft() ? 'ArrowLeft' : 'ArrowRight';
        const now = this.panel.getBoundingClientRect().width;
        const step = RESIZE_STEP * (event.shiftKey ? RESIZE_SHIFT_STEPS : 1);
        let next = null;
        if (event.key === grow) next = now + step;
        else if (event.key === shrink) next = now - step;
        else if (event.key === 'Home') next = this.minWidth();
        else if (event.key === 'End') next = this.maxWidth();
        if (next === null) return;
        event.preventDefault();
        const width = next;
        this.still(() => this.setWidth(width));
    }

    /** A double press gives the width back to the stylesheet's own. */
    onGripReset() {
        this.panel.style.removeProperty('--kp-sidenav-width');
        this.wroteWidth = false;
        this.memory?.forget('width');
        this.still(() => this.offsetContent(this.isOpen()));
        this.sayWidth();
    }

    /** Take the handle away, with the width written here. */
    undoGrip() {
        if (this.grip === null) return;
        this.grip.remove();
        this.grip = null;
        this.panel.removeAttribute(OPTIONS.resizing);
        if (this.wroteWidth) this.panel.style.removeProperty('--kp-sidenav-width');
    }

    /** Give the panel its own transition back when the handle was held at the detach. */
    undoHeld() {
        if (this.held !== null) this.panel.style.transition = this.heldTransition;
    }
}
