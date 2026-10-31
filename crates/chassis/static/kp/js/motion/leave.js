// Leaving: the leave of one element, a batch, and repaint tracking.
import { motionState } from './state.js';
import { animationSignature, entering, flipped, floats, pseudoNames } from './reversed-leave.js';
import { arrivalOf, atTime, cappedGap, foldCurve, foldFrames, foldReflows, foldTiming, partway, playedOut } from './fold.js';
import { firstMs, themeMotion } from './timing.js';
import { REVERSING_ATTRIBUTE } from './reverse.js';
import { keyframesOf } from './keyframes.js';
import { heightFolds } from './fold-size.js';
import { onStepClock, steppedDuration, withoutOvershoot } from './size.js';
import { ARRIVE_KEYS, SKELETON } from './constants.js';

/**
 * Whether the theme lets a part that a script is about to remove or hide
 * (a state's layer, an empty state, a file row, a tree's children) leave
 * first, as leave() plays it: a theme says so with `--kp-leave-state:
 * leave`, and the others keep taking such a part out at once.
 * @param {Element} el
 * @returns {boolean}
 */
export function leavesState(el) {
    return getComputedStyle(el).getPropertyValue('--kp-leave-state').trim() === 'leave';
}
/**
 * Let `el` leave the theme's way, then take it out [scope-142; Kenny,
 * 2026-10-04: "die grow/shrink bewegingen moeten ook zijn als er opeens
 * nieuwe elementen bijkomen of weggaan"]: it plays its arrival backwards
 * while it folds shut, so what is under it closes up instead of jumping,
 * and the box around it shrinks with it. Under reduced motion, or in a theme
 * with no arrival, it goes at once.
 *
 * Elements told to leave in the same task leave one by one, bottom first.
 *
 * @param {HTMLElement} el
 * @param {{ hide?: boolean }} [options] `hide: true` sets `hidden` instead of removing it
 * @returns {Promise<void>} settled once it is gone
 */
export function leave(el, { hide = false } = {}) {
    return new Promise((resolve) => {
        if (!motionState.batch) {
            motionState.batch = [];
            queueMicrotask(() => {
                const items = /** @type {Leaving[]} */ (motionState.batch);
                motionState.batch = null;
                void leaveInTurn(items);
            });
        }
        motionState.batch.push({ el, hide, resolve });
    });
}
/** @typedef {{ el: HTMLElement, hide: boolean, resolve: () => void }} Leaving */
/**
 * Several elements told to leave at once go one by one, the lowest first,
 * each starting as the one before has played its exit (Kenny, 2026-10-04:
 * "als er twee of meerdere elementen zijn, dan moeten die één voor één in
 * logische volgorde (pak van beneden naar boven) verwijderd worden").
 * @param {Leaving[]} items
 */
async function leaveInTurn(items) {
    items.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1));
    for (const item of items) {
        /** @type {Promise<void>} */
        const exited = new Promise((resolve) => {
            void leaveOne(item.el, item.hide, resolve, items.length).then(item.resolve);
        });
        await exited;
    }
}
/**
 * @param {HTMLElement} el @param {boolean} hide
 * @param {() => void} exited called once its exit has played, or at once when it has none
 * @param {number} [count] how many leave in this row (inTurnGap())
 * @returns {Promise<void>}
 */
async function leaveOne(el, hide, exited, count = 1) {
    const gone = () => {
        if (hide) el.hidden = true;
        else el.remove();
    };
    // Told to leave while it still arrives as a leave turned around: it
    // leaves from where it stands.
    entering.get(el)?.();
    if (!el.isConnected || el.hasAttribute('data-kp-leaving')) return exited();
    const before = getComputedStyle(el).animationName;
    const beforeSig = animationSignature(el);
    const rest = pseudoNames(el);
    const arrival = arrivalOf(el);
    const { size, ease } = themeMotion(el);
    if (!arrival && size <= 0) {
        exited();
        return gone();
    }
    el.setAttribute('data-kp-leaving', '');
    // A register with a leave of its own draws it on `[data-kp-leaving]`
    // (Kenny, 2026-10-04: "kan je die ook meer on-theme maken met distincte
    // animaties per thema?"); one without plays its arrival backwards.
    const style = getComputedStyle(el);
    const ownName = style.animationName;
    // The same keyframes under the same name, turned around (forest's toast
    // arrives as its leave reversed): the browser does not restart an
    // animation whose name stays, so it is restarted here.
    const turned = ownName && ownName !== 'none' && ownName === before && animationSignature(el) !== beforeSig;
    if (turned) {
        el.setAttribute(REVERSING_ATTRIBUTE, 'reset');
        getComputedStyle(el).animationName;
        el.removeAttribute(REVERSING_ATTRIBUTE);
        getComputedStyle(el).animationName;
    }
    const own = ownName && ownName !== 'none' && (ownName !== before || turned) ? { duration: firstMs(style.animationDuration) } : null;
    /** @type {Promise<unknown>[]} */
    const running = [];
    const lasts = own ? own.duration : (arrival?.duration ?? 0);
    // `--kp-leave-fold: ghost` lets a stand-in of the same shape play the
    // exit on top while the element itself, hidden, folds its space shut
    // underneath, so neither squeezes the other (Kenny, 2026-10-04: "maak
    // een div die de vorm van het te verdwijnen element overneemt en pas
    // daar een animatie op toe").
    const fold = style.getPropertyValue('--kp-leave-fold').trim();
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
        // Offsets round to whole pixels and skip some borders; correct by
        // what the two boxes measure.
        const want = el.getBoundingClientRect();
        const got = actor.getBoundingClientRect();
        actor.style.top = `${el.offsetTop + want.top - got.top}px`;
        actor.style.left = `${el.offsetLeft + want.left - got.left}px`;
        el.style.setProperty('visibility', 'hidden');
        el.style.setProperty('animation', 'none');
    }
    if (!own && arrival) actor.style.animation = `${arrival.name} ${arrival.duration}ms ${arrival.ease} reverse forwards`;
    // The entrance parts (pseudoNames()) play backwards, from their end.
    // Restarted first: an arrival that took one over left none to read.
    if (Object.values(rest).some((sig) => !sig.startsWith('none '))) {
        const inline = actor.style.animation;
        actor.setAttribute(REVERSING_ATTRIBUTE, 'reset');
        for (const pseudo of [null, '::before', '::after']) getComputedStyle(actor, pseudo).animationName;
        actor.removeAttribute(REVERSING_ATTRIBUTE);
        actor.style.animation = inline;
    }
    getComputedStyle(actor).animationName;
    for (const a of actor.getAnimations({ subtree: true })) {
        const effect = /** @type {KeyframeEffect | null} */ (a.effect);
        const pseudo = effect?.pseudoElement;
        if (!(a instanceof CSSAnimation) || effect?.target !== actor || !pseudo || rest[pseudo] !== animationSignature(actor, pseudo)) continue;
        const timing = effect.getTiming();
        if (!Number.isFinite(Number(timing.iterations))) continue;
        const keyframes = keyframesOf(effect);
        a.cancel();
        try {
            running.push(
                actor
                    .animate(keyframes, {
                        duration: Number(timing.duration) || 0,
                        iterations: Number(timing.iterations),
                        easing: String(timing.easing ?? 'linear'),
                        direction: flipped(timing.direction),
                        fill: 'forwards',
                        pseudoElement: pseudo,
                    })
                    .finished.catch(() => undefined),
            );
        } catch {
            /* an engine that cannot animate that pseudo-element skips it */
        }
    }
    // `--kp-lines: keep`: the lines inside it are part of the exit too (exitsOf()).
    const lines = style.getPropertyValue('--kp-lines').trim() === 'keep';
    const exit = lasts > 0 ? playedOut(actor, lasts + 100, lines) : Promise.resolve();
    // The next in a row of leaves starts once this one's exit is
    // `--kp-leave-stagger` of the way through (0.5 by default; 1 waits for
    // all of it), read off the animation itself so any playback rate holds.
    // Halfway unless the page says otherwise (Kenny's pick, 2026-10-04).
    const set = parseFloat(style.getPropertyValue('--kp-leave-stagger'));
    const stagger = Number.isNaN(set) ? 0.5 : set;
    // A long row lets the next go sooner (inTurnGap()), on the exit's own
    // clock, as arriveInTurn() delays its arrivals.
    const capped = lasts > 0 && count > 2 ? cappedGap(actor, stagger, lasts, count, lines) : null;
    if (capped !== null) void atTime(actor, capped, exit, lines).then(exited);
    else if (lasts > 0 && stagger > 0 && stagger < 1) void partway(actor, stagger, exit, lines).then(exited);
    else void exit.then(exited);
    running.push(exit);
    // A table row cannot be folded below its cells' content: it plays its
    // leave, and the table glides shut once it is out.
    const foldTo = size > 0 && !(el instanceof HTMLTableRowElement) && !floats(el, style) ? foldFrames(el, style) : null;
    if (foldTo && !foldReflows(el, ...foldTo)) {
        el.style.setProperty('overflow', 'clip');
        el.style.setProperty('box-sizing', 'border-box');
        const [from, to] = foldTo;
        if ('height' in from) heightFolds.add(el);
        // The space closes slower than a plain resize, so the eye can follow
        // what closes up (Kenny, 2026-10-04: "ik zou het graag iets trager
        // zien gaan, zodat de animatie zichtbaar is"). `--kp-leave-fold`
        // says when: `together` starts it a third of the way into the
        // theme's exit, `after` once the exit is over, plus
        // `--kp-leave-pause` ms, so the exit is never hidden by the fold
        // (Kenny, 2026-10-04: "misschien moet je eerst de elementen laten
        // faden en dan pas die accordion").
        const after = fold === 'after';
        const pause = parseFloat(style.getPropertyValue('--kp-leave-pause')) || 0;
        const timing = foldTiming(style);
        const foldEase = foldCurve(style, ease);
        const folding = el.animate([from, to], {
            duration: steppedDuration(el, withoutOvershoot(foldEase), Math.max(size, lasts) * timing.grow),
            delay: onStepClock(el, withoutOvershoot(foldEase), after ? lasts + pause : timing.start(lasts)),
            easing: withoutOvershoot(foldEase),
            fill: 'forwards',
        });
        running.push(folding.finished.catch(() => undefined));
    }
    await Promise.all(running);
    heightFolds.delete(el);
    if (actor !== el) actor.remove();
    gone();
    el.removeAttribute('data-kp-leaving');
    el.style.removeProperty('animation');
    el.style.removeProperty('overflow');
    el.style.removeProperty('box-sizing');
    el.style.removeProperty('visibility');
    for (const a of el.getAnimations()) a.cancel();
}
/**
 * @typedef {{ getAttribute: (name: string) => string | null, tagName: string, className: string, id?: string, nodeType: number, matches?: (selector: string) => boolean, querySelector?: (selector: string) => unknown }} RepaintNode
 */

/**
 * The added elements of one batch of changes that only repaint what was
 * there [port spec G; the homelab dashboard's `repaints()`, moved here]:
 * an element is a repaint when its parent lost, in the same batch, an
 * element with its key (the first of `keys` it carries) or, with no key,
 * one more element of its tag and class than it already took back. An
 * element added where a loading skeleton left (`.kp-skeleton`,
 * `[data-kp-skeleton]`) is not news either: it is the data the skeleton
 * waited for. Everything else is new content.
 *
 * Measured by the dashboard (8 quiet seconds per page): without this, a
 * live refresh that redrew its rows replayed the arrival on 158 cells of
 * one page, 112 on another and 72 on a third, though nothing new had come.
 *
 * @param {Iterable<{ type: string, target: unknown, addedNodes: ArrayLike<any>, removedNodes: ArrayLike<any> }>} records
 * @param {{ keys?: readonly string[] }} [options]
 * @returns {Set<any>} the added elements that are repaints
 */
export function repaintedIn(records, { keys = ARRIVE_KEYS } = {}) {
    const list = [...records].filter((r) => r.type === 'childList');
    /** @type {Map<unknown, { keys: Set<string>, sigs: Map<string, number>, skeleton: boolean }>} */
    const gone = new Map();
    const keyOf = (/** @type {RepaintNode} */ e) => {
        for (const name of keys) {
            const value = name === 'id' ? e.getAttribute('id') || e.id || null : e.getAttribute(name);
            if (value) return `${name}=${value}`;
        }
        return null;
    };
    const sigOf = (/** @type {RepaintNode} */ e) => `${e.tagName}.${e.className}`;
    const skeletal = (/** @type {RepaintNode} */ e) =>
        (typeof e.matches === 'function' && e.matches(SKELETON)) || (typeof e.querySelector === 'function' && e.querySelector(SKELETON) !== null);
    for (const r of list)
        for (const n of Array.from(r.removedNodes)) {
            if (n?.nodeType !== 1) continue;
            const g = gone.get(r.target) ?? { keys: new Set(), sigs: new Map(), skeleton: false };
            gone.set(r.target, g);
            const k = keyOf(n);
            if (k) g.keys.add(k);
            g.sigs.set(sigOf(n), (g.sigs.get(sigOf(n)) ?? 0) + 1);
            if (skeletal(n)) g.skeleton = true;
        }
    /** @type {Set<any>} */
    const out = new Set();
    for (const r of list)
        for (const n of Array.from(r.addedNodes)) {
            if (n?.nodeType !== 1) continue;
            const g = gone.get(r.target);
            if (!g) continue;
            if (g.skeleton) {
                out.add(n);
                continue;
            }
            const k = keyOf(n);
            const left = g.sigs.get(sigOf(n)) ?? 0;
            if (k ? g.keys.has(k) : left > 0) {
                out.add(n);
                if (!k) g.sigs.set(sigOf(n), left - 1);
            }
        }
    return out;
}
