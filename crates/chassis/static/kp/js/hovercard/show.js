// Opening, moving, closing and refreshing the one card: the entrance, the going-out played backwards, the pending asks.

import { playEntranceBackwards, stopReversing } from '../motion.js';
import { raiseOverlay } from '../top-layer.js';
import { HoverCardCore } from './core.js';

export class HoverCardShow extends HoverCardCore {
    /** Opens for `anchor`, or moves to it when already open. @param {HTMLElement} anchor */
    open(anchor) {
        const card = this.card;
        this.unwant();
        if (!anchor.isConnected || anchor === this.current) return;
        if (!this.fillFor(anchor)) {
            // Nothing to say for this one: an open card for the last one goes.
            if (this.current !== null) this.close(0);
            return;
        }
        if (this.going) {
            // Wanted back while it was leaving: the entrance turns round.
            this.setGoing(false);
            stopReversing(card);
        }
        const was = this.current;
        if (was !== null) {
            this.undescribe(was);
            this.announce(false, was);
        }
        this.arrive(anchor);
        this.announce(true, anchor);
    }

    /** The card is now for this anchor: described, shown or moved, and watched for the anchor's removal. @param {HTMLElement} anchor */
    arrive(anchor) {
        this.setCurrent(anchor);
        this.openedAt = performance.now();
        this.describe(anchor);
        if (this.card.hidden) {
            this.card.hidden = false;
            this.lower = raiseOverlay(this.card, (el) => this.place(el));
        } else this.place(this.card);
        // A rebuild that removes the open anchor takes the card with it.
        this.watch ??= new MutationObserver(() => {
            if (this.current !== null && !this.current.isConnected) this.hide();
        });
        this.watch.observe(this.doc.body, { childList: true, subtree: true });
    }

    /** The card goes the way it came, then is hidden. */
    hide() {
        this.stopTimer();
        this.unwant();
        const anchor = this.current;
        if (anchor === null || this.going) return;
        this.setCurrent(null);
        this.overCard = false;
        this.watch?.disconnect();
        if (anchor.isConnected) this.undescribe(anchor);
        else this.described = null;
        this.setGoing(true);
        void playEntranceBackwards(this.card).then(() => {
            // Wanted back meanwhile: open() took it over.
            if (this.going) this.finish();
        });
        this.announce(false, anchor);
    }

    /** The going-out is over: the card is hidden, lowered and emptied. */
    finish() {
        this.setGoing(false);
        this.card.hidden = true;
        stopReversing(this.card);
        this.lower?.();
        this.lower = null;
        this.card.replaceChildren();
    }

    /** @param {number} delay */
    close(delay) {
        this.stopTimer();
        if (delay <= 0) this.hide();
        else this.startTimer(() => this.hide(), delay);
    }

    /** @param {HTMLElement} anchor @param {number} delay */
    schedule(anchor, delay) {
        this.stopTimer();
        this.setWanted(anchor);
        if (delay <= 0 || this.current !== null) this.open(anchor);
        else this.startTimer(() => this.open(anchor), delay);
    }

    /** Fill the card again for the open anchor (data that changed under the pointer). */
    refresh() {
        if (this.current !== null && this.current.isConnected && this.fillFor(this.current)) this.place(this.card);
        else this.hide();
    }
}
