// The pointer hook of js/effects.js, in a module of its own [scope-117].
//
// Fetched the first time a theme asks for the pointer or the press bus, so a theme that declares neither never downloads it.
// What it shares with the rest of the attach arrives through `ctx`. The hook is a PointerHook, one per attach, over a
// PointerBus, its PointerLight (pointer-light.js) and a PressBus (press-bus.js) (closure-pattern B, js/effects-core/hook.js).

import { POINTER_KNOB, POINTER, PRESS_KNOB } from '../effects.js';
import { EffectHook } from '../effects-core/hook.js';
import { PointerLight } from './pointer-light.js';
import { PressBus } from './press-bus.js';

/** The press styles the press bus answers. */
const PRESS_STYLES = ['point', 'size', 'hold'];

/**
 * The pointer bus [scope-16]: one listener on the document, one write per animation frame. It writes to the root rather than
 * to each element, because the demo's gradient is declared once on the theme and inherited: every surface that paints the
 * oxide reads the same two numbers, so they must be one pair, not one pair per element.
 */
class PointerBus {
    /** @param {import('../effects.js').EffectsContext} ctx @param {Window} view @param {PointerLight | null} light */
    constructor(ctx, view, light) {
        this.ctx = ctx;
        this.view = view;
        this.light = light;
        /** The frame asked for, or 0. */
        this.frame = 0;
    }

    /** @param {(undo: () => void) => void} own */
    connect(own) {
        const { doc, html } = this.ctx;
        const onMove = (/** @type {Event} */ event) => this.onMove(/** @type {PointerEvent} */ (event));
        doc.addEventListener('pointermove', onMove, { passive: true });
        own(() => {
            doc.removeEventListener('pointermove', onMove);
            // The way out [KT6]: what the module wrote, the module removes, and the stylesheet's own declared value takes over again.
            html.style.removeProperty(POINTER.x);
            html.style.removeProperty(POINTER.y);
        });
    }

    /** @param {PointerEvent | MouseEvent} event */
    onMove(event) {
        const { view } = this;
        const { html, frames } = this.ctx;
        if (this.frame) return;
        this.frame = view.requestAnimationFrame(() => {
            frames.delete(this.frame);
            this.frame = 0;
            const w = view.innerWidth || 1;
            const h = view.innerHeight || 1;
            html.style.setProperty(POINTER.x, String(Math.min(1, Math.max(0, event.clientX / w))));
            html.style.setProperty(POINTER.y, String(Math.min(1, Math.max(0, event.clientY / h))));
            this.light?.put(event);
        });
        frames.add(this.frame);
    }
}

class PointerHook extends EffectHook {
    /** The pointer light of this attach, or null when there is no window to light. */
    pointerLight() {
        const { view } = this.ctx;
        if (!view) return null;
        return new PointerLight(this.ctx, view).connect((undo) => this.own(undo));
    }

    pointerBus() {
        const { view, reduced, rootStyle } = this.ctx;
        const routine = rootStyle ? rootStyle.getPropertyValue(POINTER_KNOB).trim() : '';
        if (routine !== 'track' || !view || reduced()) return;
        new PointerBus(this.ctx, view, this.pointerLight()).connect((undo) => this.own(undo));
    }

    pressBus() {
        const { view, rootStyle } = this.ctx;
        const asked = rootStyle ? rootStyle.getPropertyValue(PRESS_KNOB).trim() : '';
        if (!PRESS_STYLES.includes(asked) || !view) return;
        new PressBus(this.ctx).connect((undo) => this.own(undo));
    }
}

/** Make the pointer hook of one attach. @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    return new PointerHook(ctx).connect();
}
