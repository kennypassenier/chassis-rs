// The watch on a root: it sorts the bands under it, keeps each sorted as its items change, and takes up bands that arrive later.

import { Controller, attachOne, controllerOf } from '../controller.js';
import { ATTENTION } from './values.js';
import { sortAttention } from './set.js';
import { AttentionMax } from './max.js';

/** What a band's own watcher listens for. */
const BAND_OPTIONS = { childList: true, subtree: true, attributes: true, attributeFilter: ['data-kp-severity'] };

/** One attach call on a root (a document, a shadow root or an element), which is the controller's host, built directly. */
export class AttentionWatch extends Controller {
    /** @param {ParentNode} scope */
    constructor(scope) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (scope)));
        this.scope = scope;
        const doc = scope instanceof Document ? scope : (/** @type {Node} */ (scope).ownerDocument ?? document);
        this.view = doc.defaultView;
        /** The watcher of each band. @type {Map<Element, MutationObserver>} */
        this.watchers = new Map();
    }

    /** The bands in a scope, the scope itself first when it is one. @param {ParentNode} scope @returns {Element[]} */
    bandsIn(scope) {
        return [...(scope instanceof Element && scope.matches(ATTENTION) ? [scope] : []), ...scope.querySelectorAll(ATTENTION)];
    }

    connect() {
        const view = this.view;
        if (!view) {
            for (const band of this.bandsIn(this.scope)) sortAttention(band);
            return;
        }
        this.own(() => {
            for (const [band, watcher] of this.watchers) {
                watcher.disconnect();
                controllerOf(/** @type {HTMLElement} */ (band), AttentionMax)?.destroy();
            }
            this.watchers.clear();
        });
        for (const band of this.bandsIn(this.scope)) this.watch(band);
        // Bands that arrive later, and bands that leave. A removal is checked a
        // microtask later, so a band moved within the page keeps its watcher.
        const scope = this.scope;
        this.observe(new view.MutationObserver((records) => this.onLater(records, view))).observe(
            scope instanceof Document ? scope.documentElement : /** @type {Node} */ (scope),
            { childList: true, subtree: true },
        );
    }

    /** Sort a band now and whenever its items arrive or change severity. @param {Element} band */
    watch(band) {
        const view = this.view;
        if (!view || this.watchers.has(band)) return;
        sortAttention(band);
        // The cap (`data-kp-attention-max`) is a controller of the band of its own; without the attribute it does nothing.
        attachOne(/** @type {HTMLElement} */ (band), AttentionMax);
        const watcher = new view.MutationObserver(() => {
            watcher.disconnect();
            sortAttention(band);
            watcher.observe(band, BAND_OPTIONS);
        });
        watcher.observe(band, BAND_OPTIONS);
        this.watchers.set(band, watcher);
    }

    /** @param {MutationRecord[]} records @param {Window & typeof globalThis} view */
    onLater(records, view) {
        let removed = false;
        for (const record of records) {
            for (const node of record.addedNodes) if (node instanceof view.Element) for (const band of this.bandsIn(node)) this.watch(band);
            if (record.removedNodes.length) removed = true;
        }
        if (removed) queueMicrotask(() => this.letGo());
    }

    /** Let go of the bands that left the page. */
    letGo() {
        if (this.destroyed) return;
        for (const [band, watcher] of this.watchers)
            if (!band.isConnected) {
                watcher.disconnect();
                this.watchers.delete(band);
                controllerOf(/** @type {HTMLElement} */ (band), AttentionMax)?.destroy();
            }
    }
}

/**
 * Keep every attention band under `root` worst first (the body of attachAttention()).
 * @param {ParentNode} root
 * @returns {() => void} detach
 */
export function watchAttention(root) {
    const watch = new AttentionWatch(root);
    try {
        watch.connect();
    } catch (error) {
        watch.destroy();
        throw error;
    }
    return () => watch.destroy();
}
