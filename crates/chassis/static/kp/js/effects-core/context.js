// What a hook module receives from attachEffects [scope-117]: the engine's state and services, by name. The contract of
// `module.install(ctx)`; a hook destructures these, so every function is bound to the engine.

import { arrivalsOnScreen, carets, started, unknownReported } from './registry.js';

/** @typedef {import('../effects.js').EffectsContext} EffectsContext */
/** @typedef {import('./engine.js').EffectsEngine} EffectsEngine */

/**
 * @param {EffectsEngine} e the engine, once it has decided its arrival
 * @returns {EffectsContext}
 */
export function buildContext(e) {
    return {
        state: e.state,
        root: e.root,
        options: e.options,
        doc: e.doc,
        html: e.html,
        manageRoot: e.manageRoot,
        view: e.view,
        query: e.query,
        reduced: () => e.reduced(),
        rootStyle: e.rootStyle,
        knob: (/** @type {string} */ name, /** @type {number} */ fallback) => e.knob(name, fallback),
        cfg: e.cfg,
        timers: e.timers,
        frames: e.frames,
        cleanups: e.cleanups,
        finishers: e.finishers,
        done: () => e.done(),
        announce: (/** @type {Element} */ el, /** @type {string} */ reveal, /** @type {string} */ routine, /** @type {boolean} */ skipped) =>
            e.announce(el, reveal, routine, skipped),
        later: (/** @type {() => void} */ fn, /** @type {number} */ ms) => e.later(fn, ms),
        routineOf: (/** @type {Element} */ el, /** @type {'headline' | 'emphasis' | 'rule' | 'arrival'} */ reveal) => e.routineOf(el, reveal),
        memoKey: (/** @type {Element} */ el, /** @type {string} */ reveal) => e.memoKey(el, reveal),
        seen: (/** @type {Element} */ el, /** @type {string} */ reveal) => e.seen(el, reveal),
        reportUnknownRoutine: (/** @type {Element} */ el, /** @type {string} */ knob, /** @type {string} */ value, /** @type {readonly string[]} */ accepted) =>
            e.reportUnknownRoutine(el, knob, value, accepted),
        checkValues: (/** @type {Element} */ el) => e.checkValues(el),
        startOne: (/** @type {Element} */ el) => e.startOne(el),
        scan: (/** @type {ParentNode | Element} */ scope) => e.scan(scope),
        onPreference: e.preferenceHandler,
        arrivalRoutine: e.arrival.routine,
        arrivalPerformed: e.arrival.performed,
        arrivalPlays: e.arrival.plays,
        started,
        carets,
        arrivalsOnScreen,
        unknownReported,
    };
}
