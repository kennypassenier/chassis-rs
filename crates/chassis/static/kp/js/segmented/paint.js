// Writes the state of every item from a list of values, then the roving tab stop, then the plate; fires no event.

import { isAll, isMulti, isTri, itemsOf, triOf, valueOf } from './read.js';
import { layout } from './plate.js';
import { roving } from './roving.js';
import { paintTri, writeTri } from './tri.js';

/** Write a three-way group from a list of the values that must be in; what is left out stays left out. @param {Element} group @param {readonly string[]} values */
function paintTriValues(group, values) {
    const include = new Set(values);
    for (const item of itemsOf(group)) {
        if (isAll(item)) continue;
        const was = triOf(item);
        writeTri(item, include.has(valueOf(item)) ? 'include' : was === 'exclude' ? 'exclude' : 'any');
    }
    paintTri(group);
}

/**
 * Write the state of every item from a list of values, then the roving tab
 * stop, then the plate. Does not fire the event.
 * @param {Element} group
 * @param {readonly string[]} values
 */
export function paint(group, values) {
    if (isTri(group)) return paintTriValues(group, values);
    const multi = isMulti(group);
    const items = itemsOf(group);
    const others = items.filter((item) => !isAll(item));
    let on = new Set(values);
    if (multi) {
        // Every value on is the same as none: back to All.
        if (group.getAttribute('data-kp-segmented-collapse') !== 'false' && others.length > 0 && others.every((item) => on.has(valueOf(item)))) {
            on = new Set();
        }
    } else if (on.size > 1) {
        on = new Set([[...on][0]]);
    }
    for (const item of items) {
        const pressed = multi && isAll(item) ? on.size === 0 : on.has(valueOf(item));
        item.setAttribute(multi ? 'aria-pressed' : 'aria-checked', String(pressed));
    }
    roving(group);
    layout(group);
}
