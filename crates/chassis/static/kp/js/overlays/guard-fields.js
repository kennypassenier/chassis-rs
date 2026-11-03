// What a guard reads: every form control inside a box and the package's pressed controls, as one string [uxdialogs1101].
// Shared by the dialog guard (dialog-guard.js) and the region guard (region-guard.js); a field marked `data-kp-untracked` is left out.
import { readValue } from '../unsaved/values.js';
import { widgetOf } from '../unsaved/widgets.js';

/** What the guard reads: the form controls and the package's pressed controls (a switch, a segmented chip). */
export const FIELDS =
    'input:not([type="hidden"], [type="button"], [type="submit"], [type="reset"], [type="file"]), select, textarea, [role="switch"], [role="checkbox"], [role="radio"], [contenteditable="true"]';

/** One control's value. @param {Element} control */
function valueOf(control) {
    if (control instanceof HTMLSelectElement && control.multiple) return [...control.selectedOptions].map((o) => o.value).join('\n');
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) return readValue(control);
    if (control.matches('[contenteditable="true"]')) return control.textContent ?? '';
    if (control.matches('[role]') && !widgetOf(control)) return control.getAttribute('aria-checked') ?? control.getAttribute('aria-pressed') ?? '';
    return readValue(/** @type {HTMLInputElement} */ (control));
}

/** The controls the guard reads inside a box, one per widget, in document order. @param {Element} box @returns {Element[]} */
export function formControls(box) {
    /** @type {Set<Element>} */
    const seen = new Set();
    for (const el of box.querySelectorAll(FIELDS)) {
        if (el.closest('[data-kp-untracked], .kp-confirm--inline')) continue;
        seen.add(widgetOf(el) ?? el);
    }
    return [...seen];
}

/** What each control of the box holds, in document order. @param {Element} box @returns {string[]} */
export function readFormValues(box) {
    return formControls(box).map(valueOf);
}

/** Everything the box's form holds, in document order, as one string. @param {Element} box */
export function readForm(box) {
    return JSON.stringify(readFormValues(box));
}

/** The place of a field among the box's controls (-1 when the box does not read it). @param {Element} box @param {Element} field */
export function controlIndex(box, field) {
    const control = widgetOf(field) ?? field;
    return formControls(box).indexOf(control);
}
