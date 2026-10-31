// The caret hook of js/effects.js, in a module of its own [scope-117].
//
// Fetched the first time a theme asks for it, so a page that never asks for it never downloads it. What it shares with the
// rest of the attach arrives through `ctx`. The hook is a CaretHook, one per attach (closure-pattern B,
// js/effects-core/hook.js).

import { CARET_KNOB } from '../effects.js';
import { EffectHook } from '../effects-core/hook.js';

/** The input types that get the block caret; a textarea keeps the browser's own. */
const TEXT_LIKE = /^(text|email|search|url|tel|password)?$/;
/** The events after which the caret may have moved. */
const MOVES = ['input', 'keyup', 'click', 'focus', 'select'];
/** How many zeros the probe measures one `ch` over, and the `ch` used when the probe measures nothing (px). */
const PROBE_DIGITS = 20;
const FALLBACK_CH = 8;

/**
 * The caret [TM2, R6-Q7]: a block cursor inside the focused field. A theme answers `--kp-caret: block` on the root; the
 * module only writes the column (`--kp-col`, in the field's own ch, clamped to the field's width) that the register paints
 * the block at, so the cursor lives in the box at the caret and never after the label (Kenny's reading of 2026-09-08).
 */
class CaretHook extends EffectHook {
    caret() {
        const { root, view, rootStyle, carets } = this.ctx;
        const routine = rootStyle ? rootStyle.getPropertyValue(CARET_KNOB).trim() : '';
        if (routine !== 'block' || !view) return;
        const inputs = /** @type {HTMLInputElement[]} */ ([...root.querySelectorAll('input.kp-field__input')]).filter((el) =>
            TEXT_LIKE.test(el.getAttribute('type') ?? ''),
        );
        for (const input of inputs) {
            // One set of listeners per field, however often the module is attached [G16]: a consumer that calls attachEffects
            // twice (a framework remount, an explicit re-scan) used to give every field a second caret handler.
            if (carets.has(input)) continue;
            carets.add(input);
            this.wire(input);
        }
    }

    /** @param {HTMLInputElement} input */
    wire(input) {
        const put = () => this.put(input);
        const clear = () => input.style.removeProperty('--kp-col');
        for (const ev of MOVES) input.addEventListener(ev, put);
        input.addEventListener('blur', clear);
        this.own(() => {
            for (const ev of MOVES) input.removeEventListener(ev, put);
            input.removeEventListener('blur', clear);
            clear();
        });
    }

    /** Write the caret's column, measured in the field's own font. @param {HTMLInputElement} input */
    put(input) {
        const { doc, view } = this.ctx;
        if (!view) return;
        const cs = view.getComputedStyle(input);
        const probe = doc.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
        probe.style.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
        probe.textContent = '0'.repeat(PROBE_DIGITS);
        doc.body?.append(probe);
        const ch = probe.getBoundingClientRect().width / PROBE_DIGITS || FALLBACK_CH;
        probe.remove();
        const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const max = Math.max(0, Math.floor(room / ch) - 1);
        const col = Math.min(input.selectionStart ?? input.value.length, max);
        input.style.setProperty('--kp-col', String(col));
    }
}

/** Make the caret hook of one attach. @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    return new CaretHook(ctx).connect();
}
