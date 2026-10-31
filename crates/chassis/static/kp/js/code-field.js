// A text box that knows its place in a configuration file [wish-1120, homelab 94; the hub's Files editor].
//
// A multiline field marked `data-kp-code-field` (YAML, TOML, INI, anything that is lines of text) shows where the caret is ("Line 3,
// column 12 · YAML"), numbers its lines in a gutter, indents with Tab, and marks the line a problem is on. It does not parse: a parser for
// YAML or TOML is not this package's to ship, so the page (or its server) says what is wrong, and the field draws it.
//
//   <textarea class="kp-field__input kp-field__input--multiline" id="conf" name="conf" data-kp-code-field="yaml" rows="10"></textarea>
//
//   area.addEventListener('kp-code-field-check', (event) => {
//       const problem = myParser(event.detail.value);                 // { line, column, message } or null
//       if (problem) event.detail.error(problem.line, problem.column, problem.message);
//   });
//   // or, later and from anywhere (a server answered):  setCodeFieldError(area, 3, 12, 'mapping values are not allowed here');
//   //                                                    setCodeFieldError(area, null);   // all well again
//
// The error marks its line in the gutter, says "Line 3, column 12: mapping values are not allowed here" under the field, holds the form back
// (`setCustomValidity`) and sets `aria-invalid`; a field inside a `.kp-field` with a `[data-kp-field-error]` slot puts the sentence there
// (js/forms.js). `kp-code-field-check` comes 300 ms after typing stops, on blur and once at attach; the error of the text before it is taken
// back at that moment, so a handler that finds nothing leaves the field clean. The field is drawn with the JSON field's look
// (`.kp-jsonfield`, js/json-field.js), so every theme already dresses it.
//
// Options, as attributes on the textarea (read again when they change):
//
//   data-kp-code-field   the language's name, printed in the readout: `yaml` | `toml` | `ini` | `json` | any word (default: none)
//   data-kp-code-check   `input` (default, debounced 300 ms) | `blur`
//   data-kp-code-indent  `2` (default) | `4` | `tab`: what Tab writes
//   data-kp-code-gutter  on by default; `false` takes the line numbers away
//   data-kp-code-wrap    long lines wrap (the gutter follows); default they scroll inside the field
//   data-kp-code-block   `false`: an error does not hold the form back (default: it does)
//   rows                 the least height in lines (default 6); the field grows with its text to 20
//
// Tab indents, Shift+Tab takes one indent off, Esc and then Tab leaves the field. Events (bubbling, on the textarea):
//   kp-code-field-check  { value, language, error(line, column, message) }   time to check the text
//   kp-code-field-state  { state, line, column, message }                    `ready` | `invalid`, when it changed
//   kp-code-field-caret  { line, column }                                    the caret moved to another line or column
// Nothing runs on import; attachCodeFields(root) returns a detach.
//
// Each field is one CodeFieldControl controller (js/code-field/controller.js over core.js and problem.js, on js/controller.js); the parts are listed in js/README.md.

import { attachAll, controllerOf } from './controller.js';
import { CodeFieldControl } from './code-field/controller.js';
import { CODE_FIELD } from './code-field/values.js';

export {
    CODE_FIELD,
    CODE_FIELD_CHECK_EVENT,
    CODE_FIELD_STATE_EVENT,
    CODE_FIELD_CARET_EVENT,
    CODE_FIELD_CHECK_MS,
    CODE_FIELD_MAX_ROWS,
    caretPosition,
} from './code-field/values.js';

/**
 * @typedef {object} CodeFieldHandle
 * @property {() => { line: number, column: number }} position the caret's line and column, counted from 1
 * @property {(line: number | null, column?: number | null, message?: string) => void} setError mark the problem the page found; `null` takes it back
 * @property {() => void} check ask the page to check the text now
 * @property {() => { state: 'ready' | 'invalid', line: number | null, column: number | null, message: string }} state
 */

/**
 * The handle of a field that has been attached.
 * @param {Element} area
 * @returns {CodeFieldHandle | null}
 */
export function codeField(area) {
    return controllerOf(area, CodeFieldControl)?.handle ?? null;
}

/**
 * Mark the problem the page found in a code field: its line in the gutter, "Line 3, column 12: why" under the field, the form held back.
 * `setCodeFieldError(area, null)` takes it back.
 * @param {Element} area an attached `textarea[data-kp-code-field]`
 * @param {number | null} line from 1; null: no problem
 * @param {number | null} [column] from 1
 * @param {string} [message]
 */
export function setCodeFieldError(area, line, column = null, message = '') {
    controllerOf(area, CodeFieldControl)?.setError(line, column, message);
}

/**
 * Give every `textarea[data-kp-code-field]` under `root` its gutter, readout and error line.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachCodeFields(root = document) {
    return attachAll(root, CODE_FIELD, CodeFieldControl);
}
