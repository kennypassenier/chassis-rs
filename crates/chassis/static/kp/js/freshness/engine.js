// The one ticking engine every attach shares: the repaint pass, the timer that follows the lines and the tab, adopting a line, setAgo().

import { resolveStrings } from '../strings.js';
import { FRESHNESS_TIME_ZONE, TICK_MS } from './values.js';
import { engine, live } from './state.js';
import { paint } from './paint.js';

/** @typedef {import('../freshness.js').AgoContext} AgoContext */

/** @returns {AgoContext} */
export const defaultContext = () => ({ timeZone: FRESHNESS_TIME_ZONE, now: () => Date.now(), overrides: undefined, owner: {} });

/** One pass over every line: no layout reads unless a unit changed. */
export function tick() {
    for (const [el, ctx] of live) if (el.isConnected) paint(el, ctx);
}

/** Start, keep or stop the one timer, as the page's lines and visibility ask. */
export function steer() {
    const doc = typeof document === 'undefined' ? null : document;
    const want = live.size > 0 && doc?.visibilityState !== 'hidden';
    if (want && engine.timer === null) engine.timer = setInterval(tick, TICK_MS);
    if (!want && engine.timer !== null) {
        clearInterval(engine.timer);
        engine.timer = null;
    }
}

export const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') tick();
    steer();
};

/**
 * Take a line into the ticking set and paint it at once.
 * @param {HTMLElement} el @param {AgoContext} ctx
 */
export function adopt(el, ctx) {
    if (!live.has(el)) {
        live.set(el, ctx);
        // Silenced for screen readers: the time changes every second.
        el.setAttribute('aria-live', 'off');
        const region = el.parentElement?.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [role="timer"]');
        if (region && !region.hasAttribute('data-kp-ago-voice') && !engine.warned) {
            engine.warned = true;
            console.warn(resolveStrings(ctx.overrides).agoInLiveRegion);
        }
    }
    paint(el, live.get(el) ?? ctx);
}

/**
 * Set a line's moment (ms since the epoch, or null for none) and repaint it
 * at once. The moment is written to `datetime` as ISO, for machines.
 * @param {HTMLElement} el
 * @param {number | null | undefined} ms
 */
export function setAgo(el, ms) {
    if (!el.hasAttribute('data-kp-ago')) el.setAttribute('data-kp-ago', '');
    else if (el.getAttribute('data-kp-ago') !== '') el.setAttribute('data-kp-ago', '');
    if (ms == null || !Number.isFinite(ms)) el.removeAttribute('datetime');
    else el.setAttribute('datetime', new Date(ms).toISOString());
    paint(el, live.get(el) ?? defaultContext());
}
