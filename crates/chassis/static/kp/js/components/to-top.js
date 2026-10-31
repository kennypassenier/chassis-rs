// The back-to-top button.
import { Controller, attachOne } from '../controller.js';
import { getStrings } from '../strings.js';

/** Fired on the control when it appears or goes away: `{ shown }`. */
export const TO_TOP_EVENT = 'kp-to-top';
/** The attribute that marks a back-to-top control [feat-page-1]. */
export const TO_TOP = '[data-kp-to-top]';
/** How far (px) the page scrolls before the control shows, when neither the call nor `data-kp-to-top-after` says. */
const DEFAULT_AFTER = '400';
/**
 * Wire every back-to-top control under `root` [feat-page-1].
 *
 * Two halves, and the second is the one usually missing: it takes the
 * reader back, and it takes the FOCUS back. A control that only scrolls
 * leaves a keyboard user at the bottom of the document with the view at
 * the top, which is worse than not moving at all.
 *
 * Where the focus lands is `data-kp-to-top-target`, a selector, and it
 * falls back to the document's own body — the top of the page, which is
 * what the control is named after. It is NOT the skip link's target: on a
 * page with anything tall above the content, focusing that landmark
 * scrolls straight back down to it and undoes the journey. Scrolling is
 * left to the browser: `scrollTo` follows the root's own scroll-behaviour,
 * which is the knob feat-layout-2 already put there and which a reader who
 * asked for less motion has already overruled.
 *
 * @param {ParentNode} root
 * @param {{ strings?: Partial<import('../strings.js').Strings>, after?: number }} [options]
 * @returns {() => void} detach
 */
export function attachToTop(root = document, { strings, after } = {}) {
    // A control marked attached is wired already; one outside a window has nothing to scroll.
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(TO_TOP)])
        .filter((button) => !('kpToTopAttached' in button.dataset) && button.ownerDocument.defaultView)
        .map((button) => attachOne(button, ToTopControl, { strings, after }));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}

/** One back-to-top control: whether it is shown, whether a decision is queued for the next frame, and the glyph it added. */
class ToTopControl extends Controller {
    /** @param {HTMLElement} host @param {{ strings?: Partial<import('../strings.js').Strings>, after?: number }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.doc = host.ownerDocument;
        this.view = /** @type {Window} */ (this.doc.defaultView);
        /** The distance (px) scrolled past which the control shows. */
        this.threshold = options.after ?? Number(host.getAttribute('data-kp-to-top-after') ?? DEFAULT_AFTER);
        /** The selector of the element the focus lands on; empty: the body. */
        this.target = host.getAttribute('data-kp-to-top-target') ?? '';
        this.strings = options.strings;
        /** Whether the control is shown now. */
        this.shown = false;
        /** Whether a decision waits for the next frame. */
        this.queued = false;
        /** The glyph this controller put into an empty control. @type {HTMLElement | null} */
        this.glyph = null;
    }

    connect() {
        const button = this.host;
        button.dataset.kpToTopAttached = '';
        // Registered first, so it runs last: the shown mark, the glyph and the attached mark go after the listeners.
        this.own(() => {
            button.removeAttribute('data-kp-to-top-shown');
            this.glyph?.remove();
            delete button.dataset.kpToTopAttached;
        });
        this.label();
        this.decide();
        // Captured on the document: a box's scroll does not bubble, and the window's reaches the document as well.
        this.listen(this.doc, 'scroll', () => this.onScroll(), { passive: true, capture: true });
        this.listen(button, 'click', () => this.onClick());
    }

    /**
     * A control without words gets the dictionary's name, and an empty one the package's glyph [gap-12]: written the documented
     * way it painted as an empty box. The glyph is empty and hidden from the accessibility tree; css/components.css draws the arrow.
     */
    label() {
        const button = this.host;
        if (button.getAttribute('aria-label') === null && button.textContent?.trim() === '') {
            button.setAttribute('aria-label', { ...getStrings(), ...this.strings }.backToTop);
        }
        if (button.children.length > 0 || button.textContent?.trim() !== '') return;
        this.glyph = this.doc.createElement('span');
        this.glyph.className = 'kp-to-top__glyph';
        this.glyph.setAttribute('aria-hidden', 'true');
        button.append(this.glyph);
    }

    /**
     * The box that scrolls the control's page: the window (null), or a scrolling box it sits in (a dashboard's main, a review
     * dialog's stage; Kenny, 2026-10-13: "the back to top didn't seem to work" in such a stage). Read at every use, since a box
     * can move the control into another scroller after it was attached.
     * @returns {HTMLElement | null}
     */
    scroller() {
        const { doc, view } = this;
        for (let box = this.host.parentElement; box && box !== doc.body && box !== doc.documentElement; box = box.parentElement) {
            const overflow = view.getComputedStyle(box).overflowY;
            if (/auto|scroll|overlay/.test(overflow) && box.scrollHeight > box.clientHeight + 1) return box;
        }
        return null;
    }

    /** Show or hide the control by how far its page is scrolled, and tell the page when that changes. */
    decide() {
        this.queued = false;
        const box = this.scroller();
        const next = (box ? box.scrollTop : this.view.scrollY) > this.threshold;
        if (next === this.shown) return;
        this.shown = next;
        this.host.toggleAttribute('data-kp-to-top-shown', next);
        this.host.dispatchEvent(new CustomEvent(TO_TOP_EVENT, { bubbles: true, detail: { shown: next } }));
    }

    /** One decision per frame: a scroll fires far more often than a page can paint, and the answer cannot change in between. */
    onScroll() {
        if (this.queued) return;
        this.queued = true;
        this.view.requestAnimationFrame(() => {
            if (!this.destroyed) this.decide();
        });
    }

    /**
     * Scroll to the top, and move the focus WITHOUT scrolling. Focusing an element normally brings it into view, which undid the
     * journey: on a page whose main landmark starts 2737px down, "back to top" landed back at 3476. So the target is the top of the
     * document unless the page names another, and either way the focus moves quietly while the scroll does the travelling.
     */
    onClick() {
        (this.scroller() ?? this.view).scrollTo({ top: 0 });
        const to = /** @type {HTMLElement | null} */ (this.target === '' ? null : this.doc.querySelector(this.target)) ?? this.doc.body;
        if (!to.hasAttribute('tabindex')) to.setAttribute('tabindex', '-1');
        to.focus({ preventScroll: true });
    }
}
