// The selector, events, fixed numbers and types of the JSON text box.

/** The fields this module looks after. */
export const JSON_FIELD = 'textarea[data-kp-json]';
/** Fired on the textarea, bubbling, when its state changed: `{ state, line, column, message, keys }`, state `empty` | `valid` | `invalid` | `text`. */
export const JSON_STATE_EVENT = 'kp-json-state';
/**
 * Fired on the textarea, bubbling, for a text that parses: `{ value, text, schema, refuse(why) }`. A handler that calls `refuse` makes the field invalid with that sentence.
 */
export const JSON_VALIDATE_EVENT = 'kp-json-validate';
/** The debounce of the check while typing [ms]. */
export const JSON_CHECK_MS = 300;
/** The most lines the field grows to. */
export const JSON_MAX_ROWS = 20;
/** How long "Copied" stays on the button [ms]. */
export const JSON_COPIED_MS = 1500;

/** The least height in lines when `rows` says nothing usable, and the least a `rows` may be. */
export const DEFAULT_ROWS = 6;
export const MIN_ROWS = 2;
/** The line height assumed when a computed one cannot be read [px]. */
export const FALLBACK_LINE_HEIGHT = 20;
/** The spaces of the two space indents. */
export const INDENT_NARROW = 2;
export const INDENT_WIDE = 4;

/** The attributes whose change redraws the field, and the two it also watches for the tools. */
export const WATCHED_ATTRIBUTES = [
    'disabled',
    'readonly',
    'data-kp-json',
    'data-kp-json-check',
    'data-kp-json-format',
    'data-kp-json-indent',
    'data-kp-json-gutter',
    'data-kp-json-wrap',
];

/**
 * @typedef {object} JsonFieldOptions
 * @property {'strict' | 'allow-text'} [mode]
 * @property {'input' | 'blur'} [check]
 * @property {'button' | 'on-blur' | 'off'} [format]
 * @property {'2' | '4' | 'tab'} [indent]
 * @property {boolean} [gutter]
 * @property {boolean} [wrap]
 */

/**
 * @typedef {object} JsonFieldHandle
 * @property {() => 'empty' | 'valid' | 'invalid' | 'text'} state
 * @property {() => void} check
 * @property {() => boolean} format lay it out; false when it is not JSON
 * @property {() => boolean} minify
 * @property {() => unknown} value the parsed value, or `undefined`
 */
