// The base of every hook of js/effects.js [closure-pattern B, Kenny 2026-10-30].
//
// A hook used to be `install(ctx)`: one closure over the attach's context that handed back its functions. It is now a class,
// made once per attach by its module's `install(ctx)` (the contract js/effects-core/base.js loads), with the context on the
// instance and each behaviour a method; `connect()` hands the engine the hook it calls.
//
// The teardown stays the attach's own `cleanups` list rather than a list per hook: reduced motion switched on mid-session
// empties that list while the hooks stay installed for whatever the page asks for next [G8, DI7], and detach empties it again.
// `own()` and `listen()` write to it, so a hook never keeps a teardown list of its own.

/** @typedef {import('../effects.js').EffectsContext} EffectsContext */

export class EffectHook {
    /** @param {EffectsContext} ctx what attachEffects shares with its hooks */
    constructor(ctx) {
        /** The attach's state and services, by name (js/effects-core/context.js). */
        this.ctx = ctx;
    }

    /** Ready the hook for the engine; the base has nothing to wire up front, so a hook is wired by the reveals it is asked for. */
    connect() {
        return this;
    }

    /**
     * Register an undo step: it runs when reduced motion switches on mid-session and at detach.
     * @template {() => void} F
     * @param {F} undo
     * @returns {F}
     */
    own(undo) {
        this.ctx.cleanups.push(undo);
        return undo;
    }

    /**
     * Add an event listener that the attach's cleanups remove.
     * @param {EventTarget} target
     * @param {string} type
     * @param {EventListener} handler
     * @param {AddEventListenerOptions | boolean} [options]
     */
    listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this.own(() => target.removeEventListener(type, handler, options));
    }
}
