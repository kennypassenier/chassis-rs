// The watch on a root: it finds the parts that wait, dresses them while they wait, and follows theme, state and size changes.

import { Controller } from '../controller.js';
import { ALL, WATCHED } from './values.js';
import { dress, undress } from './dress.js';

/** One attach call on a root (a document, a shadow root or an element), which is the controller's host, built directly. */
export class LoadingPiecesWatch extends Controller {
    /** @param {ParentNode} scope */
    constructor(scope) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (scope)));
        this.scope = scope;
        /** The parts that wear pieces now. @type {Set<Element>} */
        this.dressed = new Set();
        /** The parts to look at again at the next frame. @type {Set<Element>} */
        this.waiting = new Set();
        /** The animation frame of the next flush, or 0. */
        this.frame = 0;
        /** Whether the next flush looks at every part under the root. */
        this.everything = false;
        /** Watches the size of the dressed parts, where the engine can. @type {ResizeObserver | null} */
        this.sizes = null;
    }

    connect() {
        if (typeof MutationObserver !== 'function' || typeof getComputedStyle !== 'function') return;
        // Runs last on detach: every piece goes, the parts are as they came.
        this.own(() => this.undressAll());
        this.own(() => {
            if (this.frame) cancelAnimationFrame(this.frame);
        });
        if (typeof ResizeObserver === 'function') this.sizes = this.observe(new ResizeObserver((entries) => entries.forEach((e) => this.queue(e.target))));
        const watch = this.observe(new MutationObserver((records) => this.onMutations(records)));
        const scope = this.scope;
        const target = /** @type {Node} */ (scope instanceof Document ? scope.documentElement : scope);
        watch.observe(target, { subtree: true, childList: true, attributes: true, attributeFilter: WATCHED });
        // A second observe() of the same node replaces the first one's options, so
        // the theme on <html> is watched only from a root below it; from the
        // document, the subtree watch above already sees it (`data-theme` is in
        // WATCHED). Observing <html> twice left only the theme watched, and a part
        // that started waiting after the first paint got no pieces.
        if (target !== document.documentElement) watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        this.everything = true;
        this.schedule();
    }

    schedule() {
        if (!this.frame) this.frame = requestAnimationFrame(() => this.flush());
    }

    /** @param {Element} el */
    queue(el) {
        this.waiting.add(el);
        this.schedule();
    }

    /** Look at the queued parts, or at every part when the theme changed. */
    flush() {
        this.frame = 0;
        if (this.destroyed) return;
        const all = this.everything;
        this.everything = false;
        const parts = all ? /** @type {Element[]} */ ([.../** @type {ParentNode} */ (this.scope).querySelectorAll(ALL)]) : [...this.waiting];
        this.waiting.clear();
        if (all) for (const el of this.dressed) if (!parts.includes(el)) parts.push(el);
        for (const el of parts) this.refresh(el);
    }

    /** Dress one part, or let it go when it left the page or stopped waiting. @param {Element} el */
    refresh(el) {
        if (!(el instanceof HTMLElement)) return;
        if (!el.isConnected) {
            this.release(el);
            return;
        }
        if (dress(el)) {
            if (!this.dressed.has(el)) {
                this.dressed.add(el);
                this.sizes?.observe(el);
            }
        } else if (this.dressed.has(el)) this.release(el);
    }

    /** @param {Element} el */
    release(el) {
        this.dressed.delete(el);
        this.sizes?.unobserve(el);
    }

    undressAll() {
        for (const el of this.dressed) undress(el);
        this.dressed.clear();
    }

    /** @param {MutationRecord[]} records */
    onMutations(records) {
        for (const r of records) {
            if (r.type === 'attributes') this.onAttribute(r);
            else this.onChildren(r);
        }
        this.schedule();
    }

    /** @param {MutationRecord} r */
    onAttribute(r) {
        const target = /** @type {Element} */ (r.target);
        if (r.attributeName === 'data-theme' || target === document.documentElement) this.everything = true;
        if (target.matches?.(ALL) || this.dressed.has(target)) this.queue(target);
        // A busy grid or menu changes its parts' state from above.
        for (const el of target.querySelectorAll?.(ALL) ?? []) this.queue(el);
        for (const el of this.dressed) if (target.contains?.(el)) this.queue(el);
    }

    /** @param {MutationRecord} r */
    onChildren(r) {
        const target = /** @type {Element} */ (r.target);
        // A part that waits by what it holds (a heat grid's row of waiting cells) changes with its children.
        if (target.matches?.(ALL) || this.dressed.has(target)) this.queue(target);
        for (const node of r.addedNodes) {
            if (!(node instanceof Element) || node.classList.contains('kp-pieces')) continue;
            if (node.matches(ALL)) this.queue(node);
            for (const el of node.querySelectorAll(ALL)) this.queue(el);
        }
        for (const node of r.removedNodes) {
            if (!(node instanceof Element)) continue;
            // A component that redraws a waiting part's children takes the pieces with them: put them back.
            if (node.classList.contains('kp-pieces')) {
                if (this.dressed.has(target)) this.queue(target);
            } else if (this.dressed.has(node)) this.queue(node);
        }
    }
}

/**
 * Watch `root` for parts that wait and give each the pieces its theme
 * names (the body of attachLoadingPieces()).
 * @param {ParentNode} root
 * @returns {() => void} detach: every piece goes, the parts are as they came
 */
export function watchPieces(root) {
    const watch = new LoadingPiecesWatch(root);
    try {
        watch.connect();
    } catch (error) {
        watch.destroy();
        throw error;
    }
    return () => watch.destroy();
}
