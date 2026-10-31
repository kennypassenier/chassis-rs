// Raising an overlay into the top layer while it is open: an OverlayRaise per overlay, and the placement in place.

import { Controller } from '../controller.js';
import { layoutRect } from './rect.js';
import { clearBlockSide, placeBlockSide } from './side.js';

/** One raised overlay: a manual popover that is placed again on every scroll, resize and size change until it is lowered. */
class OverlayRaise extends Controller {
    /**
     * @param {HTMLElement} host the overlay, already visible (not `hidden`)
     * @param {{ place: (element: HTMLElement) => void }} options place puts it in window coordinates
     */
    constructor(host, options) {
        super(host, options);
        this.place = options.place;
    }

    connect() {
        const element = this.host;
        const added = !element.hasAttribute('popover');
        // Runs last on lowering: out of the top layer, and what raising wrote removed.
        this.own(() => {
            if (element.matches(':popover-open')) element.hidePopover();
            if (added) element.removeAttribute('popover');
            clearBlockSide(element);
        });
        if (added) element.setAttribute('popover', 'manual');
        if (!element.matches(':popover-open')) element.showPopover();
        const follow = () => this.follow();
        follow();
        this.listen(window, 'scroll', follow, { capture: true, passive: true });
        this.listen(window, 'resize', follow);
        // A list that filters or a calendar that turns to a six-week month
        // changes height while open, and the side it fits on can change with it.
        // Placing writes the same size back, so this settles after one call.
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(follow)).observe(element);
    }

    follow() {
        if (this.destroyed) return;
        const element = this.host;
        // Moved in the document (a page that re-parents its sections, the review dialog's stage) the browser takes a
        // popover out of the top layer without a word; while the overlay is still meant to be showing, it is put back.
        if (element.isConnected && !element.hidden && !element.matches(':popover-open')) element.showPopover();
        this.place(element);
    }
}

/**
 * Raise an overlay that is being shown into the top layer.
 *
 * @param {HTMLElement} element the overlay, already visible (not `hidden`)
 * @param {(element: HTMLElement) => void} place puts it in window coordinates; called now and on every scroll and resize
 * @returns {() => void} lower — takes it out of the top layer, stops following, and removes what raising wrote
 */
export function raiseOverlay(element, place) {
    if (typeof element.showPopover !== 'function' || !element.isConnected) {
        place(element);
        return () => {};
    }
    // Built directly, not keyed on the element: a second raise of one overlay lowers on its own, as it always did.
    const raise = new OverlayRaise(element, { place });
    try {
        raise.connect();
    } catch (error) {
        raise.destroy();
        throw error;
    }
    return () => raise.destroy();
}

/**
 * Raise an overlay exactly where it was drawn: the spot and the width it
 * had in its container a moment ago, held against `anchor` while it is
 * open. For an overlay the stylesheet already places (a combobox's list at
 * its static position under the input), so the placement stays the
 * stylesheet's and a register that moves it is still obeyed.
 *
 * When the window has no room below, it opens above `field` instead
 * (placeBlockSide).
 *
 * @param {HTMLElement} element the overlay, already visible and laid out in place
 * @param {Element} anchor what it moves with — the control it belongs to
 * @param {Element} [field] what it opens under, and above when there is no room below — the input; the anchor when not given
 * @returns {() => void} lower
 */
export function raiseInPlace(element, anchor, field = anchor) {
    const drawn = layoutRect(element);
    const from = anchor.getBoundingClientRect();
    const dx = drawn.left - from.left;
    const dy = drawn.top - from.top;
    const width = drawn.width;
    const lower = raiseOverlay(element, () => {
        const at = anchor.getBoundingClientRect();
        const style = getComputedStyle(element);
        // A fixed box adds its own margins again, so they come off the spot it was drawn at.
        element.style.left = `${at.left + dx - (Number.parseFloat(style.marginLeft) || 0)}px`;
        element.style.top = `${at.top + dy - (Number.parseFloat(style.marginTop) || 0)}px`;
        element.style.width = `${width}px`;
        placeBlockSide(element, field.getBoundingClientRect());
    });
    return () => {
        lower();
        element.style.removeProperty('left');
        element.style.removeProperty('top');
        element.style.removeProperty('width');
    };
}

/**
 * Whether the overlay is in the top layer right now, and so placed in
 * window coordinates rather than against its containing block.
 *
 * @param {Element} element
 */
export const raised = (element) => element.matches(':popover-open');
