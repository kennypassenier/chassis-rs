// One running tour: the card on the page, the buttons and keys that move it, how it follows its target, and how it ends and is remembered.

import { playEntranceBackwards, stopReversing } from '../motion.js';
import { tourMemory, TOUR_SLOT } from './memory.js';
import { TourCore } from './core.js';

/** The tour that runs now: a second one ends it first. @type {(() => void) | null} */
let endRunning = null;

export class TourRun extends TourCore {
    /**
     * @param {HTMLElement} host the tour's card
     * @param {import('./core.js').TourRunOptions} options
     */
    constructor(host, options) {
        super(host, options);
        /** Whether the tour has ended; a handle's end() after that does nothing. */
        this.ended = false;
        /** The animation frame a move is waiting for, 0 for none. */
        this.frame = 0;
    }

    connect() {
        const { ui, view, doc, decorate } = this;
        decorate?.(ui.next, { kind: 'tour-next', host: ui.card });
        decorate?.(ui.back, { kind: 'tour-back', host: ui.card });
        decorate?.(ui.skip, { kind: 'tour-skip', host: ui.card });
        this.listen(ui.next, 'click', () => (this.index >= this.live.length - 1 ? this.finish(true) : this.show(this.index + 1)));
        this.listen(ui.back, 'click', () => this.index > 0 && this.show(this.index - 1));
        this.listen(ui.skip, 'click', () => this.finish(false));
        this.listen(view, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)), true);
        this.listen(view, 'resize', () => this.onMove());
        this.listen(doc, 'scroll', () => this.onMove(), true);
        endRunning = () => this.finish(false);
        this.show(this.index);
    }

    /** What startTour hands back: end it, or go to a step. @returns {import('../tour.js').TourHandle} */
    handle() {
        return {
            end: () => this.finish(false),
            goto: (i) => {
                if (!this.ended) this.show(Math.min(Math.max(0, i), this.live.length - 1));
            },
        };
    }

    /** End the running tour, if there is one. */
    static endRunning() {
        endRunning?.();
    }

    /** @param {boolean} finished */
    finish(finished) {
        // Once: a handle's end() after the tour already ended does nothing.
        if (this.ended) return;
        this.ended = true;
        this.unmarkStep();
        const card = this.card;
        // The card goes as it came: its entrance played backwards, then it is closed and taken out (Kenny, 2026-10-05: it faded in
        // and vanished at once). The target's mark stays until the card is gone, so the screen un-dims together with the card.
        card.inert = true;
        card.removeAttribute('data-kp-tour-stepping');
        void playEntranceBackwards(card).then(() => this.leave(card));
        this.destroy();
        endRunning = null;
        // A tour that ended, finished or skipped, does not start by itself again; Help can start it.
        if (this.remember) tourMemory(this.remember)?.write(TOUR_SLOT, true);
        this.onEnd?.(finished);
    }

    /** The card has played out: the mark goes, the card is closed and taken off, and the focus returns. @param {HTMLDialogElement} card */
    leave(card) {
        this.unmark();
        if (card.open) card.close();
        card.remove();
        stopReversing(card);
        // The focus ring on the opener comes back with the card gone, the way it left when the card came: a ring that appears at
        // once at the start of the close is not the opening played backwards.
        if (this.back?.isConnected) this.back.focus();
    }

    /** Place the card on the next frame, once however many moves come. */
    onMove() {
        if (this.frame) return;
        this.frame = this.view.requestAnimationFrame(() => {
            this.frame = 0;
            this.place();
        });
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        if (event.key === 'Escape') {
            // Capture, on the window: Esc ends the tour alone, not a dialog the tour runs in.
            event.preventDefault();
            event.stopPropagation();
            this.finish(false);
            return;
        }
        if (!this.host.contains(/** @type {Node} */ (event.target))) return;
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.ui.next.click();
        } else if (event.key === 'ArrowLeft' && this.index > 0) {
            event.preventDefault();
            this.ui.back.click();
        }
    }
}
