// The caret hook of js/effects.js, in a module of its own [scope-117].
//
// Cut out of attachEffects() line for line, so a page that never asks for it
// never downloads it: js/effects.js fetches this the first time an element or
// a theme knob needs it. What it shared with the rest of the closure arrives
// through `ctx`; the four variables every part writes are `ctx.state`.

import { CARET_KNOB } from '../effects.js';

/** @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    const { root, doc, view, rootStyle, cleanups, carets } = ctx;
    // ── The caret [TM2, R6-Q7]: a block cursor inside the focused field ─
    // A theme answers `--kp-caret: block` on the root; the module only
    // writes the column (`--kp-col`, in the field's own ch, clamped to the
    // field's width) that the register paints the block at, so the cursor
    // lives in the box at the caret and never after the label — Kenny's
    // reading of 2026-09-08. Text-like inputs only; a textarea keeps the
    // browser's own caret.
    const caret = () => {
        const routine = rootStyle ? rootStyle.getPropertyValue(CARET_KNOB).trim() : '';
        if (routine !== 'block' || !view) return;
        const inputs = /** @type {HTMLInputElement[]} */ ([...root.querySelectorAll('input.kp-field__input')]).filter((el) =>
            /^(text|email|search|url|tel|password)?$/.test(el.getAttribute('type') ?? ''),
        );
        for (const input of inputs) {
            // One set of listeners per field, however often the module is
            // attached [G16]: a consumer that calls attachEffects twice —
            // a framework remount, an explicit re-scan — used to give
            // every field a second caret handler.
            if (carets.has(input)) continue;
            carets.add(input);
            const put = () => {
                if (!view) return;
                const cs = view.getComputedStyle(input);
                const probe = doc.createElement('span');
                probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
                probe.style.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
                probe.textContent = '0'.repeat(20);
                doc.body?.append(probe);
                const ch = probe.getBoundingClientRect().width / 20 || 8;
                probe.remove();
                const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                const max = Math.max(0, Math.floor(room / ch) - 1);
                const col = Math.min(input.selectionStart ?? input.value.length, max);
                input.style.setProperty('--kp-col', String(col));
            };
            const clear = () => input.style.removeProperty('--kp-col');
            const events = ['input', 'keyup', 'click', 'focus', 'select'];
            for (const ev of events) input.addEventListener(ev, put);
            input.addEventListener('blur', clear);
            cleanups.push(() => {
                for (const ev of events) input.removeEventListener(ev, put);
                input.removeEventListener('blur', clear);
                clear();
            });
        }
    };
    return { caret };
}
