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

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names, the view (WizardView), the validation gate and the
// WizardController live in js/wizard/, listed in js/README.md.

import { wireWizards } from './wizard/attach.js';

export { STEP_EVENT, BEFORE_STEP_EVENT, FINISH_EVENT } from './wizard/values.js';
export { wizard } from './wizard/attach.js';

/**
 * @typedef {object} WizardHandle
 * @property {HTMLElement} element
 * @property {() => number} step
 * @property {(index: number) => Promise<boolean>} goTo resolves to whether the wizard moved
 * @property {() => Promise<boolean>} next
 * @property {() => Promise<boolean>} back
 */

/**
 * @typedef {object} WizardOptions
 * @property {boolean} [validate] whether Next waits for the step's fields to validate (default true)
 * @property {boolean} [focusStep] whether the focus moves into the new step (default true)
 * @property {boolean} [navigableLabels] whether a completed step's label can be pressed to go back (default false)
 * @property {(from: number, to: number) => boolean | Promise<boolean>} [beforeStep] holds or refuses a step change
 */

/**
 * @param {ParentNode} root
 * @param {WizardOptions} [options]
 *   Defaults; each also per wizard: `data-kp-validate="false"`, `data-kp-focus-step="false"`, `data-kp-navigable`.
 * @returns {(() => void) & { handles: WizardHandle[] }} detach
 */
export function attachWizards(root = document, options = {}) {
    return wireWizards(root, options);
}
