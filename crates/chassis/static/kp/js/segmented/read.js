// Reads a group's markup: its mode, its items, their values and states, and the values that are on.

import { SEGMENTED_ITEM, TRI_ATTRIBUTE } from './constants.js';

/** @typedef {import('./constants.js').TriValues} TriValues */

/** @param {Element} group */
export const isMulti = (group) => group.getAttribute('data-kp-segmented') === 'multi';

/** @param {Element} group */
export const isTri = (group) => group.getAttribute('data-kp-segmented') === 'tri';

/** A single group in which the chosen value can be let go again (`data-kp-segmented="single-or-none"`): nothing chosen is a valid answer. @param {Element} group */
export const isOptional = (group) => group.getAttribute('data-kp-segmented') === 'single-or-none';

/** @param {Element} item @returns {'any' | 'include' | 'exclude'} */
export const triOf = (item) => {
    const state = item.getAttribute(TRI_ATTRIBUTE);
    return state === 'include' || state === 'exclude' ? state : 'any';
};

/** @param {Element} group @returns {HTMLElement[]} */
export function itemsOf(group) {
    return /** @type {HTMLElement[]} */ ([...group.querySelectorAll(`:scope > ${SEGMENTED_ITEM}`)]);
}

/** @param {Element} item */
export const isAll = (item) => item.hasAttribute('data-kp-segmented-all');

/** @param {Element} item */
export function valueOf(item) {
    const own = item.getAttribute('data-value');
    if (own !== null) return own;
    return (item.querySelector('.kp-segmented__label') ?? item).textContent?.trim() ?? '';
}

/** The words an item shows: its label's text. @param {Element} item */
export const labelOf = (item) => (item.querySelector('.kp-segmented__label') ?? item).textContent?.trim() ?? '';

/** @param {Element} group @param {Element} item */
export const isOn = (group, item) =>
    isTri(group) ? triOf(item) === 'include' : item.getAttribute(isMulti(group) ? 'aria-pressed' : 'aria-checked') === 'true';

/** @param {Element} group */
export const groupDisabled = (group) => group.getAttribute('aria-disabled') === 'true';

/** @param {HTMLElement} item */
export const itemDisabled = (item) => item.hasAttribute('disabled') || item.getAttribute('aria-disabled') === 'true';

/**
 * The values that are on. Single: the chosen one (empty when none is chosen).
 * Multi: every value on except the "All" item; empty means All.
 * @param {Element} group
 * @returns {string[]}
 */
export function getSegmentedValues(group) {
    return itemsOf(group)
        .filter((item) => isOn(group, item) && !((isMulti(group) || isTri(group)) && isAll(item)))
        .map(valueOf);
}

/**
 * The values that must be in and the values that must not be in, in the
 * order of the chips (a three-way group) [kpadopt4].
 * @param {Element} group
 * @returns {TriValues}
 */
export function getSegmentedTri(group) {
    /** @type {TriValues} */
    const out = { include: [], exclude: [] };
    for (const item of itemsOf(group)) {
        if (isAll(item)) continue;
        const state = triOf(item);
        if (state !== 'any') out[state].push(valueOf(item));
    }
    return out;
}
