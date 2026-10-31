// Opens and closes the panel: the top layer, the arrival and the close played backwards, and where the focus goes afterwards.

import { playClose, stopClose } from '../motion.js';
import { OPEN_EVENT } from './constants.js';
import { raiseDatePanel } from './place.js';

/** The panel's open state for one picker. */
export class PanelOpening {
    /** @param {import('./controller.js').DatePickerController} ctl */
    constructor(ctl) {
        this.ctl = ctl;
        /** Takes the open panel out of the top layer again. */
        this.lower = () => {};
        /** Whether the picker is meant to be open: the panel may still be closing on screen. */
        this.wanted = false;
        /** The close that is playing, so the focus can wait for it. @type {Promise<unknown>} */
        this.closing = Promise.resolve();
    }

    /**
     * The focus goes back to `el` when the panel is gone, the way it left when the panel came: a ring
     * that comes back at once at the start of the close is not the opening played backwards
     * (docs/THEME_LESSONS.md 11; the tour does the same).
     * @param {HTMLElement} el
     */
    refocusAfterClose(el) {
        void this.closing.then(() => {
            if (!this.wanted && el.isConnected) el.focus();
        });
    }

    /** @param {boolean} next */
    setOpen(next) {
        if (this.wanted === next) return;
        const { picker, open, views, live } = this.ctl;
        this.wanted = next;
        views.reset();
        live.textContent = '';
        if (next) this.show();
        else this.hidePanel();
        open.setAttribute('aria-expanded', String(next));
        if (next) views.focusCurrent();
        picker.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: next } }));
    }

    /** Draw the days and bring the panel up, unless it is still closing, when it turns round where it stands. */
    show() {
        const { panel, live } = this.ctl;
        this.ctl.tidy();
        this.ctl.cursor = this.ctl.read() ?? new Date();
        if (!panel.contains(live)) panel.append(live);
        this.ctl.draw();
        stopClose(panel);
        panel.inert = false;
        if (panel.hidden) {
            panel.hidden = false;
            panel.dataset.kpDateOpen = '';
            this.lower = raiseDatePanel(panel);
        }
    }

    /**
     * It closes as it opened, backwards, before it is hidden; meanwhile it takes no pointer or focus. The close reads the opening on the
     * panel as it stands (`[data-kp-date-open]` still on it), so it plays that backwards instead of taking the opening's name as a close of
     * its own and playing it forwards; the mark goes straight after.
     */
    hidePanel() {
        const { panel } = this.ctl;
        panel.style.removeProperty('min-inline-size');
        panel.style.removeProperty('min-block-size');
        panel.inert = true;
        const closed = playClose(panel);
        this.closing = closed;
        delete panel.dataset.kpDateOpen;
        void closed.then((played) => {
            if (!played || this.wanted) return;
            // Hidden first, then out of the top layer: hidden, it has no box for a second close to play on (js/motion.js).
            panel.hidden = true;
            this.lower();
            this.lower = () => {};
            panel.inert = false;
            stopClose(panel);
        });
    }
}
