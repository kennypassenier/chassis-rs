// Accepting a popover form [ux-1101]: the browser's own validity first, then the page's event, then (when the page hands one)
// the wait for its answer, busy, with the answer's failure written in the form.

import { getStrings } from '../strings.js';
import { FIELDS, POPOVER_FORM_ACCEPT_EVENT, POPOVER_FORM_PROBLEM } from './constants.js';
import { firstInvalid, valuesOf } from './fields.js';

/** The form's problem line, made after the fields when the markup left it out. @param {HTMLFormElement} form */
export function problemLine(form) {
    let line = /** @type {HTMLElement | null} */ (form.querySelector(POPOVER_FORM_PROBLEM));
    if (!line) {
        line = form.ownerDocument.createElement('p');
        line.className = 'kp-popover-form__problem';
        line.setAttribute('role', 'alert');
        form.append(line);
    }
    return line;
}

/**
 * Write the form's problem, or clear it with an empty text; the field it is about is marked invalid and described by it.
 * @param {HTMLFormElement} form @param {string} text @param {Element | null} [field]
 */
export function writeProblem(form, text, field = form.querySelector(FIELDS)) {
    const line = problemLine(form);
    if (!line.id) line.id = `${form.id || 'kp-popover-form'}-problem`;
    line.textContent = text;
    for (const one of form.querySelectorAll('[aria-invalid="true"]')) one.removeAttribute('aria-invalid');
    if (!text || !field) return;
    field.setAttribute('aria-invalid', 'true');
    const described = new Set((field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    described.add(line.id);
    field.setAttribute('aria-describedby', [...described].join(' '));
}

/** Busy while the page's answer is on its way: the accept button keeps its width and takes no second press. @param {HTMLFormElement} form @param {boolean} busy */
function setBusy(form, busy) {
    form.toggleAttribute('aria-busy', busy);
    for (const button of form.querySelectorAll('button[type="submit"], button:not([type])')) /** @type {HTMLButtonElement} */ (button).disabled = busy;
}

/**
 * Accept the form: refused by the browser, it says why and stays open; else the page hears it. Resolves true when the form
 * may close, false when it stays open (refused, cancelled, or the page's answer failed).
 * @param {HTMLElement} wrapper @param {HTMLFormElement} form @param {HTMLElement} opener
 * @returns {Promise<boolean>}
 */
export async function acceptForm(wrapper, form, opener) {
    const invalid = firstInvalid(form);
    if (invalid) {
        // A field that says why itself (the time field's own line) keeps the form's line empty.
        if (invalid.own) problemLine(form).textContent = '';
        else writeProblem(form, invalid.text, invalid.field);
        invalid.field.focus();
        return false;
    }
    writeProblem(form, '');
    /** @type {Promise<unknown>[]} */
    const waits = [];
    const first = /** @type {HTMLInputElement | null} */ (form.querySelector(FIELDS));
    const detail = { value: first?.value ?? '', values: valuesOf(form), form, opener, waitUntil: (/** @type {Promise<unknown>} */ p) => void waits.push(p) };
    if (!wrapper.dispatchEvent(new CustomEvent(POPOVER_FORM_ACCEPT_EVENT, { bubbles: true, cancelable: true, detail }))) return false;
    if (!waits.length) return true;
    setBusy(form, true);
    try {
        await Promise.all(waits);
        return true;
    } catch (error) {
        // The page's own refusal is the form's problem line; the form stays open with what was typed.
        writeProblem(form, error instanceof Error && error.message ? error.message : getStrings().popoverFormInvalid, first);
        first?.focus();
        return false;
    } finally {
        setBusy(form, false);
    }
}
