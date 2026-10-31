// One attached form: validation on blur or input, the summary, the valid and invalid events, and the handle [TH38, KT6, wish-1028].

import { Controller } from '../controller.js';
import { DONE_EVENT, FIELD_EVENT, INVALID_EVENT, SUMMARY, VALID_EVENT } from './constants.js';
import { clearError, fallback, nameOf, showError, stateHolder } from './errors.js';
import { dedupe, writeSummary } from './summary.js';

/** The controller of one `form[data-kp-form]`. */
export class FormController extends Controller {
    /**
     * @param {HTMLElement} host the form
     * @param {import('./constants.js').FormOptions} [options] the page's defaults; the form's own `data-kp-*` wins
     */
    constructor(host, options = {}) {
        super(host, options);
        this.form = /** @type {HTMLFormElement} */ (host);
        this.settings = {
            validateOn: options.validateOn ?? 'blur',
            revalidateOn: options.revalidateOn ?? 'input',
            focusSummary: options.focusSummary ?? true,
            focusFirstInvalid: options.focusFirstInvalid ?? true,
            wrapper: options.wrapper ?? '.kp-field',
            invalidClass: options.invalidClass ?? 'kp-field--invalid',
            summaryHeading: options.summaryHeading ?? 'p',
            summaryHeadingClass: options.summaryHeadingClass ?? 'kp-form__summary-title',
            nativeSubmit: options.nativeSubmit ?? false,
        };
        const { wrapper, invalidClass } = this.settings;
        this.marks = { wrapper, invalidClass };
        /** When a field is first checked: the form's `data-kp-validate-on`, else the option. @type {'blur' | 'input' | 'submit'} */
        this.when = this.settings.validateOn;
        /** When a marked field is checked again. @type {'input' | 'blur' | 'none'} */
        this.again = this.settings.revalidateOn;
        /** Whether a failed submit focuses the summary. */
        this.focusOnError = this.settings.focusSummary;
        /** The summary element, when the form has one. @type {HTMLElement | null} */
        this.summary = null;
        /** What the page gets back from form(). @type {import('./constants.js').FormHandle} */
        this.handle = {
            element: this.form,
            validate: () => this.validateAll(),
            invalid: () => this.fields().filter((f) => stateHolder(f).getAttribute('aria-invalid') === 'true'),
            errors: (errors) => this.showErrors(errors),
            clear: () => this.clear(),
            done: () => this.done(),
        };
    }

    connect() {
        const form = this.form;
        form.dataset.kpFormAttached = '';
        // The browser's bubbles are replaced, not suppressed: checkValidity()
        // below still uses the same constraints. Restored on detach.
        const hadNoValidate = form.noValidate;
        form.noValidate = true;
        this.own(() => {
            this.clear();
            form.noValidate = hadNoValidate;
            delete form.dataset.kpFormAttached;
        });
        this.when = /** @type {'blur' | 'input' | 'submit'} */ (form.dataset.kpValidateOn ?? this.settings.validateOn);
        this.again = /** @type {'input' | 'blur' | 'none'} */ (form.dataset.kpRevalidateOn ?? this.settings.revalidateOn);
        this.focusOnError = form.dataset.kpFocusSummary === undefined ? this.settings.focusSummary : form.dataset.kpFocusSummary !== 'false';
        this.summary = /** @type {HTMLElement | null} */ (form.querySelector(SUMMARY));
        this.listen(form, 'focusout', (event) => this.onFocusOut(event));
        this.listen(form, 'input', (event) => this.onInput(event));
        this.listen(form, 'submit', (event) => this.onSubmit(/** @type {SubmitEvent} */ (event)));
    }

    /** `data-kp-form-native-submit` (or the option): the browser also submits a valid form [wish-1028]. */
    native() {
        const form = this.form;
        return form.dataset.kpFormNativeSubmit === undefined ? this.settings.nativeSubmit : form.dataset.kpFormNativeSubmit !== 'false';
    }

    /** @returns {HTMLElement[]} the fields that can be checked, submit buttons left out */
    fields() {
        return /** @type {HTMLElement[]} */ ([...this.form.elements].filter((el) => el instanceof HTMLElement && 'checkValidity' in el && el.getAttribute('type') !== 'submit'));
    }

    /** Check one field, show or clear its message and tell the page. @param {HTMLElement} field @returns {boolean} */
    validateField(field) {
        const control = /** @type {HTMLInputElement} */ (field);
        const valid = control.checkValidity();
        if (valid) clearError(field, this.marks);
        else showError(field, control.validationMessage || fallback(), this.marks);
        field.dispatchEvent(new CustomEvent(FIELD_EVENT, { bubbles: true, detail: { valid, message: valid ? '' : control.validationMessage || fallback() } }));
        return valid;
    }

    /** The checkable field an event came from, or null. @param {Event} event */
    fieldOf(event) {
        const field = /** @type {HTMLElement} */ (event.target);
        return field instanceof HTMLElement && 'checkValidity' in field && field.getAttribute('type') !== 'submit' ? field : null;
    }

    /** Delegated, so a field added after attach validates too. @param {Event} event */
    onFocusOut(event) {
        const field = this.fieldOf(event);
        if (field === null) return;
        // Only once someone has left the field. Reporting while they
        // type the third character of an email address is technically
        // true and practically hostile.
        if (this.when === 'blur' || (this.again === 'blur' && stateHolder(field).getAttribute('aria-invalid') === 'true')) this.validateField(field);
    }

    /** @param {Event} event */
    onInput(event) {
        const field = this.fieldOf(event);
        if (field === null) return;
        // "Punish late, reward early": once a field is marked, fixing
        // it clears the mark as you type.
        if (this.when === 'input' || (this.again === 'input' && stateHolder(field).getAttribute('aria-invalid') === 'true')) this.validateField(field);
    }

    /** Show the summary of the invalid fields and move the focus. @param {HTMLElement[]} bad */
    showSummary(bad) {
        const summary = this.summary;
        if (summary === null) {
            if (this.settings.focusFirstInvalid) bad[0]?.focus();
            return;
        }
        writeSummary(summary, bad, this.settings);
        // Focused, not merely rendered: a message above the fold is
        // invisible to someone whose focus is at the bottom of a long
        // form, which is exactly where the submit button is.
        if (this.focusOnError) summary.focus();
    }

    /** Check every field; show the summary and fire `kp-form-invalid` when one is wrong. @returns {boolean} */
    validateAll() {
        const bad = dedupe(this.fields().filter((field) => !this.validateField(field)));
        if (bad.length === 0) {
            if (this.summary !== null) this.summary.hidden = true;
            return true;
        }
        this.showSummary(bad);
        this.form.dispatchEvent(new CustomEvent(INVALID_EVENT, { bubbles: true, detail: { fields: bad, names: bad.map(nameOf) } }));
        return false;
    }

    /** Show messages by field name: what a server sends back. @param {Record<string, string>} errors */
    showErrors(errors) {
        /** @type {HTMLElement[]} */
        const bad = [];
        for (const [name, message] of Object.entries(errors)) {
            const field = this.fields().find((f) => f.getAttribute('name') === name);
            if (field === undefined) continue;
            showError(field, message, this.marks);
            bad.push(field);
        }
        if (bad.length > 0) this.showSummary(dedupe(bad));
    }

    /** Clear every message. */
    clear() {
        for (const field of this.fields()) clearError(field, this.marks);
        if (this.summary !== null) this.summary.hidden = true;
    }

    /** End the busy state. */
    done() {
        this.form.dispatchEvent(new CustomEvent(DONE_EVENT, { bubbles: true }));
    }

    /** @param {SubmitEvent} event */
    onSubmit(event) {
        if (this.validateAll()) {
            // The page sends the data from `kp-form-valid`; the browser's own submit would reload the page and drop an
            // async save [wish-1028]. `nativeSubmit` / `data-kp-form-native-submit` keeps the old behaviour.
            if (!this.native()) event.preventDefault();
            this.form.dispatchEvent(new CustomEvent(VALID_EVENT, { bubbles: true, detail: { data: new FormData(this.form), done: () => this.done() } }));
            return;
        }
        event.preventDefault();
    }
}
