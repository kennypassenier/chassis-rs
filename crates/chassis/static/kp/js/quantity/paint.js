// Writing a value everywhere it shows, and changing it as a person did: the field, the unit, the spin button's numbers, the buttons.

import { getStrings } from '../strings.js';
import { QUANTITY_EVENT } from './values.js';
import { build } from './build.js';
import { formatQuantity, parseQuantity, rulesOf, settleQuantity } from './math.js';
import { getQuantity, isDisabled, unitFor } from './read.js';

/** @typedef {import('../quantity.js').QuantityRules} QuantityRules */

/** The spin button's bounds, value and words. @param {HTMLInputElement} input @param {QuantityRules} rules @param {number} value @param {string} text @param {string} unit */
function writeSpinbutton(input, rules, value, text, unit) {
    input.removeAttribute('aria-invalid');
    if (Number.isFinite(rules.min)) input.setAttribute('aria-valuemin', String(rules.min));
    else input.removeAttribute('aria-valuemin');
    if (Number.isFinite(rules.max)) input.setAttribute('aria-valuemax', String(rules.max));
    else input.removeAttribute('aria-valuemax');
    input.setAttribute('aria-valuenow', String(value));
    input.setAttribute('aria-valuetext', unit ? getStrings().quantityValue(text, unit) : text);
}

/** As wide as the widest value it can hold, so nothing moves as it changes. @param {HTMLElement} root @param {QuantityRules} rules @param {number} value */
function writeWidth(root, rules, value) {
    const widest = Math.max(
        ...[rules.min, rules.max, value].filter(Number.isFinite).map((v) => formatQuantity(v, rules).length),
        rules.decimals > 0 ? rules.decimals + 2 : 1,
    );
    root.style.setProperty('--kp-quantity-chars', String(widest));
}

/** The buttons: off with the control, dimmed at a bound but still focusable. @param {HTMLElement} root @param {QuantityRules} rules @param {number} value @param {boolean} disabled */
function writeButtons(root, rules, value, disabled) {
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('.kp-quantity__step'))) {
        const by = Number(b.getAttribute('data-kp-quantity-by'));
        const atBound = by < 0 ? value <= rules.min : value >= rules.max;
        b.disabled = disabled;
        if (atBound && !disabled) b.setAttribute('aria-disabled', 'true');
        else b.removeAttribute('aria-disabled');
    }
}

/**
 * Write a value everywhere it shows: the field, the unit, the spin button's numbers and words, the buttons at a bound, the field's width.
 * `keepText` leaves the field's own text alone (a person is typing in it; it is normalised when they commit) [stepper1102].
 * @param {HTMLElement} root @param {number} value @param {boolean} [keepText]
 */
export function paint(root, value, keepText = false) {
    const rules = rulesOf(root);
    const input = build(root);
    const text = formatQuantity(value, rules);
    if (!keepText && input.value !== text) input.value = text;
    root.setAttribute('data-kp-quantity-value', String(value));
    const unit = unitFor(root, value);
    writeSpinbutton(input, rules, value, text, unit);
    const shown = root.querySelector('.kp-quantity__unit');
    if (shown) shown.textContent = unit;
    writeWidth(root, rules, value);
    const disabled = isDisabled(root);
    input.disabled = disabled;
    // While a person types, the buttons follow the number they typed, not the last committed one.
    const typed = keepText ? parseQuantity(input.value) : NaN;
    writeButtons(root, rules, Number.isFinite(typed) ? settleQuantity(typed, rules) : value, disabled);
}

/** Dim the buttons for a value that is only typed so far (not yet committed). @param {HTMLElement} root @param {number} value */
export function markButtons(root, value) {
    writeButtons(root, rulesOf(root), settleQuantity(value, rulesOf(root)), isDisabled(root));
}

/**
 * Change the value as a person did, and fire the event when it moved.
 * @param {HTMLElement} root @param {number} wanted @param {'button' | 'key' | 'typed'} source
 * @returns {boolean} whether it moved
 */
export function change(root, wanted, source) {
    if (isDisabled(root)) return false;
    const rules = rulesOf(root);
    const previous = getQuantity(root);
    const value = settleQuantity(wanted, rules);
    paint(root, value);
    if (value === previous) return false;
    root.dispatchEvent(new CustomEvent(QUANTITY_EVENT, { bubbles: true, detail: { value, previous, source } }));
    return true;
}
