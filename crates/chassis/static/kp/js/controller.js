// The controller base: one class instance per component host [closure-pattern B, Kenny 2026-10-30].
//
// Every component used to be one long `attachX(root)` closure whose state lived in local `let`s and whose teardown was a hand-kept
// list of cleanups. A component is now a class: the constructor wires one host, the state sits on the instance, each behaviour is a
// small method, and `destroy()` undoes what `connect()` did. The constructor only stores fields; `connect()` does the wiring, so a
// wiring step that throws can still be undone by `destroy()`. This module is the shared part:
//
//   · `Controller` keeps the teardown: `listen()`, `observe()` and `own()` register what `destroy()` must undo, in reverse order.
//   · `attachAll(root, selector, Ctor, options)` finds the hosts under `root` (the root itself included), makes one controller per host
//     that has none of that class yet, and returns one detach for the controllers it made. The same call twice wires nothing twice.
//   · `attachOne(host, Ctor, options)` does the same for one host and returns its controller.
//   · `controllerOf(host, Ctor)` hands a page the live controller of a host, for the `setX(host, …)` / `getX(host)` helpers.
//
// A `connect()` that throws is undone, reported (`reportError`, so it reaches the page's error handlers and the console) and the other hosts are
// still wired: one broken host must not leave the whole page dead.

/** The live controllers, per class, per host. @type {WeakMap<Function, WeakMap<Element, Controller>>} */
const LIVE = new WeakMap();

/** @param {unknown} error */
const report = (error) => (typeof globalThis.reportError === 'function' ? globalThis.reportError(error) : console.error(error));

/** The base every component controller extends. */
export class Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options = {}) {
        /** The element this controller wires. */
        this.host = host;
        /** The options the page passed to its `attachX` call. */
        this.options = options;
        /** What `destroy()` undoes, in the order it was set up. @type {(() => void)[]} */
        this.teardown = [];
        /** Whether `destroy()` has run; a destroyed controller ignores late callbacks. */
        this.destroyed = false;
    }

    /**
     * Register an undo step for `destroy()`.
     * @template {() => void} F
     * @param {F} undo
     * @returns {F}
     */
    own(undo) {
        this.teardown.push(undo);
        return undo;
    }

    /**
     * Add an event listener that `destroy()` removes.
     * @param {EventTarget} target
     * @param {string} type
     * @param {EventListenerOrEventListenerObject} handler
     * @param {AddEventListenerOptions | boolean} [options]
     */
    listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this.own(() => target.removeEventListener(type, handler, options));
    }

    /**
     * Start an observer that `destroy()` disconnects.
     * @template {{ disconnect(): void }} O
     * @param {O} observer
     * @returns {O}
     */
    observe(observer) {
        this.own(() => observer.disconnect());
        return observer;
    }

    /** Wire the host: listeners, observers, first render. Subclasses override it; the base has nothing to wire. */
    connect() {}

    /** Undo everything the controller set up, newest first; an undo step that throws is reported and the rest still run. */
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const undo of this.teardown.splice(0).reverse()) {
            try {
                undo();
            } catch (error) {
                report(error);
            }
        }
        LIVE.get(this.constructor)?.delete(this.host);
    }
}

/**
 * The elements under `root` that match `selector`, `root` itself first when it matches.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
export function hostsOf(root, selector) {
    const self = root instanceof Element && root.matches(selector) ? [root] : [];
    return /** @type {HTMLElement[]} */ ([...self, ...root.querySelectorAll(selector)]);
}

/**
 * The live controller of class `Ctor` on `host`, if there is one.
 * @template {Controller} C
 * @param {Element} host
 * @param {new (host: HTMLElement, options?: any) => C} Ctor
 * @returns {C | undefined}
 */
export function controllerOf(host, Ctor) {
    return /** @type {C | undefined} */ (LIVE.get(Ctor)?.get(host));
}

/**
 * Make a `Ctor` on one host, or return the one it has. A `connect()` that throws is undone and reported, and nothing is returned.
 * @template {Controller} C
 * @param {HTMLElement} host
 * @param {new (host: HTMLElement, options?: any) => C} Ctor
 * @param {Record<string, unknown>} [options]
 * @returns {C | undefined}
 */
export function attachOne(host, Ctor, options = {}) {
    let live = LIVE.get(Ctor);
    if (!live) LIVE.set(Ctor, (live = new WeakMap()));
    const existing = /** @type {C | undefined} */ (live.get(host));
    if (existing) return existing;
    const controller = new Ctor(host, options);
    live.set(host, controller);
    try {
        controller.connect();
        return controller;
    } catch (error) {
        controller.destroy();
        report(error);
        return undefined;
    }
}

/**
 * Make one `Ctor` per matching host under `root` that has none yet.
 * @template {Controller} C
 * @param {ParentNode} root
 * @param {string} selector
 * @param {new (host: HTMLElement, options?: any) => C} Ctor
 * @param {Record<string, unknown>} [options]
 * @returns {() => void} detach: destroys the controllers this call made
 */
export function attachAll(root, selector, Ctor, options = {}) {
    const made = hostsOf(root, selector)
        .filter((host) => !controllerOf(host, Ctor))
        .map((host) => attachOne(host, Ctor, options))
        .filter((controller) => controller !== undefined);
    return () => {
        for (const controller of made) controller.destroy();
    };
}
