// The plate under the chosen segment, and the marks for a scrolling track that has more segments out of sight.

import { GLIDE_ATTRIBUTE, MORE_ATTRIBUTE, OVERFLOW_ATTRIBUTE, SCROLL_SLOP_PX, THUMB_ATTRIBUTE } from './constants.js';
import { isMulti, isOn, itemsOf } from './read.js';

/**
 * Note which sides of a scrolling track have more segments out of sight, so the
 * stylesheet fades only those edges (a label at a side with nothing beyond it
 * stays whole).
 * @param {HTMLElement} group
 */
export function reach(group) {
    const sides = [];
    if (group.hasAttribute(OVERFLOW_ATTRIBUTE)) {
        const from = Math.abs(group.scrollLeft);
        if (from > SCROLL_SLOP_PX) sides.push('start');
        if (from + group.clientWidth < group.scrollWidth - SCROLL_SLOP_PX) sides.push('end');
    }
    if (sides.length) group.setAttribute(MORE_ATTRIBUTE, sides.join(' '));
    else group.removeAttribute(MORE_ATTRIBUTE);
}

/**
 * Place the plate under the chosen segment (single, segmented look) and note
 * whether the segments overflow the group.
 * @param {Element} group
 */
export function layout(group) {
    if (!(group instanceof HTMLElement)) return;
    const chips = group.classList.contains('kp-segmented--chips');
    // Chips wrap (or sit in a scrolling filter row); only a track scrolls itself.
    group.toggleAttribute(OVERFLOW_ATTRIBUTE, !chips && group.scrollWidth > group.clientWidth + SCROLL_SLOP_PX);
    reach(group);
    const chosen = isMulti(group) || chips ? undefined : itemsOf(group).find((item) => isOn(group, item));
    if (!chosen || chosen.offsetWidth === 0) {
        group.removeAttribute(THUMB_ATTRIBUTE);
        group.removeAttribute(GLIDE_ATTRIBUTE);
        return;
    }
    group.style.setProperty('--kp-seg-x', `${chosen.offsetLeft}px`);
    group.style.setProperty('--kp-seg-w', `${chosen.offsetWidth}px`);
    if (!group.hasAttribute(THUMB_ATTRIBUTE)) {
        group.setAttribute(THUMB_ATTRIBUTE, '');
        // Placed, not moved: the glide starts with the next change.
        requestAnimationFrame(() => requestAnimationFrame(() => group.hasAttribute(THUMB_ATTRIBUTE) && group.setAttribute(GLIDE_ATTRIBUTE, '')));
    }
}
