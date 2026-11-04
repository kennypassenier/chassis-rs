// The plate under the chosen segment, and the marks for a scrolling track that has more segments out of sight.

import { GLIDE_ATTRIBUTE, MORE_ATTRIBUTE, OVERFLOW_ATTRIBUTE, SCROLL_SLOP_PX, THUMB_ATTRIBUTE } from './constants.js';
import { isMulti, isOn, itemsOf } from './read.js';

/**
 * Which sides of a scrolling track have more segments out of sight, read from the box's own numbers (no write).
 * @param {HTMLElement} group
 * @returns {string[]}
 */
function sidesOf(group) {
    const sides = [];
    if (group.hasAttribute(OVERFLOW_ATTRIBUTE)) {
        const from = Math.abs(group.scrollLeft);
        if (from > SCROLL_SLOP_PX) sides.push('start');
        if (from + group.clientWidth < group.scrollWidth - SCROLL_SLOP_PX) sides.push('end');
    }
    return sides;
}

/** Write the marks `sidesOf` found. @param {HTMLElement} group @param {string[]} sides */
function writeSides(group, sides) {
    if (sides.length) group.setAttribute(MORE_ATTRIBUTE, sides.join(' '));
    else group.removeAttribute(MORE_ATTRIBUTE);
}

/**
 * Note which sides of a scrolling track have more segments out of sight, so the
 * stylesheet fades only those edges (a label at a side with nothing beyond it
 * stays whole).
 * @param {HTMLElement} group
 */
export function reach(group) {
    writeSides(group, sidesOf(group));
}

/**
 * Everything `applyLayout` needs, read without writing a thing: whether the segments overflow, the marks of a scrolling track and
 * the chosen segment's box. The reads of every group of a pass are made together, so the pass costs one layout, not one per group
 * [attach-1104]. Null for what is not an element.
 * @param {Element} group
 */
export function measureLayout(group) {
    if (!(group instanceof HTMLElement)) return null;
    const chips = group.classList.contains('kp-segmented--chips');
    // Chips wrap (or sit in a scrolling filter row); only a track scrolls itself.
    const overflow = !chips && group.scrollWidth > group.clientWidth + SCROLL_SLOP_PX;
    return { overflow, ...measureRest(group, chips) };
}

/** The reads that follow the overflow mark. @param {HTMLElement} group @param {boolean} chips */
function measureRest(group, chips) {
    const chosen = isMulti(group) || chips ? undefined : itemsOf(group).find((item) => isOn(group, item));
    const placed = chosen !== undefined && chosen.offsetWidth !== 0;
    return { sides: sidesOf(group), placed, x: placed ? chosen.offsetLeft : 0, w: placed ? chosen.offsetWidth : 0 };
}

/**
 * Write what `measureLayout` read. When the overflow mark changes, the reads that depend on it are made again after the write, as
 * they always were; with a mark that stays, the reads stand.
 * @param {Element} group
 * @param {NonNullable<ReturnType<typeof measureLayout>>} measured
 */
export function applyLayout(group, measured) {
    if (!(group instanceof HTMLElement)) return;
    let { sides, placed, x, w } = measured;
    if (group.hasAttribute(OVERFLOW_ATTRIBUTE) !== measured.overflow) {
        group.toggleAttribute(OVERFLOW_ATTRIBUTE, measured.overflow);
        ({ sides, placed, x, w } = measureRest(group, group.classList.contains('kp-segmented--chips')));
    }
    writeSides(group, sides);
    if (!placed) {
        group.removeAttribute(THUMB_ATTRIBUTE);
        group.removeAttribute(GLIDE_ATTRIBUTE);
        return;
    }
    group.style.setProperty('--kp-seg-x', `${x}px`);
    group.style.setProperty('--kp-seg-w', `${w}px`);
    if (!group.hasAttribute(THUMB_ATTRIBUTE)) {
        group.setAttribute(THUMB_ATTRIBUTE, '');
        // Placed, not moved: the glide starts with the next change.
        requestAnimationFrame(() => requestAnimationFrame(() => group.hasAttribute(THUMB_ATTRIBUTE) && group.setAttribute(GLIDE_ATTRIBUTE, '')));
    }
}

/**
 * Place the plate under the chosen segment (single, segmented look) and note
 * whether the segments overflow the group.
 * @param {Element} group
 */
export function layout(group) {
    const measured = measureLayout(group);
    if (measured) applyLayout(group, measured);
}

/**
 * Place the plates of several groups: every read first, then every write.
 * @param {Element[]} groups
 */
export function layoutGroups(groups) {
    const measured = groups.map((group) => measureLayout(group));
    groups.forEach((group, i) => measured[i] && applyLayout(group, measured[i]));
}
