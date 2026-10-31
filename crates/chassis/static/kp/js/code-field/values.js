// The code field's selector, events and limits, and the pure position of a caret in a text.

/** The fields this module looks after. */
export const CODE_FIELD = 'textarea[data-kp-code-field]';
/** Fired on the textarea, bubbling, when it is time to check the text: `{ value, language, error(line, column, message) }`. */
export const CODE_FIELD_CHECK_EVENT = 'kp-code-field-check';
/** Fired on the textarea, bubbling, when the field's state changed: `{ state, line, column, message }`, state `ready` or `invalid`. */
export const CODE_FIELD_STATE_EVENT = 'kp-code-field-state';
/** Fired on the textarea, bubbling, when the caret moved to another line or column: `{ line, column }`. */
export const CODE_FIELD_CARET_EVENT = 'kp-code-field-caret';
/** The debounce of the check while typing [ms]. */
export const CODE_FIELD_CHECK_MS = 300;
/** The most lines the field grows to. */
export const CODE_FIELD_MAX_ROWS = 20;

/**
 * The line and column (from 1) of an offset in a text.
 * @param {string} text @param {number} offset
 * @returns {{ line: number, column: number }}
 */
export function caretPosition(text, offset) {
    const before = text.slice(0, Math.max(0, offset));
    const line = before.split('\n').length;
    return { line, column: before.length - before.lastIndexOf('\n') };
}
