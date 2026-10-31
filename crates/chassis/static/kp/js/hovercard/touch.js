// The touch half of the card: a tap opens and closes it, a tap outside closes it, and a control's own tap waits for the second one.

import { CONTROL_SELECTOR, TAP_ANSWERED_MS } from './values.js';
import { HoverCardShow } from './show.js';

export class HoverCardTouch extends HoverCardShow {
    /** Whether a tap on this anchor is the anchor's own (a link, a button, a field). @param {HTMLElement} anchor */
    isControl(anchor) {
        return anchor.matches(CONTROL_SELECTOR);
    }

    /** What a tap on this anchor does: `tap` opens the card, `off` leaves the anchor alone. @param {HTMLElement} anchor */
    touchMode(anchor) {
        const own = anchor.getAttribute('data-kp-touch');
        if (this.cfg.touch === false || own === 'off') return 'off';
        return own === 'tap' || !this.isControl(anchor) ? 'tap' : 'off';
    }

    /** A tap outside the card and its anchor closes it, before the tap does anything else. @param {PointerEvent} event */
    onTouchDown(event) {
        if (event.pointerType !== 'touch' || this.current === null) return;
        const target = event.target;
        if (target instanceof Node && (this.card.contains(target) || this.current.contains(target))) return;
        this.hide();
    }

    /** A tap on an anchor opens the card, or closes it when it is the open one. @param {MouseEvent} event */
    onTap(event) {
        if (/** @type {PointerEvent} */ (event).pointerType !== 'touch') return;
        const anchor = this.anchorOf(event);
        if (anchor === null || this.touchMode(anchor) === 'off') return;
        if (anchor === this.current) {
            // Focus opened it a moment ago (a tap focuses a focusable anchor): that was this tap.
            if (performance.now() - this.openedAt > TAP_ANSWERED_MS) this.hide();
            else if (this.isControl(anchor)) event.preventDefault();
            return;
        }
        this.stopTimer();
        this.open(anchor);
        // Opened: a control's own action waits for the second tap.
        if (this.current === anchor && this.isControl(anchor)) event.preventDefault();
    }
}
