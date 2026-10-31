// Pure: the words and the state of a button that follows a quantity, from an amount, its unit and the dictionary.

import { getStrings } from './strings.js';

/**
 * @typedef {object} AcceptInput
 * @property {number} amount  the amount the quantity stands at (NaN while the text is not a number)
 * @property {string} amountText  the amount written in the page's language ("2,5")
 * @property {string} unit  the unit that goes with the amount ("boxes"; "box" for exactly 1)
 * @property {string} unitMany  the unit's plural, used in the words that name no amount ("boxes")
 * @property {string} [verb]  what the button does ("Add"); the dictionary's when absent
 * @property {number} [minimum]  the least amount that makes sense; absent: anything above zero
 * @property {Partial<import('./strings.js').Strings>} [strings]
 */

/**
 * @typedef {object} AcceptState
 * @property {boolean} valid  whether the amount makes sense, so the button may be pressed
 * @property {string} label  the button's words
 * @property {string} reason  why the button is off; empty while it is on
 */

/**
 * Whether an amount makes sense: a number, above zero, and not under the page's own minimum.
 * @param {number} amount @param {number | undefined} minimum
 */
export function amountMakesSense(amount, minimum) {
    return Number.isFinite(amount) && amount > 0 && (minimum === undefined || amount >= minimum);
}

/**
 * The button's words and state for an amount: "Add 3 boxes" while it makes sense, "Add boxes" with a reason while it does not.
 * @param {AcceptInput} input
 * @returns {AcceptState}
 */
export function acceptState({ amount, amountText, unit, unitMany, verb, minimum, strings }) {
    const s = { ...getStrings(), ...strings };
    const word = verb ?? s.acceptVerb;
    if (amountMakesSense(amount, minimum)) return { valid: true, label: s.acceptFollowsLabel(word, amountText, unit), reason: '' };
    return { valid: false, label: s.acceptFollowsNone(word, unitMany), reason: s.acceptFollowsReason(unitMany) };
}
