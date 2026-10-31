// The list of changes: opens under the count chip on the overlay layer, closes with motion, and places itself.

import { raiseOverlay, placeBlockSide } from '../top-layer.js';
import { arriveShown, playClose, stopClose } from '../motion.js';
import { PANEL_EDGE_PX, PANEL_GAP_PX } from './config.js';

/** Opens and closes one bar's list panel. */
export class ChangesPanel {
    /** @param {import('./controller.js').UnsavedController} ctl */
    constructor(ctl) {
        this.ctl = ctl;
        /** Puts the panel back below the overlays it was raised over; null while the panel is shut. @type {(() => void) | null} */
        this.lower = null;
    }

    /** Put the panel under the chip, inside the window. @param {HTMLElement} p */
    place(p) {
        const box = this.ctl.parts.chip.getBoundingClientRect();
        const width = p.offsetWidth;
        const left = Math.max(PANEL_EDGE_PX, Math.min(box.left, this.ctl.doc.documentElement.clientWidth - width - PANEL_EDGE_PX));
        p.style.setProperty('left', `${left}px`);
        p.style.setProperty('top', `${box.bottom + PANEL_GAP_PX}px`);
        placeBlockSide(p, box);
    }

    open() {
        const { panel, chip, list, first } = this.ctl.parts;
        if (!panel.hidden || chip.hidden) return;
        stopClose(panel);
        panel.hidden = false;
        this.lower = raiseOverlay(panel, (p) => this.place(p));
        chip.setAttribute('aria-expanded', 'true');
        arriveShown(panel);
        (list.querySelector('button') ?? first).focus();
    }

    /** @param {boolean} [refocus] whether focus goes back to the chip */
    async close(refocus = true) {
        const { panel, chip } = this.ctl.parts;
        if (panel.hidden) return;
        chip.setAttribute('aria-expanded', 'false');
        const done = await playClose(panel);
        if (!done) return;
        panel.hidden = true;
        this.lower?.();
        this.lower = null;
        stopClose(panel);
        if (refocus) chip.focus();
    }
}
