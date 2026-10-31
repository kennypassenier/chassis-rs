// The pointer light of js/effects/pointer.js [scope-101, built from scope-25]: the shade pair's half of the pointer bus.
//
// Where the bus writes one pair of numbers for the whole page, this writes six per LIT ELEMENT, because a shade falls away
// from the pointer and "away" is a different direction for every box on the screen. Deliberately NOT a second bus: it is armed
// by the same `--kp-pointer: track` declaration, fed by the bus's one `pointermove` listener and written inside the same
// animation frame. What it adds of its own are the four ways the light goes OUT (a touch, a Tab, the pointer leaving the
// window, and reduced motion) plus a scroll listener, because a box that moves under a still pointer has turned relative to
// it. Every value is the research demo's own arithmetic, unchanged.

import { LIGHT_KNOB, LIGHT, LIGHT_SELECTOR, LIGHT_REACH, LIGHT_FAR } from '../effects.js';

/** @typedef {import('../effects.js').EffectsContext} EffectsContext */

/** The demo's own arithmetic: the shade's strength over distance, the lift at no distance, and the decimals written. */
const SHADE_GAIN = 1.4;
const BASE_LIFT = 0.6;
const DIGITS = 3;

/** @param {HTMLElement} el */
function clear(el) {
    for (const prop of Object.values(LIGHT)) el.style.removeProperty(prop);
}

export class PointerLight {
    /** @param {EffectsContext} ctx @param {Window} view */
    constructor(ctx, view) {
        this.ctx = ctx;
        this.view = view;
        /** The elements this theme lights. @type {HTMLElement[]} */
        this.lit = [];
        /** Where the pointer is, or null when the light is out. @type {{ x: number, y: number } | null} */
        this.at = null;
        /** The frame that rebuilds the list after a theme change, and the frame that paints, or 0. */
        this.recollect = 0;
        this.queued = 0;
    }

    /** Wire the ways out and the theme watch, and build the list. @param {(undo: () => void) => void} own */
    connect(own) {
        const { doc, html } = this.ctx;
        const { view } = this;
        const onDown = (/** @type {Event} */ event) => {
            if (/** @type {PointerEvent} */ (event).pointerType === 'touch') this.away();
        };
        const onKey = (/** @type {Event} */ event) => {
            if (/** @type {KeyboardEvent} */ (event).key === 'Tab') this.away();
        };
        const away = () => this.away();
        const schedule = () => this.schedule();
        // A theme change re-answers the knob: the list is built again one frame later, when the new register's cascade has settled.
        const themes = new MutationObserver(() => this.onTheme());
        themes.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
        doc.addEventListener('pointerdown', onDown, { passive: true });
        doc.addEventListener('keydown', onKey, { passive: true });
        html.addEventListener('pointerleave', away, { passive: true });
        view.addEventListener('scroll', schedule, { passive: true });
        own(() => {
            themes.disconnect();
            doc.removeEventListener('pointerdown', onDown);
            doc.removeEventListener('keydown', onKey);
            html.removeEventListener('pointerleave', away);
            view.removeEventListener('scroll', schedule);
            // The way out [KT6]: what the module wrote, the module removes, and the register's own fallbacks take over again.
            for (const el of this.lit) clear(el);
            this.lit = [];
        });
        this.collect();
        return this;
    }

    /**
     * Which elements this theme lights is the theme's own answer, read from the cascade rather than hard-coded here: a
     * register that never declares `--kp-light: pointer` gets an empty list and the frame does nothing at all.
     */
    collect() {
        for (const el of this.lit) clear(el);
        this.lit = /** @type {HTMLElement[]} */ ([...this.ctx.root.querySelectorAll(LIGHT_SELECTOR)]).filter(
            (el) => this.view.getComputedStyle(el).getPropertyValue(LIGHT_KNOB).trim() === 'pointer',
        );
    }

    paint() {
        const here = this.at;
        if (!here || this.ctx.reduced()) {
            for (const el of this.lit) clear(el);
            return;
        }
        for (const el of this.lit) this.paintOne(el, here);
    }

    /** @param {HTMLElement} el @param {{ x: number, y: number }} here */
    paintOne(el, here) {
        const box = el.getBoundingClientRect();
        // Off screen: nothing to light, and one getBoundingClientRect is cheaper than six style writes.
        if (box.bottom < 0 || box.top > this.view.innerHeight) {
            clear(el);
            return;
        }
        const dx = box.left + box.width / 2 - here.x;
        const dy = box.top + box.height / 2 - here.y;
        const distance = Math.hypot(dx, dy);
        const k = SHADE_GAIN / Math.max(distance, LIGHT_REACH);
        const near = 1 - Math.min(distance / LIGHT_FAR, 1);
        el.style.setProperty(LIGHT.x, (dx * k).toFixed(DIGITS));
        el.style.setProperty(LIGHT.y, (dy * k).toFixed(DIGITS));
        el.style.setProperty(LIGHT.near, near.toFixed(DIGITS));
        el.style.setProperty(LIGHT.lift, (BASE_LIFT + near).toFixed(DIGITS));
        el.style.setProperty(LIGHT.atX, `${Math.round(here.x - box.left)}px`);
        el.style.setProperty(LIGHT.atY, `${Math.round(here.y - box.top)}px`);
    }

    /** Paint in the next frame, once however often it is asked. */
    schedule() {
        const { frames } = this.ctx;
        if (this.queued) return;
        this.queued = this.view.requestAnimationFrame(() => {
            frames.delete(this.queued);
            this.queued = 0;
            this.paint();
        });
        frames.add(this.queued);
    }

    onTheme() {
        const { frames } = this.ctx;
        if (this.recollect) return;
        this.recollect = this.view.requestAnimationFrame(() => {
            frames.delete(this.recollect);
            this.recollect = 0;
            this.collect();
            this.paint();
        });
        frames.add(this.recollect);
    }

    away() {
        this.at = null;
        this.schedule();
    }

    /** The pointer moved: light from where it is, or go out for a touch. @param {PointerEvent | MouseEvent} event */
    put(event) {
        this.at = 'pointerType' in event && event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY };
        this.paint();
    }
}
