// What the attach calls of this module share: a scope (a document, a shadow root or an element) as the controller's host, built directly.

import { Controller } from '../controller.js';

/** One attach call on a scope. Not keyed on the scope: several calls on one root each work, as they did before. */
export class ScopeWatch extends Controller {
    /**
     * @param {ParentNode} scope
     * @param {Record<string, unknown>} [options]
     */
    constructor(scope, options = {}) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (scope)), options);
        this.scope = scope;
        this.doc = /** @type {Document} */ (scope instanceof Document ? scope : /** @type {Node} */ ((scope).ownerDocument ?? document));
        this.view = this.doc.defaultView;
    }
}

/**
 * Run one attach call: build the watch, connect it, hand back its detach. A connect that throws is undone and the error goes on.
 * @template {ScopeWatch} W
 * @param {new (scope: ParentNode, options?: any) => W} Watch
 * @param {ParentNode} scope
 * @param {Record<string, unknown>} [options]
 * @returns {() => void} detach
 */
export function attachScope(Watch, scope, options = {}) {
    const watch = new Watch(scope, options);
    try {
        watch.connect();
    } catch (error) {
        watch.destroy();
        throw error;
    }
    return () => watch.destroy();
}
