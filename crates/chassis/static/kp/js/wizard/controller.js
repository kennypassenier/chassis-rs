// The controller of one wizard: Back and Next, the labels as a way back, the gate and the hold on a step change.

import { stepIsValid, recheckField } from './validate.js';
import { BEFORE_STEP_EVENT, FINISH_EVENT } from './values.js';
import { WizardView } from './view.js';

/** One step wizard. */
export class WizardController extends WizardView {
    connect() {
        this.host.dataset.kpWizardAttached = '';
        this.own(() => {
            delete this.host.dataset.kpWizardAttached;
        });
        this.collect();
        this.own(() => this.restore());
        if (this.next) this.listen(this.next, 'click', () => this.onNext());
        if (this.back) this.listen(this.back, 'click', () => void this.goTo(this.at - 1));
        this.listen(this.host, 'click', (event) => this.onLabel(event));
        this.listen(this.host, 'keydown', (event) => this.onLabelKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.host, 'input', recheckField);
        // Rendered silently: the first version announced a step change
        // at attach, before anyone had done anything.
        this.show({ announce: false });
        this.setHandle({
            element: this.host,
            step: () => this.at,
            goTo: (to) => this.goTo(to),
            next: () => this.goTo(this.at + 1),
            back: () => this.goTo(this.at - 1),
        });
    }

    /** @param {number} to @returns {Promise<boolean>} whether the wizard moved */
    async goTo(to) {
        const { at, steps } = this;
        if (to < 0 || to >= steps.length || to === at) return false;
        const direction = to > at ? 'forward' : 'back';
        if (direction === 'forward' && this.gate && !stepIsValid(steps[at])) return false;
        const ask = new CustomEvent(BEFORE_STEP_EVENT, { bubbles: true, cancelable: true, detail: { from: at, to, direction } });
        if (!this.host.dispatchEvent(ask)) return false;
        const { beforeStep } = /** @type {import('../wizard.js').WizardOptions} */ (this.options);
        if (beforeStep !== undefined && !(await beforeStep(at, to))) return false;
        // A detach while the app was answering: the wizard has been put back, nothing moves.
        if (this.destroyed) return false;
        this.moveTo(to);
        return true;
    }

    onNext() {
        const { at, steps } = this;
        if (at >= steps.length - 1) {
            if (this.gate && !stepIsValid(steps[at])) return;
            this.host.dispatchEvent(new CustomEvent(FINISH_EVENT, { bubbles: true, detail: { of: steps.length } }));
            return;
        }
        void this.goTo(at + 1);
    }

    /** @param {Event} event */
    onLabel(event) {
        if (!this.navigable) return;
        const label = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-kp-step-label]'));
        if (label === null) return;
        const index = this.labels.indexOf(label);
        // Back only: a completed step can be revisited, a future one
        // still has to be reached through its predecessors.
        if (index !== -1 && index < this.at) void this.goTo(index);
    }

    /** @param {KeyboardEvent} event */
    onLabelKey(event) {
        if (event.key === 'Enter' || event.key === ' ') this.onLabel(event);
    }
}
