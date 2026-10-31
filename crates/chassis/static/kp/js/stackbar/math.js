// Pure: a share as words, and the arithmetic of a share bar with no DOM.

import { getStrings } from '../strings.js';
import { DECIMAL_BELOW_PERCENT, OTHER_KEY } from './values.js';

/** @typedef {import('../stackbar.js').StackbarPart} StackbarPart */
/** @typedef {StackbarPart & { key: string, merged?: number, share: number, width: number }} DrawnPart a part as drawn: its key, its share of the whole and its width on the bar */
/** @typedef {{ parts: DrawnPart[], whole: number, sum: number, rest: number, over: number }} StackbarArithmetic */

/** @param {HTMLElement} el */
export const langOf = (el) => /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || undefined;

/** A share as words: one decimal under ten per cent, whole above. @param {number} share @param {string | undefined} lang */
export function shareText(share, lang) {
    const pct = share * 100;
    return new Intl.NumberFormat(lang, { maximumFractionDigits: pct > 0 && pct < DECIMAL_BELOW_PERCENT ? 1 : 0 }).format(pct) + ' %';
}

/**
 * The arithmetic of a share bar, with no DOM: the parts as drawn (merged
 * into Other where asked), each with its share of the bar, the free rest,
 * and whether the parts run past the whole.
 * @param {StackbarPart[]} parts @param {number | undefined} total @param {number} [other]
 * @returns {StackbarArithmetic}
 */
export function stackbarParts(parts, total, other = 0) {
    const clean = parts.filter((part) => Number.isFinite(part.value) && part.value > 0);
    const sum = clean.reduce((acc, part) => acc + part.value, 0);
    const whole = Number.isFinite(total) && /** @type {number} */ (total) > 0 ? /** @type {number} */ (total) : sum;
    /** @type {(StackbarPart & { key: string, merged?: number })[]} */
    const kept = [];
    let otherValue = 0;
    let merged = 0;
    for (const part of clean) {
        if (whole > 0 && part.value / whole < other) {
            otherValue += part.value;
            merged += 1;
        } else kept.push({ ...part, key: part.key ?? part.label });
    }
    if (merged > 0) kept.push({ key: OTHER_KEY, label: getStrings().stackbarOther, value: otherValue, merged });
    const scale = Math.max(whole, sum);
    return {
        parts: kept.map((part) => ({ ...part, share: whole > 0 ? part.value / whole : 0, width: scale > 0 ? part.value / scale : 0 })),
        whole,
        sum,
        rest: Math.max(0, whole - sum),
        over: sum > whole ? sum - whole : 0,
    };
}
