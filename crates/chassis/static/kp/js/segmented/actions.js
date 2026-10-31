// Pressing an item: what a click or the keyboard's choice does, and the event it fires.

import { getStrings } from '../strings.js';
import { SEGMENTED_EVENT, TRI_STATES } from './constants.js';
import { getSegmentedTri, getSegmentedValues, groupDisabled, isAll, isMulti, isOptional, isTri, itemDisabled, labelOf, triOf, valueOf } from './read.js';
import { resetSegmented } from './api.js';
import { paint } from './paint.js';
import { paintTri, sayTri, triWords, writeTri } from './tri.js';

/**
 * Give one three-way chip a state, say so and fire the event.
 * @param {Element} group @param {HTMLElement} item @param {'any' | 'include' | 'exclude'} state
 */
export function turnTri(group, item, state) {
    if (triOf(item) === state) return;
    writeTri(item, state);
    paintTri(group);
    sayTri(group, getStrings().triAnnounce(labelOf(item), triWords(item)[state]));
    const { include, exclude } = getSegmentedTri(group);
    group.dispatchEvent(
        new CustomEvent(SEGMENTED_EVENT, { bubbles: true, detail: { value: valueOf(item), values: include, include, exclude, state, item } }),
    );
}

/** The values on after a press on `item`: a toggle adds or drops the value, a radio takes it alone. @param {Element} group @param {HTMLElement} item @param {string[]} before */
function nextValues(group, item, before) {
    const value = valueOf(item);
    // A press on the value already chosen lets it go, in a group that may have none.
    if (!isMulti(group)) return isOptional(group) && before.includes(value) ? [] : [value];
    if (isAll(item)) return [];
    return before.includes(value) ? before.filter((v) => v !== value) : [...before, value];
}

/**
 * Press one item: what a click or the keyboard's choice does.
 * @param {Element} group
 * @param {HTMLElement} item
 */
export function choose(group, item) {
    if (groupDisabled(group) || itemDisabled(item)) return;
    if (isTri(group)) {
        if (isAll(item)) return resetSegmented(group);
        turnTri(group, item, TRI_STATES[(TRI_STATES.indexOf(triOf(item)) + 1) % TRI_STATES.length]);
        return;
    }
    const before = getSegmentedValues(group);
    paint(group, nextValues(group, item, before));
    const after = getSegmentedValues(group);
    const changed = after.length !== before.length || after.some((v, at) => v !== before[at]);
    // A press on the value already chosen, or on All while nothing is on, changes nothing.
    if (!changed) return;
    group.dispatchEvent(new CustomEvent(SEGMENTED_EVENT, { bubbles: true, detail: { value: valueOf(item), values: after, item } }));
}
