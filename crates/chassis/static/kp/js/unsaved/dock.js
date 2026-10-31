// Where the bar stands: in the header, or docked to the screen once the header is out of view; and when it goes compact.

import { COMPACT_BELOW_PX } from './config.js';
import { arriveShown } from '../motion.js';

/** Docks one bar and folds Discard behind More when there is little room. */
export class BarDock {
    /** @param {import('./controller.js').UnsavedController} ctl */
    constructor(ctl) {
        this.ctl = ctl;
        /** Whether the bar's place in the header has scrolled out of view. */
        this.headerOut = false;
    }

    /** Watch the header's visibility and the room the bar has; the observers go with the controller. */
    connect() {
        const { el, settings, parts } = this.ctl;
        if (typeof IntersectionObserver !== 'undefined' && settings.placement === 'header+sticky') {
            this.ctl
                .observe(
                    new IntersectionObserver(
                        (entries) => {
                            const entry = entries[entries.length - 1];
                            if (!entry) return;
                            this.headerOut = !entry.isIntersecting;
                            this.dock();
                        },
                        { root: settings.scrollRoot, threshold: 0 },
                    ),
                )
                .observe(el);
        }
        if (typeof ResizeObserver !== 'undefined') {
            const size = this.ctl.observe(new ResizeObserver(() => this.compact()));
            size.observe(this.roomBox());
            size.observe(parts.bar);
        }
    }

    /** The box whose width is the room the bar has when it is not docked. */
    roomBox() {
        const { el } = this.ctl;
        return el.closest('.kp-page-header') ?? el.parentElement ?? el;
    }

    /** Dock the bar when it has changes and should be on screen; undock it otherwise. */
    dock() {
        const { el, settings, parts, tracker } = this.ctl;
        const dirty = tracker.changes().length > 0;
        const want = dirty && (settings.placement === 'sticky-bottom' || (settings.placement === 'header+sticky' && this.headerOut));
        const docked = el.hasAttribute('data-kp-docked');
        if (want === docked) return;
        if (want) {
            // The place in the header keeps its size while the bar is away, so nothing moves.
            const box = parts.bar.getBoundingClientRect();
            el.style.setProperty('--kp-unsaved-w', `${Math.round(box.width)}px`);
            el.style.setProperty('--kp-unsaved-h', `${Math.round(box.height)}px`);
            el.setAttribute('data-kp-docked', settings.dockInContainer ? 'container' : 'viewport');
            arriveShown(parts.bar);
        } else {
            el.removeAttribute('data-kp-docked');
            el.style.removeProperty('--kp-unsaved-w');
            el.style.removeProperty('--kp-unsaved-h');
        }
    }

    /** Where there is less than 30rem for it (the header's width, or the docked bar's), Discard goes behind More. */
    compact() {
        const { el, parts } = this.ctl;
        const room = el.hasAttribute('data-kp-docked') ? parts.bar.getBoundingClientRect().width : this.roomBox().getBoundingClientRect().width;
        parts.bar.toggleAttribute('data-kp-compact', room > 0 && room < COMPACT_BELOW_PX);
    }
}
