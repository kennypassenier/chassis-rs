// The marquee hook of js/effects.js, in a module of its own [scope-117].
//
// Cut out of attachEffects() line for line, so a page that never asks for it
// never downloads it: js/effects.js fetches this the first time an element or
// a theme knob needs it. What it shared with the rest of the closure arrives
// through `ctx`; the four variables every part writes are `ctx.state`.

import { HOOKS, MARQUEE_PAUSE_KNOB } from '../effects.js';

/** @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    const { doc, view, rootStyle, cleanups, root } = ctx;
    // ── The marquee [M1, M2]: a row that runs ──────────────────────────
    // The consumer writes the items once; a seamless loop needs the row
    // twice, so the module builds the track, moves the items into the
    // first run and clones it into a second the screen reader skips. The
    // attributes it writes are what the base layer keys on, so a page
    // without this module shows the items standing still rather than a
    // half-built band [T17, AR34].
    const marquee = () => {
        for (const band of root.querySelectorAll(`[${HOOKS.marquee}]`)) {
            if (band.hasAttribute('data-kp-marquee-ready')) continue;
            const items = [...band.childNodes];
            if (items.length === 0) continue;
            const track = doc.createElement('div');
            track.setAttribute('data-kp-marquee-track', '');
            const run = doc.createElement('div');
            run.setAttribute('data-kp-marquee-run', '');
            run.append(...items);
            const copy = /** @type {HTMLElement} */ (run.cloneNode(true));
            copy.setAttribute('aria-hidden', 'true');
            track.append(run, copy);
            band.append(track);
            band.setAttribute('data-kp-marquee-ready', '');
            // Two runs, so the -50% pass lands exactly where it started.
            band.setAttribute('data-kp-marquee-runs', '2');

            const pause = (rootStyle ? rootStyle.getPropertyValue(MARQUEE_PAUSE_KNOB).trim() : '') || 'offscreen';
            if (pause !== 'offscreen' || !view || !('IntersectionObserver' in view)) continue;
            // Paused, not stopped: the animation keeps its position and
            // carries on from it when the band comes back into view.
            const observer = new view.IntersectionObserver(
                (/** @type {IntersectionObserverEntry[]} */ entries) => {
                    for (const entry of entries) entry.target.toggleAttribute('data-kp-paused', !entry.isIntersecting);
                },
                { threshold: 0 },
            );
            observer.observe(band);
            cleanups.push(() => observer.disconnect());
        }
    };
    return { marquee };
}
