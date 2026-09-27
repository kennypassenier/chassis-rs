// The measure hook of js/effects.js, in a module of its own [scope-117].
//
// Cut out of attachEffects() line for line, so a page that never asks for it
// never downloads it: js/effects.js fetches this the first time an element or
// a theme knob needs it. What it shared with the rest of the closure arrives
// through `ctx`; the four variables every part writes are `ctx.state`.

import { HOOKS, MEASURE_KNOB } from '../effects.js';
import { getStrings } from '../strings.js';

/** @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    const { root, doc, view, rootStyle, cleanups } = ctx;
    // ── The measurement frame [scope-18]: blueprint's own ─────────────
    // A theme answers `--kp-measure: live` on the root. The module wraps
    // its headline in a span it can measure and puts four corner brackets
    // around that box with one readout under it, printing the box's true
    // rendered size.
    //
    // It replaced two dimension lines on 2026-09-11. Kenny had asked for
    // those in round four — "replace it entirely with our measurement
    // lines" — and then saw the command-table demo's brackets and found
    // them better: "dan is de demo hier niet voor niks geweest" (scope-18).
    // The brackets report the box they hold rather than one edge of it,
    // which is why one readout replaces two labels.
    //
    // Runs once, after scan() has already put the headline at its rest
    // text, so nothing here fights the decipher/type/word routines for the
    // same child nodes.
    const measure = () => {
        const routine = rootStyle ? rootStyle.getPropertyValue(MEASURE_KNOB).trim() : '';
        if (routine !== 'live' || !view) return;
        const words = getStrings();
        const headlines = [...root.querySelectorAll(`[${HOOKS.reveal}='headline']`)].filter((h) => !h.closest('[data-kp-measured]'));
        for (const h1 of headlines) {
            const wrap = doc.createElement('span');
            wrap.setAttribute('data-kp-measured', '');
            h1.replaceWith(wrap);
            wrap.append(h1);

            for (const corner of ['tl', 'tr', 'bl', 'br']) {
                const bracket = doc.createElement('i');
                bracket.setAttribute('data-kp-measure-bracket', corner);
                bracket.setAttribute('aria-hidden', 'true');
                wrap.append(bracket);
            }

            const readout = doc.createElement('span');
            readout.setAttribute('data-kp-measure', '');
            readout.setAttribute('aria-hidden', 'true');
            readout.textContent = words.measureLoading;
            wrap.append(readout);

            /** @type {ReturnType<typeof setTimeout>} */
            let timer;
            const update = () => {
                const box = h1.getBoundingClientRect();
                readout.textContent = words.measureBox(Math.round(box.width), Math.round(box.height));
                // The state a test or a consumer can read at any time, rather
                // than a moment they had to be listening for [KT16].
                wrap.setAttribute('data-kp-measured', 'live');
            };
            update();
            const schedule = () => {
                clearTimeout(timer);
                timer = setTimeout(update, 100);
            };
            view.addEventListener('resize', schedule);
            cleanups.push(() => {
                clearTimeout(timer);
                view?.removeEventListener('resize', schedule);
            });
            try {
                if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(update);
            } catch {
                // no font-loading API: the load-time measurement stands
            }
        }
    };
    return { measure };
}
