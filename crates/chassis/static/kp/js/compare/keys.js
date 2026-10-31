// Pure: where a key puts the divider.

import { ALL_AFTER, ALL_BEFORE, BIG_STEP, STEP } from './values.js';

/**
 * The divider's position after a key, or null for a key it does not take.
 * @param {string} key @param {number} at @param {boolean} big
 * @returns {number | null}
 */
export function compareKey(key, at, big) {
    const step = big ? BIG_STEP : STEP;
    if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(ALL_AFTER, at - step);
    if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(ALL_BEFORE, at + step);
    if (key === 'PageDown') return Math.max(ALL_AFTER, at - BIG_STEP);
    if (key === 'PageUp') return Math.min(ALL_BEFORE, at + BIG_STEP);
    if (key === 'Home') return ALL_AFTER;
    if (key === 'End') return ALL_BEFORE;
    return null;
}
