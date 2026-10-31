// What a form control holds: reading the live value, the markup's value, and putting a value back.
// A composite field (a quantity, a time field, a tag input) counts as one control, read and written through js/unsaved/widgets.js.

import { isWidget, readWidget, writeWidget } from './widgets.js';

/** @typedef {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} Field */

/** Every radio in the control's form (or document) that shares its name. @param {HTMLInputElement} c */
function radiosNamed(c) {
    return [...(c.form ?? c.ownerDocument).querySelectorAll(`input[type="radio"]`)].filter(
        (r) => /** @type {HTMLInputElement} */ (r).name === c.name,
    );
}

/** The radios that make up one control's group: its named group, or itself when it has no name. @param {HTMLInputElement} c */
const radioGroup = (c) => (c.name ? radiosNamed(c) : [c]);

/** What a control holds, as a string; a radio group by its checked value. @param {Field} c */
export function readValue(c) {
    if (isWidget(c)) return readWidget(/** @type {HTMLElement} */ (/** @type {unknown} */ (c)));
    if (c instanceof HTMLInputElement && c.type === 'checkbox') return c.checked ? 'on' : 'off';
    if (c instanceof HTMLInputElement && c.type === 'radio') {
        return /** @type {HTMLInputElement | undefined} */ (radioGroup(c).find((r) => /** @type {HTMLInputElement} */ (r).checked))?.value ?? '';
    }
    return c.value;
}

/**
 * What the markup says a control holds (`value`, `checked`, `selected` as written): the saved state, which a browser's own
 * restoring of a reloaded form does not touch.
 * @param {Field} c
 */
export function readDefault(c) {
    // A composite field is built by script, so there is no markup value a browser could have restored over: what it holds when the bar looks is its saved state.
    if (isWidget(c)) return readWidget(/** @type {HTMLElement} */ (/** @type {unknown} */ (c)));
    if (c instanceof HTMLInputElement && c.type === 'checkbox') return c.defaultChecked ? 'on' : 'off';
    if (c instanceof HTMLInputElement && c.type === 'radio') {
        return (
            /** @type {HTMLInputElement | undefined} */ (radioGroup(c).find((r) => /** @type {HTMLInputElement} */ (r).defaultChecked))?.value ?? ''
        );
    }
    if (c instanceof HTMLSelectElement) return ([...c.options].find((o) => o.defaultSelected) ?? c.options[0])?.value ?? '';
    return c.defaultValue;
}

/** Put a value back into a control. @param {Field} c @param {string} value */
export function writeValue(c, value) {
    if (isWidget(c)) writeWidget(/** @type {HTMLElement} */ (/** @type {unknown} */ (c)), value);
    else if (c instanceof HTMLInputElement && c.type === 'checkbox') c.checked = value === 'on';
    else if (c instanceof HTMLInputElement && c.type === 'radio') {
        for (const r of radiosNamed(c)) /** @type {HTMLInputElement} */ (r).checked = /** @type {HTMLInputElement} */ (r).value === value;
    } else c.value = value;
}

/** Tell the page and the tracker that a control was changed by a script. @param {Element} c */
export function fire(c) {
    c.dispatchEvent(new Event('input', { bubbles: true }));
    c.dispatchEvent(new Event('change', { bubbles: true }));
}
