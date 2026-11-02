// What a popover form's fields hold and whether they may be accepted [ux-1101; parts-1102]: the browser's own validity, and the
// package's composite fields, which the browser cannot judge: a date picker's text that is no date (or a day its calendar does
// not offer) and a time field that refused what was typed or is required and empty.

import { getStrings } from '../strings.js';

/** A date picker's text field inside a form. */
const DATE_INPUT = '[data-kp-datepicker] [data-kp-date-input]';
/** An ISO day, the form a picker's `data-kp-min` and `data-kp-max` are compared in. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every named field's value, as the form would send it; a date picker's field gives its ISO day (yyyy-mm-dd), never the
 * dd/mm/yyyy on screen, and a time field its hidden `HH:MM`.
 * @param {HTMLFormElement} form
 * @returns {Record<string, string>}
 */
export function valuesOf(form) {
    /** @type {Record<string, string>} */
    const values = {};
    for (const [name, value] of new FormData(form)) if (typeof value === 'string') values[name] = value;
    for (const input of /** @type {HTMLInputElement[]} */ ([...form.querySelectorAll(DATE_INPUT)])) {
        if (input.name) values[input.name] = input.dataset.kpDateValue ?? '';
    }
    return values;
}

/**
 * A date picker's refusal: text that reads as no date, or a day outside its `data-kp-min` / `data-kp-max`.
 * @param {HTMLInputElement} input
 * @returns {string} the words, or '' when the field may be accepted
 */
function dateProblem(input) {
    const s = getStrings();
    const iso = input.dataset.kpDateValue;
    if (input.value.trim() === '') return input.required ? input.validationMessage || s.popoverFormDate : '';
    if (!iso) return s.popoverFormDate;
    const picker = /** @type {HTMLElement} */ (input.closest('[data-kp-datepicker]'));
    const min = picker.dataset.kpMin ?? '';
    const max = picker.dataset.kpMax ?? '';
    if ((ISO_DAY.test(min) && iso < min) || (ISO_DAY.test(max) && iso > max)) return s.popoverFormDateRange;
    return '';
}

/**
 * A time field's refusal: it says why itself, under the field (its own line), so the form only moves the focus to it.
 * @param {HTMLFormElement} form
 * @returns {HTMLInputElement | null} the time field's text box that refuses, or null
 */
function refusedTime(form) {
    for (const root of /** @type {HTMLElement[]} */ ([...form.querySelectorAll('[data-kp-time]')])) {
        const input = /** @type {HTMLInputElement | null} */ (root.querySelector('.kp-time__input'));
        const value = /** @type {HTMLInputElement | null} */ (root.querySelector('.kp-time__value'));
        if (!input) continue;
        if (input.getAttribute('aria-invalid') === 'true') return input;
        if (root.hasAttribute('data-kp-time-required') && value?.value === '') return input;
    }
    return null;
}

/**
 * The first field that may not be accepted, with its words; null when every field may. `own` says the field shows its words
 * itself, so the form's problem line stays empty.
 * @param {HTMLFormElement} form
 * @returns {{ field: HTMLElement, text: string, own: boolean } | null}
 */
export function firstInvalid(form) {
    const refused = /** @type {HTMLInputElement[]} */ ([...form.querySelectorAll(':invalid:is(input, select, textarea)')]);
    const field = refused.find((one) => !one.matches(DATE_INPUT));
    if (field) return { field, text: field.validationMessage || getStrings().popoverFormInvalid, own: false };
    for (const input of /** @type {HTMLInputElement[]} */ ([...form.querySelectorAll(DATE_INPUT)])) {
        const text = dateProblem(input);
        if (text) return { field: input, text, own: false };
    }
    const time = refusedTime(form);
    return time ? { field: time, text: '', own: true } : null;
}
