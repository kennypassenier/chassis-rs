// One wired slider: its panes dressed, the parts placed, the drag and the keys, and the way it is taken down.

import { CompareLoad } from './load.js';
import { compareKey } from './keys.js';
import { ALL_AFTER, ALL_BEFORE, INTERACTIVE } from './values.js';

export class Compare extends CompareLoad {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** Whether a drag is under way. */
        this.dragging = false;
    }

    connect() {
        const el = this.host;
        const { before, after } = this;
        const { labelBefore, labelAfter, divider, handle, wait } = this.parts;
        el.classList.add('kp-compare');
        before.classList.add('kp-compare__pane', 'kp-compare__pane--before');
        after.classList.add('kp-compare__pane', 'kp-compare__pane--after');
        if (el.dataset.kpCompareRatio) el.style.setProperty('--kp-compare-ratio', el.dataset.kpCompareRatio);
        const live = Boolean(before.querySelector(INTERACTIVE) || after.querySelector(INTERACTIVE));
        el.dataset.kpCompareDrag = el.dataset.kpCompareDrag ?? (live ? 'handle' : 'anywhere');
        el.append(labelBefore, labelAfter, divider, wait);
        // Registered first, so they run last on detach: the busy card, the added parts and the marks go.
        this.own(() => {
            el.style.removeProperty('--kp-compare-pos');
            el.removeAttribute('aria-busy');
            delete el.dataset.kpCompareState;
        });
        this.own(() => this.card?.remove());
        this.own(() => {
            for (const n of [labelBefore, labelAfter, divider, wait, ...this.notes]) n.remove();
        });
        this.move(this.position, false, false);
        for (const img of this.images) {
            this.listen(img, 'load', () => this.settle());
            this.listen(img, 'error', () => this.settle());
        }
        this.listen(el, 'pointerdown', (event) => this.onDown(/** @type {PointerEvent} */ (event)));
        this.listen(el, 'pointermove', (event) => {
            if (this.dragging) this.move(this.at(/** @type {PointerEvent} */ (event)), true, false);
        });
        this.listen(el, 'pointerup', (event) => this.onUp(/** @type {PointerEvent} */ (event)));
        this.listen(el, 'pointercancel', (event) => this.onUp(/** @type {PointerEvent} */ (event)));
        this.listen(handle, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.settle();
    }

    /** @param {PointerEvent} event */
    onDown(event) {
        const el = this.host;
        const { handle } = this.parts;
        if (event.button !== 0) return;
        // A failed pane's Retry is pressed, not dragged.
        if (event.target instanceof Element && event.target.closest('.kp-compare__failed')) return;
        const onHandle = handle.contains(/** @type {Node} */ (event.target));
        if (!onHandle && el.dataset.kpCompareDrag !== 'anywhere') return;
        this.dragging = true;
        el.setAttribute('data-kp-compare-dragging', '');
        el.setPointerCapture(event.pointerId);
        if (!onHandle) this.move(this.at(event), true, true);
        handle.focus({ preventScroll: true });
        event.preventDefault();
    }

    /** @param {PointerEvent} event */
    onUp(event) {
        if (!this.dragging) return;
        this.dragging = false;
        this.host.removeAttribute('data-kp-compare-dragging');
        if (this.host.hasPointerCapture(event.pointerId)) this.host.releasePointerCapture(event.pointerId);
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const flip = this.rtl() && (event.key === 'ArrowLeft' || event.key === 'ArrowRight');
        const key = flip ? (event.key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft') : event.key;
        const next = compareKey(key, this.position, event.shiftKey);
        if (next === null) return;
        event.preventDefault();
        this.move(next, true, false);
    }
}
