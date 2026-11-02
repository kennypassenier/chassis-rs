// The popover form [ux-1101]: a small form anchored to its button, for one quick value without a dialog (Medicine
// Cabinet's "Add stock", which was a modal holding one stepper).
//
//   <div class="kp-popover-form" data-kp-popover-form>
//       <button type="button" class="kp-button">Add stock</button>
//       <form class="kp-menu kp-popover-form__panel" aria-label="Add stock to Ibuprofen 400">
//           <label class="kp-popover-form__label" for="add-ibu">Boxes to add</label>
//           <div class="kp-popover-form__row">
//               <input class="kp-field__input" id="add-ibu" name="boxes" type="number" min="1" max="20" value="1" required />
//               <button type="submit" class="kp-button kp-button--primary">Add</button>
//           </div>
//       </form>
//   </div>
//
// The form stands on the menu's raised plate (`.kp-menu`, which every register already paints opaque) and is placed the way
// the menu button places its menu: under the button, whole on the screen, lifted over a container that would clip it. It is
// a non-modal dialog: the button says `aria-haspopup="dialog"` and `aria-expanded`, the first field gets the focus with its
// value selected, Enter accepts, Escape closes and gives the focus back to the button, and a press outside or the focus
// leaving closes it. It closes as it opened, backwards (js/motion.js). Every open starts from the form's own values.
//
// Accepting checks the browser's own validity first (`required`, `min`, `max`, `pattern`): a refused field says why on the
// problem line under the row and the form stays open. Then `kp-popover-form-accept` fires (js/popover-form/constants.js);
// the page may cancel it, or hand `detail.waitUntil(promise)` its save: the form waits, busy, closes when it resolves and
// shows the rejection's message when it fails. The field can be any field the package has (a quantity stepper, a time).
// Under a coarse pointer the fields are 44 px high, as the buttons already are.
//
// Nothing runs on import; attachPopoverForms(root) wires every `[data-kp-popover-form]` under root and returns a detach.

import { attachAll, controllerOf } from './controller.js';
import { POPOVER_FORM } from './popover-form/constants.js';
import { writeProblem } from './popover-form/accept.js';
import { PopoverFormControl } from './popover-form/controller.js';

export {
    POPOVER_FORM,
    POPOVER_FORM_PANEL,
    POPOVER_FORM_ACCEPT_EVENT,
    POPOVER_FORM_OPEN_EVENT,
    POPOVER_FORM_CLOSE_EVENT,
} from './popover-form/constants.js';

/**
 * Wire every popover form under `root`. Idempotent.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachPopoverForms(root = document) {
    return attachAll(root, POPOVER_FORM, PopoverFormControl);
}

/** Open a wired popover form from the page. @param {Element} wrapper */
export function openPopoverForm(wrapper) {
    controllerOf(/** @type {HTMLElement} */ (wrapper), PopoverFormControl)?.open();
}

/** Close it from the page; the focus stays where it is. @param {Element} wrapper */
export function closePopoverForm(wrapper) {
    controllerOf(/** @type {HTMLElement} */ (wrapper), PopoverFormControl)?.close('script', false);
}

/**
 * Write a problem on an open form (a refusal the page learns of later), or clear it with an empty text.
 * @param {Element} wrapper @param {string} text
 */
export function setPopoverFormProblem(wrapper, text) {
    const form = controllerOf(/** @type {HTMLElement} */ (wrapper), PopoverFormControl)?.form;
    if (form) writeProblem(form, text);
}
