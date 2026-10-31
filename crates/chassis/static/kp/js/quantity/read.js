// What a quantity's markup holds: its field, whether it is off, the value it stands at, the unit for a value.

import { parseQuantity, rulesOf, settleQuantity } from './math.js';

/** @param {Element} root */
export const inputOf = (root) => /** @type {HTMLInputElement | null} */ (root.querySelector('.kp-quantity__input'));

/** @param {Element} root */
export const isDisabled = (root) => root.hasAttribute('data-kp-quantity-disabled') || (inputOf(root)?.disabled ?? false);

/** The value a root stands at, as a number (its last accepted value). @param {Element} root */
export function getQuantity(root) {
    const kept = root.getAttribute('data-kp-quantity-value');
    if (kept !== null && kept !== '') return Number(kept);
    const input = inputOf(root);
    const read = input ? parseQuantity(input.value) : NaN;
    const rules = rulesOf(root);
    return settleQuantity(Number.isFinite(read) ? read : Number.isFinite(rules.min) ? rules.min : 0, rules);
}

/**
 * The unit for a value: the singular for exactly 1 when there is one.
 * @param {Element} root @param {number} value
 */
export const unitFor = (root, value) => {
    const one = root.getAttribute('data-kp-quantity-unit-one');
    return value === 1 && one ? one : (root.getAttribute('data-kp-quantity-unit') ?? '');
};
