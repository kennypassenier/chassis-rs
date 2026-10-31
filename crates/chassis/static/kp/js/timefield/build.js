// Builds the parts of a time field once: the text box, the open button, the hidden input, the lines and the list.

import { getStrings } from '../strings.js';
import { presetsFromAttribute } from './attributes.js';
import { nextFieldNumber } from './state.js';

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** The text box, with the combobox roles and the name the root gives it. @param {HTMLElement} root @param {number} n */
function buildInput(root, n) {
    const input = /** @type {HTMLInputElement} */ (el('kp-field__input kp-time__input', 'input'));
    input.type = 'text';
    input.id = root.getAttribute('data-kp-time-id') ?? `kp-time-${n}`;
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'none');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');
    input.placeholder = '--:--';
    const label = root.getAttribute('data-kp-label') ?? root.getAttribute('aria-label');
    if (label) input.setAttribute('aria-label', label);
    const labelled = root.getAttribute('aria-labelledby');
    if (labelled) input.setAttribute('aria-labelledby', labelled);
    return input;
}

/** The button that opens the list. */
function buildToggle() {
    const toggle = /** @type {HTMLButtonElement} */ (el('kp-time__toggle', 'button'));
    toggle.type = 'button';
    toggle.tabIndex = -1;
    toggle.setAttribute('aria-label', getStrings().timeChoose);
    toggle.setAttribute('aria-haspopup', 'listbox');
    toggle.append(el('kp-time__glyph', 'span'));
    return toggle;
}

/**
 * Build the parts into the root: nothing is wired here.
 * @param {HTMLElement} root
 */
export function buildParts(root) {
    const n = nextFieldNumber();
    root.classList.add('kp-time');
    const control = el('kp-time__control');
    const input = buildInput(root, n);
    control.append(input, buildToggle());
    const hidden = /** @type {HTMLInputElement} */ (el('kp-time__value', 'input'));
    hidden.type = 'hidden';
    const name = root.getAttribute('data-kp-name');
    if (name) hidden.name = name;
    const why = el('kp-time__why', 'p');
    why.hidden = true;
    why.id = `kp-time-${n}-why`;
    const zone = el('kp-time__zone', 'p');
    const popup = el('kp-popover kp-time__popup');
    popup.id = `kp-time-${n}-popup`;
    popup.hidden = true;
    input.setAttribute('aria-controls', popup.id);
    const skeleton = el('kp-skeleton kp-time__skeleton', 'span');
    skeleton.setAttribute('aria-hidden', 'true');
    root.replaceChildren(control, hidden, why, zone, popup, skeleton);
    return { input, hidden, popup, presets: presetsFromAttribute(root) };
}
