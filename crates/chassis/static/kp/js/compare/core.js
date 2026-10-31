// One slider's panes, its divider and where it stands: moving the divider (with the glide, the values read aloud and the labels stepping aside), and the pointer's position.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { buildCompareParts } from './parts.js';
import { ALL_AFTER, ALL_BEFORE, COMPARE_EVENT, LABEL_EDGE, MIDDLE, TENTH } from './values.js';

export class CompareCore extends Controller {
    /**
     * @param {HTMLElement} host the slider
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.s = getStrings();
        this.doc = host.ownerDocument;
        this.view = this.doc.defaultView ?? window;
        this.before = /** @type {HTMLElement} */ (host.querySelector(':scope > [data-kp-compare-pane="before"]'));
        this.after = /** @type {HTMLElement} */ (host.querySelector(':scope > [data-kp-compare-pane="after"]'));
        this.wordBefore = host.dataset.kpCompareBefore ?? this.s.compareBefore;
        this.wordAfter = host.dataset.kpCompareAfter ?? this.s.compareAfter;
        this.parts = buildCompareParts(this.doc, this.wordBefore, this.wordAfter, host.getAttribute('aria-label') ?? this.s.compareSlider(this.wordBefore, this.wordAfter));
        /** Where the divider stands: 0 (all after) to 100 (all before). */
        this.position = Math.min(ALL_BEFORE, Math.max(ALL_AFTER, Number(host.dataset.kpComparePosition ?? MIDDLE) || 0));
    }

    rtl() {
        return this.view.getComputedStyle(this.host).direction === 'rtl';
    }

    /** The divider's position under a pointer. @param {PointerEvent} event */
    at(event) {
        const box = this.host.getBoundingClientRect();
        const share = ((event.clientX - box.left) / Math.max(1, box.width)) * ALL_BEFORE;
        return this.rtl() ? ALL_BEFORE - share : share;
    }

    /** @param {number} next @param {boolean} fire @param {boolean} glide */
    move(next, fire, glide) {
        const { host: el, s, wordBefore, wordAfter } = this;
        const { handle } = this.parts;
        const to = Math.round(Math.min(ALL_BEFORE, Math.max(ALL_AFTER, next)) * TENTH) / TENTH;
        el.toggleAttribute('data-kp-compare-glide', glide);
        el.style.setProperty('--kp-compare-pos', String(to));
        handle.setAttribute('aria-valuenow', String(Math.round(to)));
        handle.setAttribute('aria-valuetext', s.compareValue(Math.round(to), wordBefore, wordAfter));
        // A label steps aside while the divider covers it.
        el.toggleAttribute('data-kp-compare-before-hidden', to < LABEL_EDGE);
        el.toggleAttribute('data-kp-compare-after-hidden', to > ALL_BEFORE - LABEL_EDGE);
        const moved = to !== this.position;
        this.position = to;
        if (fire && moved) el.dispatchEvent(new CustomEvent(COMPARE_EVENT, { bubbles: true, detail: { position: to } }));
    }
}
