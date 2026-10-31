// The action columns of everything under a root: fitted now, and again once per frame when a row's buttons change, the theme changes or a font arrives.

import { Controller } from '../controller.js';
import { fitActionColumns } from './fit.js';
import { ACTION_LIST, ROW_ACTIONS } from './values.js';

/** The attributes of a row's buttons that move a column. */
const ROW_ATTRIBUTES = ['hidden', 'data-kp-action'];

/** @param {Node} node */
function touches(node) {
    const el = node instanceof Element ? node : node.parentElement;
    return el !== null && (el.closest(ROW_ACTIONS) !== null || el.querySelector(ROW_ACTIONS) !== null);
}

export class ActionColumns extends Controller {
    /**
     * @param {HTMLElement} host the root: an element, or the document
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** The root as the parent node it is. */
        this.root = /** @type {ParentNode} */ (/** @type {unknown} */ (host));
        this.doc = host instanceof Document ? host : (host.ownerDocument ?? document);
        this.view = this.doc.defaultView;
        /** The animation frame a fit waits for, or 0. */
        this.queued = 0;
    }

    connect() {
        const { view, doc, root } = this;
        if (!view) return;
        this.own(() => {
            if (this.queued) view.cancelAnimationFrame(this.queued);
        });
        if (typeof doc.fonts?.addEventListener === 'function') this.listen(doc.fonts, 'loadingdone', () => this.queue());
        this.observe(new view.MutationObserver(() => this.queue())).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        // Children and text only: the column writes are style changes, so the watcher never wakes itself.
        this.observe(new view.MutationObserver((records) => this.onRows(records))).observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ROW_ATTRIBUTES,
        });
        this.fitAll();
    }

    fitAll() {
        const lists = new Set([...this.root.querySelectorAll(ROW_ACTIONS)].map((box) => box.closest(ACTION_LIST)));
        for (const list of lists) if (list) fitActionColumns(list);
    }

    /** Fit once on the next frame, however many changes come before it. */
    queue() {
        if (this.queued || !this.view) return;
        this.queued = this.view.requestAnimationFrame(() => {
            this.queued = 0;
            this.fitAll();
        });
    }

    /** @param {MutationRecord[]} records */
    onRows(records) {
        if (records.some((r) => touches(r.target) || [...r.addedNodes, ...r.removedNodes].some(touches))) this.queue();
    }
}
