// The marquee hook of js/effects.js, in a module of its own [scope-117].
//
// Fetched the first time a band needs it, so a page that never asks for it never downloads it. What it shares with the rest
// of the attach arrives through `ctx`. The hook is a MarqueeHook, one per attach (closure-pattern B, js/effects-core/hook.js).

import { HOOKS, MARQUEE_PAUSE_KNOB } from '../effects.js';
import { EffectHook } from '../effects-core/hook.js';

/** How many copies of the row a seamless loop needs: the -50% pass lands exactly where it started. */
const RUNS = 2;

/**
 * The marquee [M1, M2]: a row that runs. The consumer writes the items once; a seamless loop needs the row twice, so the
 * module builds the track, moves the items into the first run and clones it into a second the screen reader skips. The
 * attributes it writes are what the base layer keys on, so a page without this module shows the items standing still rather
 * than a half-built band [T17, AR34].
 */
class MarqueeHook extends EffectHook {
    marquee() {
        for (const band of this.ctx.root.querySelectorAll(`[${HOOKS.marquee}]`)) {
            if (band.hasAttribute('data-kp-marquee-ready')) continue;
            if (band.childNodes.length === 0) continue;
            this.build(band);
            this.pauseOffscreen(band);
        }
    }

    /** Move the band's items into a run, clone it, and mark the band ready. @param {Element} band */
    build(band) {
        const { doc } = this.ctx;
        const track = doc.createElement('div');
        track.setAttribute('data-kp-marquee-track', '');
        const run = doc.createElement('div');
        run.setAttribute('data-kp-marquee-run', '');
        run.append(...band.childNodes);
        const copy = /** @type {HTMLElement} */ (run.cloneNode(true));
        copy.setAttribute('aria-hidden', 'true');
        track.append(run, copy);
        band.append(track);
        band.setAttribute('data-kp-marquee-ready', '');
        band.setAttribute('data-kp-marquee-runs', String(RUNS));
    }

    /** Paused, not stopped, while off screen: the animation keeps its position and carries on from it. @param {Element} band */
    pauseOffscreen(band) {
        const { view, rootStyle } = this.ctx;
        const pause = (rootStyle ? rootStyle.getPropertyValue(MARQUEE_PAUSE_KNOB).trim() : '') || 'offscreen';
        if (pause !== 'offscreen' || !view || !('IntersectionObserver' in view)) return;
        const observer = new view.IntersectionObserver(
            (/** @type {IntersectionObserverEntry[]} */ entries) => {
                for (const entry of entries) entry.target.toggleAttribute('data-kp-paused', !entry.isIntersecting);
            },
            { threshold: 0 },
        );
        observer.observe(band);
        this.own(() => observer.disconnect());
    }
}

/** Make the marquee hook of one attach. @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    return new MarqueeHook(ctx).connect();
}
