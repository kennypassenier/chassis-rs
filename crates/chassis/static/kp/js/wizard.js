// Step wizard, framework-free [TH48].
//
// A multi-step form with a progress indicator that says where you are and
// what is still coming. The superstructure on TH38, and it borrows that
// module's validation rather than repeating it: a step that will not
// validate does not advance.
//
//   <div class="kp-wizard" data-kp-wizard>
//     <ol class="kp-wizard__steps" data-kp-wizard-steps>
//       <li data-kp-step-label>Details</li>
//       <li data-kp-step-label>Review</li>
//     </ol>
//     <section data-kp-step>…</section>
//     <section data-kp-step hidden>…</section>
//     <div class="kp-wizard__actions">
//       <button type="button" data-kp-wizard-back>Back</button>
//       <button type="button" data-kp-wizard-next>Next</button>
//     </div>
//   </div>
//
// The indicator is an ordered list, not a row of dots: the steps have
// names and a number, and "step 2 of 4" is what someone needs to hear.
// `aria-current="step"` marks where you are, which is the attribute that
// exists for exactly this and is almost never used.
//
// Since 3.0.0 [KT6]: the step is readable and settable through the
// handle — goTo(3) for a deep link or a restored draft; a transition can
// be held or refused by a listener on BEFORE_STEP_EVENT (preventDefault)
// or by an async `beforeStep` option, which is what a step that needs a
// server check was missing; labels can be made navigable; the validation
// gate and the focus move are options; and detach restores everything.

import { clearError, showError } from './forms.js';
import { getStrings } from './strings.js';
const WIZARD = '[data-kp-wizard]';

/** Fired when the step changed: `{ step, of, previous, direction }`. A contract value [TH26]. */
export const STEP_EVENT = 'kp-wizard-step';
/** Fired before a step change, cancelable: `{ from, to, direction }`. preventDefault() holds the wizard where it is. */
export const BEFORE_STEP_EVENT = 'kp-wizard-before-step';
/** Fired when Next is pressed on the last step: `{ of }`. */
export const FINISH_EVENT = 'kp-wizard-finish';

/**
 * @typedef {object} WizardHandle
 * @property {HTMLElement} element
 * @property {() => number} step
 * @property {(index: number) => Promise<boolean>} goTo resolves to whether the wizard moved
 * @property {() => Promise<boolean>} next
 * @property {() => Promise<boolean>} back
 */

/** @type {WeakMap<Element, WizardHandle>} */
const handles = new WeakMap();

/** The handle for an attached wizard. @param {Element} element */
export function wizard(element) {
    return handles.get(element) ?? null;
}

/**
 * @param {ParentNode} root
 * @param {{ validate?: boolean, focusStep?: boolean, navigableLabels?: boolean, beforeStep?: (from: number, to: number) => boolean | Promise<boolean> }} [options]
 *   Defaults; each also per wizard: `data-kp-validate="false"`, `data-kp-focus-step="false"`, `data-kp-navigable`.
 * @returns {(() => void) & { handles: WizardHandle[] }} detach
 */
export function attachWizards(root = document, { validate = true, focusStep = true, navigableLabels = false, beforeStep } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {WizardHandle[]} */
    const created = [];

    for (const element of root.querySelectorAll(WIZARD)) {
        const wizard = /** @type {HTMLElement} */ (element);
        if (wizard.dataset.kpWizardAttached !== undefined) continue;
        wizard.dataset.kpWizardAttached = '';

        const steps = /** @type {HTMLElement[]} */ ([...wizard.querySelectorAll('[data-kp-step]')]);
        const labels = /** @type {HTMLElement[]} */ ([...wizard.querySelectorAll('[data-kp-step-label]')]);
        const back = /** @type {HTMLButtonElement | null} */ (wizard.querySelector('[data-kp-wizard-back]'));
        const next = /** @type {HTMLButtonElement | null} */ (wizard.querySelector('[data-kp-wizard-next]'));
        const status = /** @type {HTMLElement | null} */ (wizard.querySelector('[data-kp-wizard-status]'));
        const gate = wizard.dataset.kpValidate === undefined ? validate : wizard.dataset.kpValidate !== 'false';
        const moveFocus = wizard.dataset.kpFocusStep === undefined ? focusStep : wizard.dataset.kpFocusStep !== 'false';
        const navigable = wizard.dataset.kpNavigable !== undefined || navigableLabels;
        // Start where the markup says, so a server can render step 3.
        let at = Math.max(
            0,
            steps.findIndex((step) => !step.hidden),
        );

        /** What attach changes, so detach can put it back. */
        const before = {
            hidden: steps.map((s) => s.hidden),
            tabindex: steps.map((s) => s.getAttribute('tabindex')),
            labelState: labels.map((l) => l.dataset.state ?? null),
            labelCurrent: labels.map((l) => l.getAttribute('aria-current')),
            labelTab: labels.map((l) => l.getAttribute('tabindex')),
            back: back?.disabled ?? false,
            next: next?.textContent ?? '',
            status: status?.textContent ?? '',
        };

        /** @param {{ announce?: boolean, previous?: number }} [options] */
        const show = ({ announce = true, previous = at } = {}) => {
            steps.forEach((step, i) => {
                step.hidden = i !== at;
            });
            labels.forEach((label, i) => {
                // Three states, and each is named rather than only
                // coloured: done, current, still to come.
                label.dataset.state = i < at ? 'done' : i === at ? 'current' : 'todo';
                if (i === at) label.setAttribute('aria-current', 'step');
                else label.removeAttribute('aria-current');
                if (navigable) label.tabIndex = i < at ? 0 : -1;
            });
            if (back !== null) back.disabled = at === 0;
            const s = getStrings();
            if (next !== null) next.textContent = at === steps.length - 1 ? (next.dataset.kpFinish ?? s.finish) : (next.dataset.kpNext ?? s.next);
            if (status !== null) status.textContent = s.wizardStep(at + 1, steps.length);
            if (announce) {
                // Focus moves into the new step, or a keyboard user presses
                // Next and stays where they were with no idea anything moved.
                if (moveFocus) {
                    steps[at]?.setAttribute('tabindex', '-1');
                    steps[at]?.focus();
                }
                wizard.dispatchEvent(
                    new CustomEvent(STEP_EVENT, {
                        bubbles: true,
                        detail: { step: at, of: steps.length, previous, direction: at > previous ? 'forward' : 'back' },
                    }),
                );
            }
        };

        /**
         * Whether js/forms.js is looking after this field. Only then does
         * its own focusout handler write the message; everywhere else the
         * wizard writes it, or a refused Next says nothing at all [gap-12].
         *
         * @param {HTMLInputElement} field
         */
        const formOwns = (field) => field.form?.dataset.kpFormAttached !== undefined;

        /** @returns {boolean} whether the current step's fields are all valid */
        const stepIsValid = () => {
            const current = steps[at];
            if (current === undefined) return true;
            const fields = /** @type {HTMLInputElement[]} */ ([...current.querySelectorAll('input, select, textarea')]);
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
        };

        /**
         * The way out of a message the wizard wrote [KT6]: a field it marked
         * is checked again as it changes, and the mark goes once it is valid.
         *
         * @param {Event} event
         */
        const onFieldInput = (event) => {
            const field = /** @type {HTMLInputElement} */ (event.target);
            if (!(field instanceof HTMLElement) || !('checkValidity' in field) || formOwns(field)) return;
            if (field.getAttribute('aria-invalid') === 'true' && field.checkValidity()) clearError(field);
        };

        /** @param {number} to @returns {Promise<boolean>} */
        const goTo = async (to) => {
            if (to < 0 || to >= steps.length || to === at) return false;
            const direction = to > at ? 'forward' : 'back';
            if (direction === 'forward' && gate && !stepIsValid()) return false;
            const ask = new CustomEvent(BEFORE_STEP_EVENT, { bubbles: true, cancelable: true, detail: { from: at, to, direction } });
            if (!wizard.dispatchEvent(ask)) return false;
            if (beforeStep !== undefined && !(await beforeStep(at, to))) return false;
            const previous = at;
            at = to;
            show({ previous });
            return true;
        };

        const onNext = () => {
            if (at >= steps.length - 1) {
                if (gate && !stepIsValid()) return;
                wizard.dispatchEvent(new CustomEvent(FINISH_EVENT, { bubbles: true, detail: { of: steps.length } }));
                return;
            }
            void goTo(at + 1);
        };
        const onBack = () => void goTo(at - 1);
        /** @param {Event} event */
        const onLabel = (event) => {
            if (!navigable) return;
            const label = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-kp-step-label]'));
            if (label === null) return;
            const index = labels.indexOf(label);
            // Back only: a completed step can be revisited, a future one
            // still has to be reached through its predecessors.
            if (index !== -1 && index < at) void goTo(index);
        };
        /** @param {KeyboardEvent} event */
        const onLabelKey = (event) => {
            if (event.key === 'Enter' || event.key === ' ') onLabel(event);
        };

        next?.addEventListener('click', onNext);
        back?.addEventListener('click', onBack);
        wizard.addEventListener('click', onLabel);
        wizard.addEventListener('keydown', onLabelKey);
        wizard.addEventListener('input', onFieldInput);
        // Rendered silently: the first version announced a step change
        // at attach, before anyone had done anything.
        show({ announce: false });

        /** @type {WizardHandle} */
        const handle = { element: wizard, step: () => at, goTo, next: () => goTo(at + 1), back: () => goTo(at - 1) };
        handles.set(wizard, handle);
        created.push(handle);

        cleanups.push(() => {
            next?.removeEventListener('click', onNext);
            back?.removeEventListener('click', onBack);
            wizard.removeEventListener('click', onLabel);
            wizard.removeEventListener('keydown', onLabelKey);
            wizard.removeEventListener('input', onFieldInput);
            steps.forEach((step, i) => {
                step.hidden = before.hidden[i] ?? false;
                const tab = before.tabindex[i];
                if (tab === null || tab === undefined) step.removeAttribute('tabindex');
                else step.setAttribute('tabindex', tab);
            });
            labels.forEach((label, i) => {
                const state = before.labelState[i];
                if (state === null || state === undefined) delete label.dataset.state;
                else label.dataset.state = state;
                const current = before.labelCurrent[i];
                if (current === null || current === undefined) label.removeAttribute('aria-current');
                else label.setAttribute('aria-current', current);
                const tab = before.labelTab[i];
                if (tab === null || tab === undefined) label.removeAttribute('tabindex');
                else label.setAttribute('tabindex', tab);
            });
            if (back !== null) back.disabled = before.back;
            if (next !== null) next.textContent = before.next;
            if (status !== null) status.textContent = before.status;
            handles.delete(wizard);
            delete wizard.dataset.kpWizardAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
