// Changing a wheel: the glide of its weights, giving it items or a state, reading its result, and the spin itself.

import { openBusyCard } from '../busy-card.js';
import { motionAllowed } from '../calm.js';
import { getStrings } from '../strings.js';
import { build, drawDisc, paint } from './draw.js';
import { DEFAULT_TURNS_MAX, DEFAULT_TURNS_MIN, WHEEL_RESULT_EVENT, WHEEL_SPIN_EVENT, part, pickWeighted, stateOf, weightOf, wheelAngles } from './state.js';

/** @typedef {import('../wheel.js').WheelItem} WheelItem */
/** @typedef {import('./state.js').WheelState} WheelState */

/** @returns {boolean} */
const reduced = () => !motionAllowed();

/**
 * Let the drawn weights glide to the items' weights in the theme's size time.
 * @param {HTMLElement} root
 */
export async function glideTo(root) {
    const state = stateOf(root);
    const target = new Map(state.items.map((item) => [item.id, weightOf(item)]));
    // The order: the new items in theirs, a leaving one kept after the one it followed.
    /** @type {string[]} */
    const order = state.items.map((item) => item.id);
    state.order.forEach((id, at) => {
        if (target.has(id)) return;
        const before = state.order
            .slice(0, at)
            .reverse()
            .find((other) => order.includes(other));
        order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
    });
    const from = new Map(order.map((id) => [id, state.shown.get(id) ?? 0]));
    // A first drawing, or a wheel that had nothing, is drawn at once.
    const first = state.order.length === 0 || [...from.values()].every((w) => w <= 0.0001);
    let duration = 0;
    let easing = 'ease';
    if (!first && !reduced()) {
        const { themeMotion } = await import('../motion.js');
        ({ size: duration, ease: easing } = themeMotion(root));
    }
    const done = () => {
        state.order = state.items.map((item) => item.id);
        state.shown = new Map(target);
        drawDisc(root, true);
    };
    cancelAnimationFrame(state.glide);
    if (duration <= 0) return done();
    state.order = order;
    // The theme's curve, sampled through a throwaway animation.
    const probe = document.createElement('i').animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing, fill: 'both' });
    probe.pause();
    const start = performance.now();
    const frame = (/** @type {number} */ now) => {
        const t = Math.min(1, (now - start) / duration);
        probe.currentTime = t * duration;
        const style = probe.effect?.getComputedTiming().progress ?? t;
        const k = typeof style === 'number' ? style : t;
        state.shown = new Map(order.map((id) => [id, (from.get(id) ?? 0) + ((target.get(id) ?? 0) - (from.get(id) ?? 0)) * k]));
        drawDisc(root, false);
        if (t < 1) state.glide = requestAnimationFrame(frame);
        else {
            probe.cancel();
            done();
        }
    };
    state.glide = requestAnimationFrame(frame);
}

/**
 * Give the wheel its choices. A new set clears the outcome (a filter is a new
 * question); one choice is the outcome at once.
 * @param {Element} root @param {WheelItem[]} items
 */
export function setWheelItems(root, items) {
    if (!(root instanceof HTMLElement)) return;
    build(root);
    const state = stateOf(root);
    if (state.spinning) {
        root.addEventListener(WHEEL_RESULT_EVENT, () => setWheelItems(root, items), { once: true });
        return;
    }
    state.items = items.map((item) => ({ ...item }));
    root.removeAttribute('data-kp-wheel-won');
    if (state.last !== null && !state.items.some((item) => item.id === state.last)) state.last = null;
    void glideTo(root);
    paint(root);
    if (state.items.length === 1) {
        const [only] = state.items;
        root.setAttribute('data-kp-wheel-won', only.id);
        state.last = only.id;
        paint(root);
        drawDisc(root, true);
        root.dispatchEvent(new CustomEvent(WHEEL_RESULT_EVENT, { bubbles: true, detail: { item: { ...only }, index: 0, source: 'only' } }));
    }
}

/**
 * The wheel's state: `loading` lays the busy card over it, `error` says the
 * message where the outcome goes, `ready` is neither.
 * @param {Element} root @param {'loading' | 'error' | 'ready'} kind @param {string} [message]
 */
export function setWheelState(root, kind, message) {
    if (!(root instanceof HTMLElement)) return;
    build(root);
    const state = stateOf(root);
    root.setAttribute('data-kp-state', kind);
    if (kind === 'error') root.setAttribute('data-kp-wheel-error', message ?? getStrings().wheelFailed);
    else root.removeAttribute('data-kp-wheel-error');
    if (kind === 'loading') {
        root.setAttribute('aria-busy', 'true');
        const stage = part(root, 'stage');
        state.busy ??= openBusyCard(stage, { words: message ?? getStrings().wheelLoading, area: () => [stage], className: 'kp-wheel__busy' });
    } else {
        root.removeAttribute('aria-busy');
        const card = state.busy;
        state.busy = null;
        void card?.close();
    }
    paint(root);
}

/** The outcome the wheel stands on, or null. @param {Element} root @returns {WheelItem | null} */
export function getWheelResult(root) {
    const won = root.getAttribute('data-kp-wheel-won');
    const item = stateOf(root).items.find((i) => i.id === won);
    return item ? { ...item } : null;
}

/**
 * Spin: draw the outcome by the weights, turn the wheel to it, say it.
 * Resolves with the outcome (null when it could not spin).
 * @param {Element} root
 * @param {{ random?: () => number }} [options]
 * @returns {Promise<WheelItem | null>}
 */
export async function spinWheel(root, { random = Math.random } = {}) {
    if (!(root instanceof HTMLElement)) return null;
    const state = stateOf(root);
    if (state.spinning || state.items.length < 2 || root.hasAttribute('aria-busy') || root.hasAttribute('data-kp-wheel-error')) return null;
    const avoid = root.getAttribute('data-kp-wheel-repeat') === 'true' ? null : state.last;
    const index = pickWeighted(state.items, { random, avoid });
    if (index < 0) return null;
    const item = state.items[index];
    // Finish a glide first, so the segment the wheel turns to is where it is drawn.
    cancelAnimationFrame(state.glide);
    state.order = state.items.map((i) => i.id);
    state.shown = new Map(state.items.map((i) => [i.id, weightOf(i)]));
    root.removeAttribute('data-kp-wheel-won');
    drawDisc(root, true);
    const [a0, a1] = wheelAngles(state.items.map(weightOf))[index];
    // Somewhere inside the segment, never on its edge.
    const land = a0 + (a1 - a0) * (0.5 + (random() - 0.5) * 0.6);
    const short = reduced();
    const attr = (/** @type {string} */ name) => {
        const raw = root.getAttribute(name);
        const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
        return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
    };
    const fixed = attr('data-kp-wheel-turns');
    const least = attr('data-kp-wheel-turns-min') ?? fixed ?? DEFAULT_TURNS_MIN;
    const most = Math.max(least, attr('data-kp-wheel-turns-max') ?? fixed ?? DEFAULT_TURNS_MAX);
    // Drawn last, from the same source: the weights decided the outcome above, the turns only lengthen the way to it.
    const turns = short ? 0 : least + Math.min(most - least, Math.floor(random() * (most - least + 1)));
    const base = short
        ? Math.max(0, Number(root.getAttribute('data-kp-wheel-reduced-ms') ?? 600))
        : Math.max(0, Number(root.getAttribute('data-kp-wheel-duration') ?? 3600));
    const from = state.angle;
    const rest = (((-land - from) % 360) + 360) % 360;
    const to = from + turns * 360 + rest;
    // The time follows the travel, around the mean travel (the middle turns and half a turn of rest).
    const mean = ((least + most) / 2 + 0.5) * 360;
    const duration = short ? base : base * Math.min(1.4, Math.max(0.6, (to - from) / mean));
    state.spinning = true;
    root.setAttribute('data-kp-wheel-spinning', '');
    part(root, 'result').setAttribute('aria-busy', 'true');
    paint(root);
    root.dispatchEvent(new CustomEvent(WHEEL_SPIN_EVENT, { bubbles: true, detail: { item: { ...item }, index, turns: (to - from) / 360 } }));
    const disc = part(root, 'disc');
    if (duration > 0 && to !== from) {
        const ease = getComputedStyle(root).getPropertyValue('--kp-wheel-ease').trim() || 'cubic-bezier(0.12, 0.6, 0.1, 1)';
        const motion = disc.animate([{ rotate: `${from}deg` }, { rotate: `${to}deg` }], {
            duration,
            easing: short ? 'ease-out' : ease,
            fill: 'forwards',
        });
        await motion.finished.catch(() => undefined);
        disc.style.rotate = `${to}deg`;
        motion.cancel();
    } else disc.style.rotate = `${to}deg`;
    state.angle = to % 360;
    disc.style.rotate = `${state.angle}deg`;
    state.spinning = false;
    state.last = item.id;
    root.removeAttribute('data-kp-wheel-spinning');
    root.setAttribute('data-kp-wheel-won', item.id);
    drawDisc(root, true);
    paint(root);
    const result = part(root, 'result');
    result.removeAttribute('aria-busy');
    // The status region speaks what changed in it once it is no longer busy: the caption and the name, once. The name
    // simply stands there: the box keeps its two lines, so nothing under the wheel moves.
    root.dispatchEvent(new CustomEvent(WHEEL_RESULT_EVENT, { bubbles: true, detail: { item: { ...item }, index, source: 'spin' } }));
    return { ...item };
}

