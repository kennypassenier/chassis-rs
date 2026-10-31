// One hover card for a root: the listeners on the root, the pointer and focus asks, the keys, and the handle a page gets back.

import { stopReversing } from '../motion.js';
import { CLOSE_DELAY_MS, OPEN_DELAY_MS } from './values.js';
import { HoverCardTouch } from './touch.js';

export class HoverCard extends HoverCardTouch {
    /**
     * @param {Document | Element} root
     * @param {import('../hovercard.js').HoverCardOptions} [options]
     */
    constructor(root, options) {
        super(root, options);
        /** The detach function, with the card's members on it. @type {import('../hovercard.js').HoverCardHandle} */
        this.handle = this.makeHandle();
    }

    connect() {
        const { root, doc, card } = this;
        this.doc.body.append(card);
        // Registered first, so it runs last on detach: the card is released and leaves the page.
        this.own(() => {
            this.release();
            stopReversing(card);
            this.lower?.();
            card.remove();
        });
        this.listen(root, 'pointerover', (event) => this.onOver(/** @type {PointerEvent} */ (event)));
        this.listen(root, 'pointerout', (event) => this.onOut(/** @type {PointerEvent} */ (event)));
        this.listen(root, 'focusin', (event) => this.onFocusIn(/** @type {FocusEvent} */ (event)));
        this.listen(root, 'focusout', (event) => this.onFocusOut(/** @type {FocusEvent} */ (event)));
        this.listen(card, 'pointerenter', () => this.onCardEnter());
        this.listen(card, 'pointerleave', (event) => this.onCardLeave(/** @type {PointerEvent} */ (event)));
        this.listen(doc, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(root, 'click', (event) => this.onTap(/** @type {MouseEvent} */ (event)));
        this.listen(doc, 'pointerdown', (event) => this.onTouchDown(/** @type {PointerEvent} */ (event)), true);
        // Runs first on detach.
        this.own(() => this.stopTimer());
    }

    /** The detach function a page gets, with the card's members on it. @returns {import('../hovercard.js').HoverCardHandle} */
    makeHandle() {
        return Object.assign(() => this.destroy(), {
            card: this.card,
            open: (/** @type {HTMLElement} */ anchor) => this.schedule(anchor, 0),
            hide: () => this.hide(),
            refresh: () => this.refresh(),
            anchor: () => this.current,
        });
    }

    /** @param {PointerEvent} event */
    onOver(event) {
        if (event.pointerType === 'touch') return;
        const anchor = this.anchorOf(event);
        if (anchor === null || anchor === this.current) {
            if (anchor !== null) this.stopTimer();
            return;
        }
        this.schedule(anchor, this.number(anchor, 'data-kp-open-delay', this.cfg.openDelayMs ?? OPEN_DELAY_MS));
    }

    /** @param {PointerEvent} event */
    onOut(event) {
        if (event.pointerType === 'touch') return;
        const anchor = this.anchorOf(event);
        if (anchor === null) return;
        const to = event.relatedTarget;
        // Still inside the anchor, or on the way to the card: nothing left yet.
        if (to instanceof Node && (anchor.contains(to) || this.card.contains(to))) return;
        if (anchor === this.wanted) {
            this.stopTimer();
            this.unwant();
        }
        if (anchor !== this.current) return;
        // Focus keeps it: a keyboard user's card stays while the pointer wanders off.
        if (anchor.contains(this.doc.activeElement) && anchor.matches(':focus-visible, :has(:focus-visible)')) return;
        this.close(this.number(anchor, 'data-kp-close-delay', this.cfg.closeDelayMs ?? CLOSE_DELAY_MS));
    }

    onCardEnter() {
        this.setOverCard(true);
        this.stopTimer();
    }

    /** @param {PointerEvent} event */
    onCardLeave(event) {
        // A finger lifting off the card is not the pointer leaving it.
        if (event.pointerType === 'touch') return;
        this.setOverCard(false);
        const to = event.relatedTarget;
        if (this.current !== null && to instanceof Node && this.current.contains(to)) return;
        this.close(this.cfg.closeDelayMs ?? CLOSE_DELAY_MS);
    }

    /** @param {FocusEvent} event */
    onFocusIn(event) {
        const anchor = this.anchorOf(event);
        if (anchor !== null) this.schedule(anchor, 0);
    }

    /** @param {FocusEvent} event */
    onFocusOut(event) {
        const anchor = this.anchorOf(event);
        if (anchor === null) return;
        if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
        if (anchor === this.current && !this.overCard) this.close(0);
        else if (anchor === this.wanted) {
            this.stopTimer();
            this.unwant();
        }
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        if (event.key !== 'Escape' || this.current === null) return;
        if (this.cfg.closeOnEscape === false || this.current.getAttribute('data-kp-close-on-escape') === 'false') return;
        this.hide();
    }
}
