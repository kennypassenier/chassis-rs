// The watch on a root: it remembers the numbers under it, and ticks one whose text anyone but this module changed.

import { Controller, hostsOf } from '../controller.js';
import { TICK } from './values.js';
import { knownTicker, tickerOf } from './ticker.js';
import { numberNode } from './parse.js';

/** One attach call on a root (a document, a shadow root or an element), which is the controller's host, built directly. */
export class TickWatch extends Controller {
    /** @param {ParentNode} scope */
    constructor(scope) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (scope)));
        this.scope = scope;
        this.doc = /** @type {Document} */ (scope instanceof Document ? scope : /** @type {Element} */ (scope).ownerDocument);
        this.view = this.doc.defaultView;
    }

    /** The numbers under the root, the root itself first when it is one. */
    ticking() {
        return hostsOf(this.scope, TICK);
    }

    /** Take a number's current text as the one shown, unless it has been looked at. @param {Element} el */
    remember(el) {
        if (knownTicker(el)) return;
        tickerOf(el).adopt();
    }

    connect() {
        for (const el of this.ticking()) this.remember(el);
        const View = this.view;
        if (!View?.MutationObserver) return;
        // Runs last on detach: every running tick lands on its number.
        this.own(() => {
            for (const el of this.ticking()) knownTicker(el)?.stop();
        });
        this.observe(new View.MutationObserver((records) => this.onMutations(records, View))).observe(this.scope, {
            subtree: true,
            childList: true,
            characterData: true,
        });
    }

    /** @param {MutationRecord[]} records @param {Window & typeof globalThis} View */
    onMutations(records, View) {
        /** @type {Set<Element>} */
        const touched = new Set();
        for (const record of records) {
            const target = record.target instanceof View.Element ? record.target : record.target.parentElement;
            const el = target?.closest(TICK);
            if (el && (this.scope === this.doc || this.scope.contains(el))) touched.add(el);
            for (const node of record.addedNodes) {
                if (!(node instanceof View.Element)) continue;
                for (const one of [node, ...node.querySelectorAll(TICK)]) if (one.matches(TICK)) this.remember(one);
            }
        }
        for (const el of touched) this.changed(el);
    }

    /** A number's text changed: tick, unless it is this module's own write. @param {Element} el */
    changed(el) {
        const ticker = knownTicker(el);
        if (!ticker) {
            this.remember(el);
            return;
        }
        const now = numberNode(el)?.nodeValue ?? el.textContent ?? '';
        if (now === ticker.written) return;
        ticker.tickTo(now);
    }
}

/**
 * Watch every number under `root` (the body of attachTicks()).
 * @param {ParentNode} root
 * @returns {() => void} detach: every running tick lands on its number
 */
export function watchTicks(root) {
    const watch = new TickWatch(root);
    try {
        watch.connect();
    } catch (error) {
        watch.destroy();
        throw error;
    }
    return () => watch.destroy();
}
