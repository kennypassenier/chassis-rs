// The side of its field a raised overlay opens on: below where it hangs, above when the window has no room below [fix-30].

import { layoutRect } from './rect.js';

/** @param {HTMLElement} element */
export const clearBlockSide = (element) => {
    element.style.removeProperty('max-block-size');
    element.style.removeProperty('overflow-y');
    delete element.dataset.kpOverlaySide;
};

/** Limit the overlay to `room` px of block size and let it scroll itself. @param {HTMLElement} element @param {number} room @param {number} outside what a max-block-size does not count */
function cap(element, room, outside) {
    element.style.maxBlockSize = `${Math.max(0, Math.floor(room - outside))}px`;
    element.style.overflowY = 'auto';
}

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
    const drawn = layoutRect(element);
    const style = getComputedStyle(element);
    const height = drawn.height;
    // What a max-block-size does not count, for a box that is not border-box.
    const outside = style.boxSizing === 'border-box' ? 0 : height - (Number.parseFloat(style.height) || 0);
    const gap = Math.max(0, drawn.top - field.bottom);
    const view = document.documentElement.clientHeight;
    const below = view - drawn.top;
    const above = field.top - gap;
    if (height <= below || below >= above) {
        if (height > below) cap(element, below, outside);
        return 'below';
    }
    const size = Math.min(height, above);
    const top = Number.parseFloat(element.style.top) || 0;
    element.style.top = `${top + (field.top - gap - size - drawn.top)}px`;
    if (height > above) cap(element, above, outside);
    element.dataset.kpOverlaySide = 'above';
    return 'above';
}
