// The roving tab stop: one item of the group is in the tab order, the others are reached by the arrows.

import { STOPS } from './state.js';
import { isAll, isMulti, isOn, itemDisabled, itemsOf } from './read.js';

/** One tab stop: the item last focused, else the first one on, else the first. @param {Element} group */
export function roving(group) {
    const items = itemsOf(group);
    const enabled = items.filter((item) => !itemDisabled(item));
    const kept = STOPS.get(group);
    const stop =
        (kept && enabled.includes(/** @type {HTMLElement} */ (kept)) ? kept : undefined) ??
        enabled.find((item) => isOn(group, item) && !(isMulti(group) && isAll(item) && enabled.length > 1)) ??
        enabled.find((item) => isOn(group, item)) ??
        enabled[0];
    for (const item of items) item.tabIndex = item === stop ? 0 : -1;
    if (stop) STOPS.set(group, stop);
}
