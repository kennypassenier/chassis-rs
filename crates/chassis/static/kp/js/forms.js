// Forms, framework-free [TH38].
//
// The browser validates; this makes what it found reachable. Constraint
// validation already knows a field is invalid and why — what it does not
// do is put the message where a screen reader will read it, gather the
// errors into a summary, or move focus to the first one. That is the work
// here, and it is the work every hand-written form skips.
//
//   <form class="kp-form" data-kp-form novalidate>
//     <div class="kp-form__summary" data-kp-form-summary tabindex="-1" hidden></div>
//     <div class="kp-field">
//       <label class="kp-field__label" for="name">Name <span class="kp-field__required">required</span></label>
//       <input class="kp-field__input" id="name" name="name" required />
//       <span class="kp-field__error" data-kp-field-error hidden></span>
//     </div>
//     <button class="kp-button kp-button--primary" data-kp-submit>Save</button>
//   </form>
//
// `novalidate` on purpose: the browser's own bubbles disappear on the next
// keystroke, show one error at a time, and cannot be styled or read back.
// Turning them off and using `checkValidity()` keeps the validation and
// loses the popup.
//
// A valid form is not submitted natively [wish-1028, Kitchen 5]: attachForms calls preventDefault() on a valid submit, fires
// `kp-form-valid` and the page sends the data. A form that should also be sent by the browser (an `action` doing the work) says
// so with `data-kp-form-native-submit` or the `nativeSubmit` option. This changes behaviour for every consumer that relied on the
// native submit of a form carrying `data-kp-form`.
//
// Three rules this enforces, each because leaving it to care is how it
// gets skipped:
//
//   1. A message is announced, not only coloured. `aria-invalid` and
//      `aria-describedby` point at the text.
//   2. The summary is focused, not just rendered. A message that appears
//      above the fold is invisible to someone whose focus is at the
//      bottom of a long form.
//   3. Validation reports on blur, never on every keystroke. Telling
//      someone their email is invalid while they type the third character
//      is technically true and practically hostile.
//
// Since 3.0.0 [KT6]: showError and clearError are exported, because the
// errors a server finds are the ones every real form has to show and the
// first version kept them in a closure; attach returns a handle that
// validates, reads and shows errors on demand; every rule above is a
// default rather than a law — `validateOn`, `focusSummary`, the wrapper
// selector — and fields added after attach validate too, because the
// listener is on the form, not on the fields.
//
// The module is a facade: a form is a `FormController` (closure-pattern B, js/controller.js) in `js/forms/`, one file per concern.

export { VALID_EVENT, INVALID_EVENT, FIELD_EVENT, DONE_EVENT } from './forms/constants.js';
export { nameOf, showError, clearError } from './forms/errors.js';
export { form, attachForms, attachFormgridStages, attachFormgridColumns } from './forms/api.js';
export { attachSwitches } from './forms/switches.js';

/** @typedef {import('./forms/constants.js').FormHandle} FormHandle */
