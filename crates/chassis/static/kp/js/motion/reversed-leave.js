// A leave played as the reverse of the arrival.
import { motionState } from './state.js';
import { firstMs, themeMotion } from './timing.js';
import { keepsLines, keyframesOf } from './keyframes.js';
import { foldCurve, foldFrames, foldReflows, foldTiming } from './fold.js';
import { onStepClock, steppedDuration, withoutOvershoot } from './size.js';
import { arriveInTurn, finiteMs, reaches } from './turns.js';
import { heightFolds } from './fold-size.js';
/** @typedef {import('./turns.js').Arriving} Arriving */

/**
 * The reverse arrivals playing now, each with the way to stop it, so a
 * leave that comes during one starts from the element as it stands.
 * @type {WeakMap<HTMLElement, () => void>}
 */
export const entering = new WeakMap();
/**
 * The animation an element (or one of its pseudo-elements) wears, every
 * part a leave may turn around.
 * @param {Element} el @param {string | null} [pseudo]
 * @returns {string}
 */
export const animationSignature = (el, pseudo = null) => {
    const style = getComputedStyle(el, pseudo);
    return [style.animationName, style.animationDirection, style.animationDuration, style.animationTimingFunction, style.animationFillMode].join(' ');
};
/**
 * The animations `el`'s pseudo-elements wear now. A pseudo-element
 * whose animation is the same with and without `[data-kp-leaving]` (a
 * toast's rule drawn in at rest, and the register gives the leave nothing
 * else for it) is part of the entrance, not of the exit: the leave plays it
 * backwards and the arrival forwards, so the two stay each other's mirror
 * (research/PACKAGE_FINDINGS.md, 2026-10-07: on the leave such a part did
 * not move, or jumped, because a CSS animation whose name does not change is
 * not restarted).
 * @param {Element} el
 * @returns {Record<string, string>}
 */
export const pseudoNames = (el) => ({
    '::before': animationSignature(el, '::before'),
    '::after': animationSignature(el, '::after'),
});
/**
 * Whether `el` takes no space where it stands (placed absolutely or fixed,
 * or raised into the top layer): a fold of its space would show nothing but
 * a wait, with the element already gone or not yet there (a combobox list
 * unfolded nothing for 466 ms before its opening, blueprint).
 * @param {Element} el @param {CSSStyleDeclaration} style
 */
export const floats = (el, style) => {
    if (style.position === 'absolute' || style.position === 'fixed') return true;
    try {
        return el.matches(':popover-open, :modal');
    } catch {
        return false;
    }
};
/** @param {PlaybackDirection | undefined} direction @returns {PlaybackDirection} */
export const flipped = (direction) =>
    /** @type {Record<PlaybackDirection, PlaybackDirection>} */ ({
        normal: 'reverse',
        reverse: 'normal',
        alternate: 'alternate-reverse',
        'alternate-reverse': 'alternate',
    })[direction ?? 'normal'];
/**
 * The CSS animations that make up the exit `actor` plays: its own and those
 * on its pseudo-elements and, where the register keeps the lines of a part
 * (`--kp-lines: keep`, see keepsLines()), those of every line inside it that
 * ends, each on its own element with its own wait. A line that never ends (a
 * spinner, a caret) is no exit.
 * @param {HTMLElement} actor
 * @param {boolean} lines
 * @returns {CSSAnimation[]}
 */
export function exitsOf(actor, lines) {
    return /** @type {CSSAnimation[]} */ (
        actor.getAnimations({ subtree: true }).filter((a) => {
            if (typeof CSSAnimation === 'undefined' || !(a instanceof CSSAnimation)) return false;
            const effect = /** @type {KeyframeEffect | null} */ (a.effect);
            const target = effect?.target;
            if (target === actor) return true;
            return lines && target != null && actor.contains(target) && Number.isFinite(Number(effect?.getComputedTiming().activeDuration));
        })
    );
}
/**
 * Let `el` arrive as its leave played backwards [research/open-reverse;
 * Kenny's pick, every theme since 2026-10-05]: the
 * timeline leaveOne() would play for it in its theme (the register's exit
 * on `[data-kp-leaving]`, pseudo-elements included, and the fold of its
 * space a third of the way in, or after it, or under a stand-in), turned
 * around, so frame t of the arrival is frame (T - t) of the leave. Every
 * duration, delay and curve is the theme's, read as leaveOne() reads it.
 *
 * @param {HTMLElement} el
 * @returns {boolean} false when it has no leave to turn around (a table row,
 *   which a leave does not fold; a register with no exit of its own): the
 *   caller plays the theme's arrival instead
 */
export function arriveAsReversedLeave(el) {
    if (el instanceof HTMLTableRowElement || !el.isConnected) return false;
    const { size, ease } = themeMotion(el);
    const before = getComputedStyle(el).animationName;
    const beforeSig = animationSignature(el);
    const rest = pseudoNames(el);
    el.setAttribute('data-kp-leaving', '');
    const style = getComputedStyle(el);
    const ownName = style.animationName;
    // The same keyframes turned around count as an exit of its own (see leaveOne()).
    if (!ownName || ownName === 'none' || (ownName === before && animationSignature(el) === beforeSig)) {
        el.removeAttribute('data-kp-leaving');
        return false;
    }
    el.setAttribute('data-kp-arriving', '');
    const lasts = firstMs(style.animationDuration);
    const fold = style.getPropertyValue('--kp-leave-fold').trim();
    // `ghost`: as in the leave, a stand-in of the same shape plays the exit
    // on top while the element itself, hidden, unfolds its space underneath.
    /** @type {HTMLElement} */
    let actor = el;
    if (fold === 'ghost' && lasts > 0) {
        actor = /** @type {HTMLElement} */ (el.cloneNode(true));
        actor.setAttribute('aria-hidden', 'true');
        actor.inert = true;
        Object.assign(actor.style, {
            position: 'absolute',
            top: `${el.offsetTop}px`,
            left: `${el.offsetLeft}px`,
            width: `${el.offsetWidth}px`,
            height: `${el.offsetHeight}px`,
            margin: '0',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: '1',
        });
        el.after(actor);
        const want = el.getBoundingClientRect();
        const got = actor.getBoundingClientRect();
        actor.style.top = `${el.offsetTop + want.top - got.top}px`;
        actor.style.left = `${el.offsetLeft + want.left - got.left}px`;
        el.style.setProperty('visibility', 'hidden');
    }
    // The exit, read off the actor and taken over: its keyframes and timing.
    getComputedStyle(actor).animationName;
    const css = exitsOf(actor, keepsLines(el));
    const exits = css.map((a) => {
        const effect = /** @type {KeyframeEffect} */ (a.effect);
        const timing = effect.getTiming();
        // An entrance part (see pseudoNames()): the leave plays it backwards.
        const pseudo = effect.pseudoElement;
        if (effect.target === actor && pseudo && rest[pseudo] === animationSignature(actor, pseudo)) {
            timing.direction = flipped(timing.direction);
            // Played backwards in the leave, from its first frame: its own
            // wait comes after it there, so here it ends with the timeline.
            timing.delay = 0;
        }
        return {
            target: /** @type {Element} */ (effect.target),
            keyframes: keyframesOf(effect),
            pseudoElement: effect.pseudoElement,
            timing,
            // The whole of it, every iteration, from the leave's start.
            end: (Number(timing.delay) || 0) + (Number(effect.getComputedTiming().activeDuration) || 0),
        };
    });
    for (const a of css) a.cancel();
    if (actor !== el) for (const a of el.getAnimations()) if (a instanceof CSSAnimation) a.cancel();
    const after = fold === 'after';
    const pause = parseFloat(style.getPropertyValue('--kp-leave-pause')) || 0;
    const timing = foldTiming(style);
    const foldEase = foldCurve(style, ease);
    const frames = size > 0 && !floats(el, style) ? foldFrames(el, style) : null;
    const foldFor = frames && !foldReflows(el, ...frames) ? steppedDuration(el, withoutOvershoot(foldEase), Math.max(size, lasts) * timing.grow) : 0;
    const foldAt = onStepClock(el, withoutOvershoot(foldEase), after ? lasts + pause : timing.start(lasts));
    // The leave is over when its last exit (a pseudo-element's may run
    // longer than the first) and its fold are.
    const total = Math.max(lasts, ...exits.map((exit) => exit.end), foldFor ? foldAt + foldFor : 0);
    /** @type {Animation[]} */
    const plays = [];
    for (const exit of exits) {
        // In the leave this exit ran from its delay to its end; turned
        // around it ends at the timeline's end. Its iterations play in the
        // opposite order, each backwards: a normal or reverse exit swaps
        // direction, an alternating one keeps its own for an even count.
        const { iterations = 1, direction = 'normal', easing = 'linear', duration } = exit.timing;
        const even = Number(iterations) % 2 === 0;
        /** @type {Record<PlaybackDirection, PlaybackDirection>} */
        const turned = {
            normal: 'reverse',
            reverse: 'normal',
            alternate: even ? 'alternate' : 'alternate-reverse',
            'alternate-reverse': even ? 'alternate-reverse' : 'alternate',
        };
        const back = turned[direction] ?? 'reverse';
        try {
            plays.push(
                exit.target.animate(exit.keyframes, {
                    duration: Number(duration) || 0,
                    iterations: Number(iterations),
                    delay: finiteMs(total - exit.end),
                    easing: String(easing),
                    direction: back,
                    fill: 'both',
                    ...(exit.pseudoElement ? { pseudoElement: exit.pseudoElement } : {}),
                }),
            );
        } catch {
            /* an engine that cannot animate that pseudo-element skips it, as the leave does */
        }
    }
    // When the leave would have let the next of a row go: leaveOne() waits
    // until every exit is `--kp-leave-stagger` of the way through, or over.
    const set = parseFloat(style.getPropertyValue('--kp-leave-stagger'));
    const stagger = Number.isNaN(set) ? 0.5 : set;
    const lag =
        lasts <= 0
            ? 0
            : stagger > 0 && stagger < 1
              ? Math.max(0, ...exits.map((exit) => reaches(exit.timing, exit.end, stagger)))
              : Math.max(lasts, ...exits.map((exit) => exit.end));
    if (foldFor > 0 && frames) {
        el.style.setProperty('overflow', 'clip');
        el.style.setProperty('box-sizing', 'border-box');
        if ('height' in frames[0]) heightFolds.add(el);
        plays.push(
            el.animate(frames, {
                duration: foldFor,
                delay: finiteMs(total - foldAt - foldFor),
                // A panel that arrives while another leaves (a tab swap) folds on
                // `--kp-swap-fold-ease` where the theme says so: see attachTabs().
                easing: withoutOvershoot(
                    (el.hasAttribute('data-kp-tabs-swapping') && style.getPropertyValue('--kp-swap-fold-ease').trim()) || foldEase,
                ),
                direction: 'reverse',
                fill: 'backwards',
            }),
        );
    }
    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        entering.delete(el);
        heightFolds.delete(el);
        for (const a of plays) a.cancel();
        if (actor !== el) actor.remove();
        el.removeAttribute('data-kp-leaving');
        el.removeAttribute('data-kp-arriving');
        el.style.removeProperty('overflow');
        el.style.removeProperty('box-sizing');
        el.style.removeProperty('visibility');
        // It has arrived: the register's own entrance, which takes over as
        // the marks go, is already played (it would arrive a second time).
        getComputedStyle(el).animationName;
        for (const a of el.getAnimations({ subtree: true })) {
            if (
                a instanceof CSSAnimation &&
                /** @type {KeyframeEffect} */ (a.effect)?.target === el &&
                Number.isFinite(Number(a.effect?.getComputedTiming().activeDuration))
            )
                a.finish();
        }
    };
    entering.set(el, stop);
    void Promise.all(plays.map((a) => a.finished.catch(() => undefined))).then(stop);
    if (!motionState.arriving) {
        motionState.arriving = [];
        queueMicrotask(() => {
            const items = /** @type {Arriving[]} */ (motionState.arriving);
            motionState.arriving = null;
            arriveInTurn(items);
        });
    }
    motionState.arriving.push({ el, plays, total, lag });
    return true;
}
