// A text box that grows with its text [kpadopt6-media; JobTracker's correspondence box, kyu's publish payload].
//
// Not a new component: an opt-in attribute on the existing multiline field (`.kp-field__input--multiline`), so a pasted mail is
// seen whole and the Save button still stays within reach (Kenny, 2026-10-17: "20 regels, daarna scrollen in het vak").
//
//   <textarea class="kp-field__input kp-field__input--multiline" data-kp-autosize rows="3"></textarea>
//
// The grow logic that lived privately in js/json-field.js is here once (`fitTextarea`), and the JSON box calls it.
//
// Options (markup, each with a default [KT6]; the same names are the options of `attachAutosize(root, options)`):
//   data-kp-autosize           present: on; "off": off                                    off (existing fields never change)
//   rows (native)              the least height in lines                                  3
//   data-kp-autosize-max       the most lines, or `none`                                  20 (then the box scrolls inside)
//   data-kp-autosize-engine    css | js | auto: `auto` takes CSS `field-sizing: content` when the browser has it  auto
//   data-kp-autosize-shrink    on | off: deleting text gives the height back              on
//   data-kp-resize             none | vertical: the drag handle                           vertical (a size dragged by hand holds until the next input)
//   data-kp-counter            off | chars | lines | both                                 off
//   maxlength (native)         with a counter: "1 204 of 4 000", warning tone from 90 %
//   data-kp-submit-key         mod-enter: Ctrl or ⌘ with Enter submits the form (listed in the ? sheet)   off
//   data-kp-remember           a name: an unsent draft is kept on this device, cleared when the form is sent
//
// A phone (under 40em) caps the box at 60 % of the visible height as well, so the keyboard never hides the Save button. A
// disabled or read-only box grows to show its whole value. Measured on input, paste, cut, a programmatic `value =`, a change
// of width (wrapping), a font arriving and the visible viewport changing; the height is never animated (an animated height is
// a layout shift). Loading (`setAutosizeState(el, 'loading')`) lays the theme's busy card over the box at its least height;
// failed (`setAutosizeState(el, 'error', 'sentence')`) keeps the text and the height and writes the sentence in the field's
// error line. Fires `kp-autosize-resize` on the box: `{ height, lines, capped }`. Nothing runs on import.
//
// The module is a facade: a growing box is an `AutosizeController` (closure-pattern B, js/controller.js) in `js/autosize/`, one file per concern.

export { AUTOSIZE, AUTOSIZE_EVENT, AUTOSIZE_MAX_LINES, AUTOSIZE_MIN_LINES, AUTOSIZE_STATES } from './autosize/constants.js';
export { lineHeightOf, fitTextarea, cssAutosizeSupported } from './autosize/fit.js';
export { autosize, refreshAutosize, setAutosizeState, attachAutosize } from './autosize/api.js';

/** @typedef {import('./autosize/constants.js').FitOptions} FitOptions */
/** @typedef {import('./autosize/constants.js').AutosizeOptions} AutosizeOptions */
/** @typedef {import('./autosize/constants.js').AutosizeHandle} AutosizeHandle */
