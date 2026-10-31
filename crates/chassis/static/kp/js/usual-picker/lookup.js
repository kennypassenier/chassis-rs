// Looks an item up: the exact one, the picked values and the nearest name to what was typed.
import { attr, clamp } from './model.js';
import { nearNames, normaliseName } from './names.js';
/** @typedef {import('./types.js').UsualModel} UsualModel */

/** @param {UsualModel} m @param {string} typed */
export const exactItem = (m, typed) => m.items.find((i) => normaliseName(i.label) === normaliseName(typed));

/** The values picked now (tag mode), or the one chosen. @param {UsualModel} m */
export const pickedValues = (m) => (m.box.hasAttribute('data-kp-tags') ? m.handle.values() : []);

/** The near names of what was typed, by the picker's own threshold and count. @param {UsualModel} m @param {string} typed */
export const nearOf = (m, typed) =>
    attr(m, 'near', 'ask') === 'off'
        ? []
        : nearNames(typed, m.items, clamp(Number(attr(m, 'near-threshold')) || 0.8, 0.5, 1), clamp(Number(attr(m, 'near-max')) || 3, 1, 5));
