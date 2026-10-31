// The press point of js/effects/pointer.js [scope-101]: one delegated listener, one write per press, and nothing at all
// unless the theme asked for it. It writes to the button rather than to the root, because every button on the page has a
// press point of its own and the last one pressed must keep its stain while the next one grows.

import { PRESS_KNOB, PRESS, PRESS_SIZE, PRESS_HOLD, PRESS_HELD, PRESS_HOLD_MS } from '../effects.js';

/** @typedef {import('../effects.js').EffectsContext} EffectsContext */

/** What a press can land on. */
const PRESSED = '.kp-button, .kp-icon-button';

/** @param {Event} event @returns {HTMLElement | null} */
function pressed(event) {
    const target = event.target;
    return target instanceof Element ? /** @type {HTMLElement | null} */ (target.closest(PRESSED)) : null;
}

/** @param {string} key */
const isPress = (key) => key === ' ' || key === 'Enter';

export class PressBus {
    /** @param {EffectsContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        /** The elements this bus has written to, so it can take it all back [KT6]. @type {Set<HTMLElement>} */
        this.marked = new Set();
        /** The held presses and the timer that lets each go. @type {Map<HTMLElement, number>} */
        this.holding = new Map();
    }

    /** The theme answers per press, not once: a page can change theme after the bus is armed. */
    asked() {
        const { rootStyle } = this.ctx;
        return rootStyle ? rootStyle.getPropertyValue(PRESS_KNOB).trim() : '';
    }

    /** @param {(undo: () => void) => void} own */
    connect(own) {
        const { doc } = this.ctx;
        const onDown = (/** @type {Event} */ event) => this.onDown(event);
        const onKey = (/** @type {Event} */ event) => this.onKey(event);
        doc.addEventListener('pointerdown', onDown, { passive: true });
        doc.addEventListener('keydown', onKey);
        own(() => {
            doc.removeEventListener('pointerdown', onDown);
            doc.removeEventListener('keydown', onKey);
            this.takeBack();
        });
    }

    /** Remove every mark and every hold this bus wrote [KT6]. */
    takeBack() {
        for (const el of this.marked) {
            el.style.removeProperty(PRESS.x);
            el.style.removeProperty(PRESS.y);
            el.removeAttribute(PRESS_SIZE);
        }
        this.marked.clear();
        for (const [el, timer] of this.holding) {
            window.clearTimeout(timer);
            el.removeAttribute('data-kp-pressed');
        }
        this.holding.clear();
    }

    /**
     * `--kp-press: hold`: a press a stylesheet plays as an animation on `:active` is cut where the finger lifts, so a quick tap
     * shows part of it. The press is marked for the time the animation takes (`--kp-press-hold`, else PRESS_HOLD_MS) and the
     * register keys the same animation on the mark as well as on `:active`.
     * @param {Event} event
     */
    hold(event) {
        const target = event.target;
        const el = target instanceof Element ? /** @type {HTMLElement | null} */ (target.closest(PRESS_HELD)) : null;
        if (!el) return;
        const given = parseFloat(getComputedStyle(el).getPropertyValue(PRESS_HOLD));
        const ms = Number.isFinite(given) && given > 0 ? given : PRESS_HOLD_MS;
        window.clearTimeout(this.holding.get(el));
        el.setAttribute('data-kp-pressed', '');
        const timer = window.setTimeout(() => {
            el.removeAttribute('data-kp-pressed');
            this.holding.delete(el);
        }, ms);
        this.holding.set(el, timer);
    }

    /** A theme that letters its buttons gets each one's width. @param {HTMLElement} el */
    letter(el) {
        el.setAttribute(PRESS_SIZE, String(Math.round(el.getBoundingClientRect().width)));
        this.marked.add(el);
    }

    /** @param {Event} event */
    onDown(event) {
        const pointer = /** @type {PointerEvent} */ (event);
        if (this.asked() === 'hold') return this.hold(event);
        const el = pressed(event);
        if (!el) return;
        if (this.asked() === 'size') return this.letter(el);
        const button = el.closest('.kp-button');
        if (this.asked() !== 'point' || !(button instanceof HTMLElement)) return;
        const box = button.getBoundingClientRect();
        button.style.setProperty(PRESS.x, `${Math.round(pointer.clientX - box.left)}px`);
        button.style.setProperty(PRESS.y, `${Math.round(pointer.clientY - box.top)}px`);
        this.marked.add(button);
    }

    /**
     * A key press has no point: the stylesheet's own default takes over again, which puts the stain in the middle of the
     * button. It has a size all the same, so a theme that letters it gets it.
     * @param {Event} event
     */
    onKey(event) {
        const keyboard = /** @type {KeyboardEvent} */ (event);
        if (this.asked() === 'hold') return isPress(keyboard.key) && !keyboard.repeat ? this.hold(event) : undefined;
        const el = pressed(event);
        if (!el || !isPress(keyboard.key)) return;
        if (this.asked() === 'size') return this.letter(el);
        const button = el.closest('.kp-button');
        if (this.asked() !== 'point' || !(button instanceof HTMLElement)) return;
        button.style.removeProperty(PRESS.x);
        button.style.removeProperty(PRESS.y);
        this.marked.delete(button);
    }
}
