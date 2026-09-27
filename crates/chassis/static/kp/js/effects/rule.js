// The rule hook of js/effects.js, in a module of its own [scope-117].
//
// Cut out of attachEffects() line for line, so a page that never asks for it
// never downloads it: js/effects.js fetches this the first time an element or
// a theme knob needs it. What it shared with the rest of the closure arrives
// through `ctx`; the four variables every part writes are `ctx.state`.

import { STATE } from '../effects.js';

/** @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    const { state, view, reduced, cfg, finishers, done, announce, routineOf, seen } = ctx;
    // ── The rule: drawn when its heading enters the viewport [TH122] ───
    /** @param {Element} el */
    const rule = (el) => {
        const routine = routineOf(el, 'rule');
        /** @param {boolean} skipped */
        const draw = (skipped) => {
            el.classList.add(STATE.in);
            announce(el, 'rule', routine, skipped);
        };
        if (routine === '' || reduced() || seen(el, 'rule') || !view || typeof view.IntersectionObserver !== 'function') {
            draw(true);
            return;
        }
        state.pending++;
        finishers.push(() => draw(false));
        state.io ??= new view.IntersectionObserver(
            (/** @type {IntersectionObserverEntry[]} */ entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    state.io?.unobserve(entry.target);
                    entry.target.classList.add(STATE.in);
                    announce(entry.target, 'rule', routine, false);
                    state.pending--;
                    done();
                }
            },
            { threshold: cfg.threshold },
        );
        state.io?.observe(el);
    };
    return { rule };
}
