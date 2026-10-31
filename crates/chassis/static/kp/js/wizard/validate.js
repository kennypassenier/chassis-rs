// The validation gate of a step: its fields checked, a message written where js/forms.js does not, and the way out of that message.

import { clearError, showError } from '../forms.js';
import { getStrings } from '../strings.js';

/**
 * Whether js/forms.js is looking after this field. Only then does
 * its own focusout handler write the message; everywhere else the
 * wizard writes it, or a refused Next says nothing at all [gap-12].
 *
 * @param {HTMLInputElement} field
 */
const formOwns = (field) => field.form?.dataset.kpFormAttached !== undefined;

/**
 * Whether the step's fields are all valid; the first invalid one is shown and focused.
 * @param {HTMLElement | undefined} step
 * @returns {boolean}
 */
export function stepIsValid(step) {
    if (step === undefined) return true;
    const fields = /** @type {HTMLInputElement[]} */ ([...step.querySelectorAll('input, select, textarea')]);
    return fields.every((field) => {
        if (field.checkValidity()) {
            if (!formOwns(field)) clearError(field);
            return true;
        }
        // The form module's own handler shows the message; this is
        // the click that has to stop rather than the submit.
        if (formOwns(field)) field.dispatchEvent(new Event('focusout', { bubbles: true }));
        else showError(field, field.validationMessage || getStrings().formInvalid);
        field.focus();
        return false;
    });
}

/**
 * The way out of a message the wizard wrote [KT6]: a field it marked
 * is checked again as it changes, and the mark goes once it is valid.
 *
 * @param {Event} event
 */
export function recheckField(event) {
    const field = /** @type {HTMLInputElement} */ (event.target);
    if (!(field instanceof HTMLElement) || !('checkValidity' in field) || formOwns(field)) return;
    if (field.getAttribute('aria-invalid') === 'true' && field.checkValidity()) clearError(field);
}
