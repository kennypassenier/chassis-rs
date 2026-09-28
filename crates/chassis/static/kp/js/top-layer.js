// An open overlay above the containers it sits in [2026-09-13].
//
// Four registers draw the silhouette of a container with `clip-path` — the
// cut corners of a card, an alert, a popover, a dialog or a spec sheet in
// dark, cyberpunk, phantom and titanium — and a clip cuts away everything
// inside the box, an open list or calendar included. Measured on
// 2026-09-13 inside a `.kp-card` in those four themes: every day of a date
// picker's calendar (31 of 31) and every option of a combobox and of a
// drawn select (5 of 5; 4 of 5 for phantom's combobox) out of reach, the
// clipped area handing the click to whatever lay beneath. `overflow:
// hidden` on an ancestor does the same. No z-index escapes either; the top
// layer does.
//
// So an overlay the package opens becomes a manual popover for as long as
// it is open. It stays where it is in the document — the child of its
// control, so it inherits the theme, still matches every register
// selector, and focus and `focusout` behave as before — and is placed in
// window coordinates by its component, again whenever anything scrolls or
// the window changes size. A browser without the popover API keeps the
// overlay where it always hung.

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
    const added = !element.hasAttribute('popover');
    if (added) element.setAttribute('popover', 'manual');
    if (!element.matches(':popover-open')) element.showPopover();
    const follow = () => place(element);
    follow();
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', follow);
    // A list that filters or a calendar that turns to a six-week month
    // changes height while open, and the side it fits on can change with it.
    // Placing writes the same size back, so this settles after one call.
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(follow) : null;
    resized?.observe(element);
    return () => {
        resized?.disconnect();
        window.removeEventListener('scroll', follow, { capture: true });
        window.removeEventListener('resize', follow);
        if (element.matches(':popover-open')) element.hidePopover();
        if (added) element.removeAttribute('popover');
        clearBlockSide(element);
    };
}

/** @param {HTMLElement} element */
const clearBlockSide = (element) => {
    element.style.removeProperty('max-block-size');
    element.style.removeProperty('overflow-y');
    delete element.dataset.kpOverlaySide;
};

/**
 * Choose the side of its field a raised overlay opens on [fix-30].
 *
 * Measured on 2026-09-15: a combobox, a drawn select and a date picker at
 * the bottom of a 520px window each opened their overlay below the
 * window's edge (a list from y=486 to 604, a calendar from 512 to 788),
 * where neither a person nor a click could reach it; a fixed box outside
 * the viewport cannot be scrolled into view.
 *
 * The caller has just put the overlay below its field, where it always
 * opened; this reads that spot and keeps it when the overlay fits under
 * the window's bottom edge. When it does not and the room above the field
 * is larger, the overlay moves above the field at the same distance it hung
 * below it, and `data-kp-overlay-side="above"` says so, for a register that
 * wants to mirror something. When neither side holds it, the larger side
 * gets it with a `max-block-size` and the overlay scrolls itself.
 * Only the block axis: the inline placement stays the caller's, RTL
 * included. Horizontal writing modes only, as every caller is.
 *
 * @param {HTMLElement} element the overlay, in the top layer and placed below its field in window coordinates (its `top` written inline)
 * @param {{ top: number, bottom: number }} field the field's box in window coordinates
 * @returns {'below' | 'above'} the side taken
 */
export function placeBlockSide(element, field) {
    clearBlockSide(element);
    const drawn = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const height = drawn.height;
    // What a max-block-size does not count, for a box that is not border-box.
    const outside = style.boxSizing === 'border-box' ? 0 : height - (Number.parseFloat(style.height) || 0);
    /** @param {number} room */
    const cap = (room) => {
        element.style.maxBlockSize = `${Math.max(0, Math.floor(room - outside))}px`;
        element.style.overflowY = 'auto';
    };
    const gap = Math.max(0, drawn.top - field.bottom);
    const view = document.documentElement.clientHeight;
    const below = view - drawn.top;
    const above = field.top - gap;
    if (height <= below || below >= above) {
        if (height > below) cap(below);
        return 'below';
    }
    const size = Math.min(height, above);
    const top = Number.parseFloat(element.style.top) || 0;
    element.style.top = `${top + (field.top - gap - size - drawn.top)}px`;
    if (height > above) cap(above);
    element.dataset.kpOverlaySide = 'above';
    return 'above';
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
    const drawn = element.getBoundingClientRect();
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
