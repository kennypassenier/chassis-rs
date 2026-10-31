// A text box that knows JSON [kpadopt5; kyu's publish box, homelab's action arguments, the chassis test body].
//
// A multiline field marked `data-kp-json` checks what is typed while it is typed,
// says what is wrong and where ("Line 3, column 12: expected ','", with the line
// marked in a gutter of line numbers), formats and minifies on request, and holds
// the form back while the JSON is broken.
//
//   <div class="kp-field">
//       <label class="kp-field__label" for="body">Message</label>
//       <textarea class="kp-field__input kp-field__input--multiline" id="body" name="body"
//           data-kp-json="strict" placeholder='{"hello":"world"}'></textarea>
//   </div>
//
// Options, as attributes on the textarea and as the second argument of
// attachJsonFields():
//
//   data-kp-json            `strict` (default: text that is not JSON blocks the form) | `allow-text` (it may be sent, and the line says so);
//                           decided per field, never for the whole package
//   data-kp-json-check      `input` (default, debounced 300 ms) | `blur`
//   data-kp-json-format     `button` (default: Format and Minify beside the field) | `on-blur` (valid JSON is laid out when the field loses focus) | `off`
//   data-kp-json-indent     `2` (default) | `4` | `tab`
//   data-kp-json-gutter     on by default; `data-kp-json-gutter="false"` takes the line numbers away
//   data-kp-json-wrap       long lines wrap (the gutter then follows the wrapped lines); default they scroll inside the field
//   data-kp-json-schema     a URL or inline JSON handed to the page in `kp-json-validate`, whose handler may refuse a value that parses
//   rows                    the least height in lines (default 6); the field grows with its text to 20
//
// A valid text says so quietly ("Valid JSON · 3 keys"); an empty one says
// "Empty" (and is valid unless the field is `required`). Tab indents, Shift+Tab
// takes one indent off, Esc and then Tab leaves the field, so the keyboard is
// never trapped; Mod+Shift+F formats. The message is in a status line under the
// field, `aria-describedby`; a field inside a `.kp-field` that has a
// `[data-kp-field-error]` slot (js/forms.js) puts the problem there instead.
// While the field is disabled or read-only the tools stand still.
//
// The module is a facade: a JSON field is a `JsonFieldController` (closure-pattern B, js/controller.js) in `js/json-field/`, one file per concern.

export { JSON_FIELD, JSON_STATE_EVENT, JSON_VALIDATE_EVENT, JSON_CHECK_MS, JSON_MAX_ROWS, JSON_COPIED_MS } from './json-field/constants.js';
export { explainJson } from './json-field/explain.js';
export { jsonField, attachJsonFields } from './json-field/api.js';

/** @typedef {import('./json-field/constants.js').JsonFieldOptions} JsonFieldOptions */
/** @typedef {import('./json-field/constants.js').JsonFieldHandle} JsonFieldHandle */
