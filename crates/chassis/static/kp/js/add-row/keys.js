// The keys of an add row: Ctrl+Enter (Cmd+Enter) adds the line from any field, and `data-kp-addrow-enter="submit"` lets a plain
// Enter on a closed select add it too [enter-1103]. The adding key is `data-kp-addrow-submit-key` (a key spec, default
// `Mod+Enter`, `none` for no key) or the `submitKey` option of `configureAddRow` [keys-1103].

import { selectHandles } from '../combobox/handle.js';
import { matchesKeySpec, resolveKeySpec } from '../key-spec.js';
import { ADD_ROW_ENTER, ADD_ROW_SUBMIT_KEY_ATTRIBUTE, ADD_ROW_SUBMIT_KEY, ENTER_SUBMIT } from './constants.js';

/** The fields a key can be pressed in; a button keeps its own Enter. */
const FIELD = 'input, select, textarea';

/** The page's JS default for the adding key; the row's attribute wins over it. @type {string | false | undefined} */
let submitKeyOption;

/** @param {{ submitKey?: string | false }} options a key spec for the adding key, or `false` for none */
export function configureAddRow(options) {
    submitKeyOption = options.submitKey;
}

/** @param {HTMLFormElement} row @param {KeyboardEvent} event @returns {boolean} the row's adding key (default Mod+Enter) */
function isSubmitKey(row, event) {
    return matchesKeySpec(event, resolveKeySpec(row, ADD_ROW_SUBMIT_KEY_ATTRIBUTE, undefined, submitKeyOption ?? ADD_ROW_SUBMIT_KEY));
}

/**
 * A plain Enter on a CLOSED select of a row that asked for it. An open list keeps Enter for choosing its option.
 * @param {HTMLFormElement} row @param {KeyboardEvent} event @param {Element} field
 */
function isEnterOnClosedSelect(row, event, field) {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    return row.getAttribute(ADD_ROW_ENTER) === ENTER_SUBMIT && field instanceof HTMLSelectElement && field.getAttribute('aria-expanded') !== 'true';
}

/**
 * Add the line when the key asks for it. Runs in the capture phase on the row, so it comes before the drawn select's own
 * listener and the list box's Enter, which would open or choose instead. The Add button's own state is respected: a busy
 * (disabled) Add button takes no second line, as with a plain Enter.
 * @param {HTMLFormElement} row @param {KeyboardEvent} event
 * @returns {boolean} whether the key was taken
 */
export function addFromKey(row, event) {
    if (event.isComposing || event.defaultPrevented) return false;
    const field = event.target instanceof Element ? event.target.closest(FIELD) : null;
    if (!field || !row.contains(field)) return false;
    if (!isSubmitKey(row, event) && !isEnterOnClosedSelect(row, event, field)) return false;
    event.preventDefault();
    event.stopPropagation();
    const button = /** @type {HTMLButtonElement | null} */ (row.querySelector('button[type="submit"], input[type="submit"]'));
    if (button?.disabled) return true;
    selectHandles.get(field)?.close();
    row.requestSubmit(button);
    return true;
}
