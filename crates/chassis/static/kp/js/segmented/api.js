// The calls a page makes on a group: set its values, its three-way chips and its counts, or reset it; none fires a press.

import { getStrings } from '../strings.js';
import { SEGMENTED_EVENT } from './constants.js';
import { getSegmentedTri, getSegmentedValues, groupDisabled, isMulti, isTri, itemsOf, valueOf } from './read.js';
import { enhance } from './group.js';
import { layout } from './plate.js';
import { paint } from './paint.js';
import { sayTri, setTriValues } from './tri.js';

/**
 * Set a three-way group's chips without firing the event; a value in
 * neither list is let go.
 * @param {Element} group
 * @param {{ include?: Iterable<string>, exclude?: Iterable<string> }} values
 */
export function setSegmentedTri(group, values) {
    enhance(group);
    setTriValues(group, values);
}

/**
 * Set the values on without firing the event: for a page that moves the
 * group because something else moved (the address changed).
 * @param {Element} group
 * @param {Iterable<string>} values  Empty is All (multi) or nothing chosen (single).
 */
export function setSegmentedValues(group, values) {
    enhance(group);
    paint(group, [...values]);
}

/** Clear a three-way group and say so; nothing happens when nothing was chosen. @param {Element} group */
function resetTri(group) {
    const before = getSegmentedTri(group);
    if (before.include.length + before.exclude.length === 0) return;
    setSegmentedTri(group, {});
    sayTri(group, getStrings().triCleared);
    group.dispatchEvent(
        new CustomEvent(SEGMENTED_EVENT, {
            bubbles: true,
            detail: { value: null, values: [], include: [], exclude: [], state: 'any', item: null },
        }),
    );
}

/**
 * Turn every value off (back to All) and fire the event if anything was on.
 * @param {Element} group
 */
export function resetSegmented(group) {
    enhance(group);
    if (groupDisabled(group)) return;
    if (isTri(group)) return resetTri(group);
    const before = getSegmentedValues(group);
    if (before.length === 0 && isMulti(group)) return;
    paint(group, []);
    group.dispatchEvent(new CustomEvent(SEGMENTED_EVENT, { bubbles: true, detail: { value: null, values: [], item: null } }));
}

/**
 * Write the numbers beside the values. `null` empties a count; a value not
 * named keeps its number. The count element is made when the item has none.
 * @param {Element} group
 * @param {Record<string, number | null | undefined>} counts
 */
export function setSegmentedCounts(group, counts) {
    for (const item of itemsOf(group)) {
        const value = valueOf(item);
        if (!(value in counts)) continue;
        const n = counts[value];
        let slot = item.querySelector('.kp-segmented__count');
        if (!slot) {
            slot = document.createElement('span');
            slot.className = 'kp-segmented__count';
            item.append(slot);
        }
        slot.textContent = n == null ? '' : String(n);
    }
    layout(group);
}
