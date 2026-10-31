// The parts the markup left out (the field, the unit, the two buttons) and the names they get. Safe to run again.

import { getStrings } from '../strings.js';
import { rulesOf } from './math.js';
import { inputOf } from './read.js';

/** @param {HTMLElement} root @returns {HTMLInputElement} */
function ensureInput(root) {
    let input = inputOf(root);
    if (!input) {
        input = document.createElement('input');
        input.className = 'kp-quantity__input';
        root.append(input);
    }
    return input;
}

/** The box around the number and the unit. @param {HTMLElement} root @param {HTMLInputElement} input @returns {HTMLElement} */
function ensureField(root, input) {
    let field = /** @type {HTMLElement | null} */ (root.querySelector('.kp-quantity__field'));
    if (!field) {
        field = document.createElement('span');
        field.className = 'kp-quantity__field';
        input.before(field);
        field.append(input);
    }
    return field;
}

/** The unit after the number, with the words it can take for the field's width. @param {HTMLElement} root @param {HTMLElement} field */
function ensureUnit(root, field) {
    let unit = /** @type {HTMLElement | null} */ (root.querySelector('.kp-quantity__unit'));
    const unitWord = root.getAttribute('data-kp-quantity-unit');
    if (!unit && unitWord) {
        unit = document.createElement('span');
        unit.className = 'kp-quantity__unit';
        unit.setAttribute('aria-hidden', 'true');
        field.append(unit);
    }
    if (unit) {
        const one = root.getAttribute('data-kp-quantity-unit-one');
        unit.setAttribute('data-kp-words', [unitWord ?? '', one ?? ''].filter(Boolean).join('\n'));
    }
}

/**
 * The minus or the plus button, made when the markup has none, and named.
 * @param {HTMLElement} root @param {HTMLElement} field @param {-1 | 1} by @param {string} label
 */
function ensureButton(root, field, by, label) {
    const strings = getStrings();
    let b = /** @type {HTMLButtonElement | null} */ (root.querySelector(`.kp-quantity__step[data-kp-quantity-by="${by}"]`));
    if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'kp-button kp-quantity__step';
        b.setAttribute('data-kp-quantity-by', String(by));
        const glyph = document.createElement('span');
        glyph.className = 'kp-quantity__glyph';
        glyph.setAttribute('aria-hidden', 'true');
        b.append(glyph);
        if (by < 0) field.before(b);
        else field.after(b);
    }
    b.setAttribute('aria-label', by < 0 ? strings.quantityLess(label) : strings.quantityMore(label));
}

/** The field's role and the names of the field and the group. @param {HTMLElement} root @param {HTMLInputElement} input @param {string} label */
function nameThem(root, input, label) {
    input.setAttribute('role', 'spinbutton');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('inputmode', rulesOf(root).decimals > 0 || rulesOf(root).min < 0 ? 'decimal' : 'numeric');
    if (label && !input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby') && !input.labels?.length) {
        input.setAttribute('aria-label', label);
    }
    if (root.getAttribute('role') === null) root.setAttribute('role', 'group');
    if (label && !root.hasAttribute('aria-label') && !root.hasAttribute('aria-labelledby')) root.setAttribute('aria-label', label);
}

/**
 * Make the parts the markup left out, and give them their names. Safe to run again.
 * @param {HTMLElement} root
 * @returns {HTMLInputElement} the field
 */
export function build(root) {
    const label = root.getAttribute('data-kp-quantity-label') ?? '';
    const input = ensureInput(root);
    const field = ensureField(root, input);
    ensureUnit(root, field);
    ensureButton(root, field, -1, label);
    ensureButton(root, field, 1, label);
    nameThem(root, input, label);
    return input;
}
