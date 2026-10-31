// One attach call: it adopts the lines under its root, watches for lines that arrive, change or leave, and measures again when the face changes.

import { Controller } from '../controller.js';
import { AGO, AGO_OBSERVED, FRESHNESS_TIME_ZONE } from './values.js';
import { engine, live, states, widths } from './state.js';
import { adopt, onVisibility, steer } from './engine.js';
import { paint } from './paint.js';

/** @typedef {import('../freshness.js').AgoContext} AgoContext */

export class AgoWatch extends Controller {
    /**
     * @param {ParentNode} scope the scope the call was given (a document, a shadow root or an element), which is this controller's host
     * @param {{ timeZone?: string, now?: () => number, strings?: Partial<import('../freshness.js').Strings> }} [options]
     */
    constructor(scope, options = {}) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (scope)), options);
        this.scope = scope;
        this.doc = /** @type {Document} */ (scope instanceof Document ? scope : /** @type {Node} */ (scope.ownerDocument ?? document));
        this.view = this.doc.defaultView;
        /** What tells this call's lines from another call's. */
        this.token = {};
        /** @type {AgoContext} */
        this.ctx = {
            timeZone: options.timeZone ?? FRESHNESS_TIME_ZONE,
            now: options.now ?? (() => Date.now()),
            overrides: options.strings,
            owner: this.token,
        };
    }

    connect() {
        // Runs last on detach: this call's lines leave the ticking set, then the timer follows.
        this.own(() => {
            for (const [el, own] of live) if (own.owner === this.token) live.delete(el);
            steer();
        });
        for (const el of this.linesIn(this.scope)) adopt(el, this.ctx);
        const view = this.view;
        if (!view) return;
        this.observe(new view.MutationObserver((records) => this.onMutations(records, view))).observe(
            this.scope instanceof Document ? this.scope.documentElement : /** @type {Node} */ (this.scope),
            { childList: true, subtree: true, attributes: true, attributeFilter: AGO_OBSERVED },
        );
        // A theme's face, or a face that arrives late, changes the widths: measure again.
        this.observe(new view.MutationObserver(() => this.remeasure())).observe(this.doc.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
        const fonts = /** @type {FontFaceSet | undefined} */ (this.doc.fonts);
        if (fonts?.addEventListener) this.listen(fonts, 'loadingdone', () => this.remeasure());
        if (engine.listening++ === 0) this.doc.addEventListener('visibilitychange', onVisibility);
        this.own(() => {
            if (--engine.listening === 0) this.doc.removeEventListener('visibilitychange', onVisibility);
        });
        steer();
    }

    /** The lines in a scope, the scope itself first when it is one. @param {ParentNode} scope @returns {HTMLElement[]} */
    linesIn(scope) {
        return /** @type {HTMLElement[]} */ ([...(scope instanceof Element && scope.matches(AGO) ? [scope] : []), ...scope.querySelectorAll(AGO)]);
    }

    /** Lines that arrived or changed are adopted; lines that left are dropped. @param {MutationRecord[]} records @param {Window & typeof globalThis} view */
    onMutations(records, view) {
        let removed = false;
        for (const record of records) {
            if (record.type === 'attributes') {
                const el = /** @type {HTMLElement} */ (record.target);
                if (el.matches(AGO)) adopt(el, this.ctx);
                continue;
            }
            for (const node of record.addedNodes) {
                // `view.Element` is the watched document's own Element class, which an iframe's nodes are instances of.
                if (node instanceof view.Element) for (const el of this.linesIn(node)) adopt(el, this.ctx);
            }
            if (record.removedNodes.length) removed = true;
        }
        if (removed) queueMicrotask(() => this.dropGone());
        steer();
    }

    /** Lines that left the page stop ticking. */
    dropGone() {
        for (const el of live.keys()) if (!el.isConnected) live.delete(el);
        steer();
    }

    /** The face changed: measure every width again and repaint this call's lines. */
    remeasure() {
        widths.clear();
        for (const [el, own] of live) {
            const state = states.get(el);
            if (state) state.sample = '';
            if (own.owner === this.token && el.isConnected) paint(el, own);
        }
    }
}
