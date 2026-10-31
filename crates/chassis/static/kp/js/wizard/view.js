// What a wizard shows: the step, the labels, the buttons and the status, drawn from the current step, and put back as they came.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { STEP_EVENT } from './values.js';

/** @typedef {import('../wizard.js').WizardOptions} WizardOptions */
/** @typedef {import('../wizard.js').WizardHandle} WizardHandle */
/** @typedef {{ hidden: (boolean | 'until-found')[], tabindex: (string | null)[], labelState: (string | null)[], labelCurrent: (string | null)[], labelTab: (string | null)[], back: boolean, next: string, status: string }} WizardSnapshot */

/** An attribute put back to what it was: removed when it was none. @param {Element} el @param {string} name @param {string | null | undefined} was */
const putBack = (el, name, was) => {
    if (was === null || was === undefined) el.removeAttribute(name);
    else el.setAttribute(name, was);
};

/** The drawing of one wizard: its parts, its options and the step it is on. */
export class WizardView extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {WizardOptions} [options] defaults; each also per wizard: `data-kp-validate="false"`, `data-kp-focus-step="false"`, `data-kp-navigable`
     */
    constructor(host, options = {}) {
        super(host, options);
        /** @type {HTMLElement[]} */
        this.steps = [];
        /** @type {HTMLElement[]} */
        this.labels = [];
        /** @type {HTMLButtonElement | null} */
        this.back = null;
        /** @type {HTMLButtonElement | null} */
        this.next = null;
        /** @type {HTMLElement | null} */
        this.status = null;
        /** Whether Next on a step waits for the step's fields to validate. */
        this.gate = true;
        /** Whether the focus moves into the new step. */
        this.moveFocus = true;
        /** Whether a completed step's label can be pressed to go back. */
        this.navigable = false;
        /** The step shown now. */
        this.at = 0;
        /** What attach changes, so detach can put it back. @type {WizardSnapshot | null} */
        this.before = null;
        /** The handle a page gets back, made once the wizard is wired. @type {WizardHandle | null} */
        this.api = null;
    }

    /** @param {WizardHandle} api */
    setHandle(api) {
        this.api = api;
    }

    /** The handle a page gets back for this wizard (the same object each time). @returns {WizardHandle} */
    handle() {
        return /** @type {WizardHandle} */ (this.api);
    }

    /** Find the parts, read the options and start where the markup says, so a server can render step 3. */
    collect() {
        const wizard = this.host;
        const { validate = true, focusStep = true, navigableLabels = false } = /** @type {WizardOptions} */ (this.options);
        this.steps = /** @type {HTMLElement[]} */ ([...wizard.querySelectorAll('[data-kp-step]')]);
        this.labels = /** @type {HTMLElement[]} */ ([...wizard.querySelectorAll('[data-kp-step-label]')]);
        this.back = /** @type {HTMLButtonElement | null} */ (wizard.querySelector('[data-kp-wizard-back]'));
        this.next = /** @type {HTMLButtonElement | null} */ (wizard.querySelector('[data-kp-wizard-next]'));
        this.status = /** @type {HTMLElement | null} */ (wizard.querySelector('[data-kp-wizard-status]'));
        this.gate = wizard.dataset.kpValidate === undefined ? validate : wizard.dataset.kpValidate !== 'false';
        this.moveFocus = wizard.dataset.kpFocusStep === undefined ? focusStep : wizard.dataset.kpFocusStep !== 'false';
        this.navigable = wizard.dataset.kpNavigable !== undefined || navigableLabels;
        this.at = Math.max(
            0,
            this.steps.findIndex((step) => !step.hidden),
        );
        this.before = this.snapshot();
    }

    /** What the markup had before attach changed it. @returns {WizardSnapshot} */
    snapshot() {
        const { steps, labels, back, next, status } = this;
        return {
            hidden: steps.map((s) => s.hidden),
            tabindex: steps.map((s) => s.getAttribute('tabindex')),
            labelState: labels.map((l) => l.dataset.state ?? null),
            labelCurrent: labels.map((l) => l.getAttribute('aria-current')),
            labelTab: labels.map((l) => l.getAttribute('tabindex')),
            back: back?.disabled ?? false,
            next: next?.textContent ?? '',
            status: status?.textContent ?? '',
        };
    }

    /** Make `to` the current step and draw it, announcing the change. @param {number} to */
    moveTo(to) {
        const previous = this.at;
        this.at = to;
        this.show({ previous });
    }

    /**
     * Draw the current step; announce it (focus and event) unless rendering silently.
     * @param {{ announce?: boolean, previous?: number }} [how]
     */
    show({ announce = true, previous = this.at } = {}) {
        const { at, steps } = this;
        steps.forEach((step, i) => {
            step.hidden = i !== at;
        });
        this.showLabels();
        this.showButtons();
        if (!announce) return;
        // Focus moves into the new step, or a keyboard user presses
        // Next and stays where they were with no idea anything moved.
        if (this.moveFocus) {
            steps[at]?.setAttribute('tabindex', '-1');
            steps[at]?.focus();
        }
        this.host.dispatchEvent(
            new CustomEvent(STEP_EVENT, {
                bubbles: true,
                detail: { step: at, of: steps.length, previous, direction: at > previous ? 'forward' : 'back' },
            }),
        );
    }

    showLabels() {
        const { at, navigable } = this;
        this.labels.forEach((label, i) => {
            // Three states, and each is named rather than only
            // coloured: done, current, still to come.
            label.dataset.state = i < at ? 'done' : i === at ? 'current' : 'todo';
            if (i === at) label.setAttribute('aria-current', 'step');
            else label.removeAttribute('aria-current');
            if (navigable) label.tabIndex = i < at ? 0 : -1;
        });
    }

    showButtons() {
        const { at, back, next, status, steps } = this;
        if (back !== null) back.disabled = at === 0;
        const s = getStrings();
        if (next !== null) next.textContent = at === steps.length - 1 ? (next.dataset.kpFinish ?? s.finish) : (next.dataset.kpNext ?? s.next);
        if (status !== null) status.textContent = s.wizardStep(at + 1, steps.length);
    }

    /** Put the steps, labels and buttons back as the snapshot had them. */
    restore() {
        const before = this.before;
        if (before === null) return;
        const { back, next, status } = this;
        this.steps.forEach((step, i) => {
            step.hidden = before.hidden[i] ?? false;
            putBack(step, 'tabindex', before.tabindex[i]);
        });
        this.labels.forEach((label, i) => {
            const state = before.labelState[i];
            if (state === null || state === undefined) delete label.dataset.state;
            else label.dataset.state = state;
            putBack(label, 'aria-current', before.labelCurrent[i]);
            putBack(label, 'tabindex', before.labelTab[i]);
        });
        if (back !== null) back.disabled = before.back;
        if (next !== null) next.textContent = before.next;
        if (status !== null) status.textContent = before.status;
    }
}
