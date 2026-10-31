// Replaces the items of a group when the values change under it, keeping what is on and where the focus was.

import { TRI_ATTRIBUTE } from './constants.js';
import { STOPS } from './state.js';
import { getSegmentedValues, isMulti, isTri, itemsOf, triOf, valueOf } from './read.js';
import { enhance } from './group.js';
import { paint } from './paint.js';
import { paintTri } from './tri.js';

/**
 * One button for an item spec.
 * @param {import('./constants.js').SegmentedItem} spec
 * @param {{ multi: boolean, tri: boolean, kept: Map<string, 'any' | 'include' | 'exclude'> }} look
 */
export function buildItem(spec, { multi, tri, kept }) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'kp-segmented__item';
    item.dataset.value = spec.value;
    if (spec.all) item.setAttribute('data-kp-segmented-all', '');
    if (!multi && !tri) item.setAttribute('role', 'radio');
    const state = spec.state ?? kept.get(spec.value) ?? 'any';
    if (tri && !spec.all && state !== 'any') item.setAttribute(TRI_ATTRIBUTE, state);
    if (spec.hint) item.title = spec.hint;
    if (spec.disabled) item.disabled = true;
    const label = document.createElement('span');
    label.className = 'kp-segmented__label';
    label.textContent = spec.label;
    item.append(label);
    if (spec.count !== undefined) {
        const count = document.createElement('span');
        count.className = 'kp-segmented__count';
        count.textContent = spec.count == null ? '' : String(spec.count);
        item.append(count);
    }
    return item;
}

/**
 * Replace the items of a group (the values can change under it). The values
 * still present stay on; the focus stays on its value.
 * @param {Element} group
 * @param {readonly import('./constants.js').SegmentedItem[]} items
 */
export function setSegmentedItems(group, items) {
    enhance(group);
    const multi = isMulti(group);
    const tri = isTri(group);
    const kept = new Map(itemsOf(group).map((item) => [valueOf(item), triOf(item)]));
    const on = getSegmentedValues(group).filter((value) => items.some((item) => item.value === value));
    const active = group.ownerDocument.activeElement;
    const focused = active instanceof HTMLElement && group.contains(active) ? valueOf(active) : null;
    const made = items.map((spec) => buildItem(spec, { multi, tri, kept }));
    STOPS.delete(group);
    group.replaceChildren(...made);
    enhance(group);
    if (tri) paintTri(group);
    else paint(group, on);
    if (focused !== null) made.find((item) => valueOf(item) === focused)?.focus();
}
