// The headline routines that are not one class and one keyframe: the tracking wipe and shine, the draw, the arrive and the ink.

import { STATE, TIMINGS } from '../effects.js';

/** @typedef {import('./headline-run.js').HeadlineRun} HeadlineRun */

/** How long past a keyframe's own duration a routine waits for its end before it finishes by the clock [ms]. */
export const END_GRACE_MS = 50;
/** How long the arrive routine holds the element after the two frames [ms], and how long the ink transition runs [ms]. */
const ARRIVE_HOLD_MS = 500;
const INK_MS = 1050;

/**
 * The synthwave headline [SW2]: the text stays whole; one tracking wipe crosses it, then one shine. The register animates the
 * classes; without an animation the classes come off by the table's durations, so nothing waits on an event that never comes.
 * @param {HeadlineRun} run
 */
export function tracking(run) {
    const { ctx, el } = run;
    ctx.state.pending++;
    const shine = run.once(() => {
        el.classList.remove(STATE.tracking);
        el.classList.add(STATE.shine);
        const off = () => el.classList.remove(STATE.shine);
        el.addEventListener('animationend', off, { once: true });
        ctx.later(off, TIMINGS['kp-shine'].durationMs + END_GRACE_MS);
    });
    el.classList.add(STATE.tracking);
    run.whenHeard('animationend', shine, (e) => /** @type {AnimationEvent} */ (e).animationName === 'kp-tracking');
    ctx.later(shine, TIMINGS['kp-tracking'].durationMs + END_GRACE_MS);
}

/**
 * The academia headline [lift row 10]: the words are never touched — no noise, no split into words. A rule beneath the
 * heading grows in once it enters the viewport, the exact mechanism `rule()` already performs, generalised to h1 because the
 * approved demo drives both off one IntersectionObserver and one class ("The Reading Room", 2026-09-08). The register paints
 * the draw; this only watches and flips the class.
 * @param {HeadlineRun} run
 */
export function draw(run) {
    const { ctx, el, routine } = run;
    const { state, view, cfg, announce, done, finishers } = ctx;
    if (!view || typeof view.IntersectionObserver !== 'function') {
        el.classList.add(STATE.in);
        announce(el, 'headline', routine, true);
        return;
    }
    state.pending++;
    finishers.push(() => {
        el.classList.add(STATE.in);
        announce(el, 'headline', routine, false);
    });
    state.ioHeadline ??= new view.IntersectionObserver(
        (/** @type {IntersectionObserverEntry[]} */ entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                state.ioHeadline?.unobserve(entry.target);
                entry.target.classList.add(STATE.in);
                announce(entry.target, 'headline', routine, false);
                state.pending--;
                done();
            }
        },
        { threshold: cfg.threshold },
    );
    state.ioHeadline?.observe(el);
}

/**
 * The formal headline [S49, LIFT_PLAN row 16]: whole and untouched — this theme does not glitch or type, it commits. Nothing
 * here manipulates a character; the class the register reads (STATE.deciphered, same completion marker every routine sets) is
 * held off by one frame past the next, the same two-`requestAnimationFrame` technique the approved demo used itself, so the
 * browser paints the hidden state before a plain CSS transition (fade, rise) carries it to rest.
 * @param {HeadlineRun} run
 */
export function arrive(run) {
    const { ctx } = run;
    const { view } = ctx;
    ctx.state.pending++;
    const finish = run.once();
    const arm = () => ctx.later(finish, ARRIVE_HOLD_MS);
    if (view) view.requestAnimationFrame(() => view.requestAnimationFrame(arm));
    else arm();
}

/**
 * The Sepia headline (theme removed 2026-10-08) [S48, LIFT_PLAN row 9]: no per-word stagger — the whole line is one CSS
 * transition, a faint ghost of the ink colour settling to the full one, because this theme (anatomy.md) is "unhurried on
 * purpose". `settling` is transient like `dissolving`/`typing`: added, then removed once the transition has run, so a quiet
 * theme or reduced motion — which skip straight to `rest(true)` and never add it — render the plain, already-settled headline
 * rather than a permanent ghost. A transition, not a keyframe animation (the removed sepia register carried no `@keyframes`
 * for it, so it has no TIMINGS row).
 * @param {HeadlineRun} run
 */
export function ink(run) {
    const { ctx, el } = run;
    const { view } = ctx;
    ctx.state.pending++;
    el.classList.add(STATE.settling);
    const finish = run.once(() => el.classList.remove(STATE.settling));
    run.whenHeard('transitionend', finish, (e) => /** @type {TransitionEvent} */ (e).propertyName === 'filter' && e.target === el);
    // One frame at the ghost values, painted with `settling` on, before the class comes off and the transition it guards
    // carries the properties back to their plain, settled values over the next 1050ms — the demo's own
    // requestAnimationFrame, not a synchronous removal a browser could coalesce into the first paint and skip the transition for.
    const off = () => el.classList.remove(STATE.settling);
    if (view) view.requestAnimationFrame(off);
    else off();
    ctx.later(finish, INK_MS + END_GRACE_MS);
}
