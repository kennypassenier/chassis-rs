// The selector, event, states, fixed numbers and types of the growing text box.

/** A box that grows. */
export const AUTOSIZE = 'textarea[data-kp-autosize]';
/** Fired on the box when its height changed: `{ height, lines, capped }`. */
export const AUTOSIZE_EVENT = 'kp-autosize-resize';
/** The most lines a box grows to unless it says otherwise. */
export const AUTOSIZE_MAX_LINES = 20;
/** The least lines. */
export const AUTOSIZE_MIN_LINES = 3;
/** The states a box can be in. */
export const AUTOSIZE_STATES = /** @type {const} */ (['ready', 'loading', 'error']);

/** Under this width a phone's keyboard takes half the screen: the cap follows the visible height. */
export const PHONE = '(max-width: 40em)';
/** The share of the visible height a box may take on a phone, so the keyboard never hides the Save button. */
export const PHONE_HEIGHT_SHARE = 0.6;
/** A line is this many times the font size when its line height is `normal`. */
export const NORMAL_LINE_HEIGHT = 1.2;
/** The font size assumed when a computed one cannot be read [px]. */
export const FALLBACK_FONT_PX = 16;
/** From this share of `maxlength` the counter turns to the warning tone and the near-full sentence is said. */
export const COUNTER_WARN_SHARE = 0.9;
/** The announced levels of the counter: nothing, near the limit, at the limit. */
export const LEVEL_NONE = 0;
export const LEVEL_NEAR = 1;
export const LEVEL_FULL = 2;

/**
 * @typedef {object} FitOptions
 * @property {number} [minRows] the least lines (default 3)
 * @property {number | null} [maxRows] the most lines; null: no cap (default 20)
 * @property {number} [maxPx] a second cap in px (a phone's visible height)
 * @property {number} [keepPx] never shorter than this (shrink off: the tallest the box has been)
 * @property {boolean} [apply] write the height (default true)
 */

/**
 * @typedef {object} AutosizeOptions
 * @property {number} [rows] the least lines
 * @property {number | 'none'} [max] the most lines
 * @property {'css' | 'js' | 'auto'} [engine]
 * @property {boolean} [shrink]
 * @property {'off' | 'chars' | 'lines' | 'both'} [counter]
 */

/**
 * @typedef {object} AutosizeHandle
 * @property {HTMLTextAreaElement} element
 * @property {() => void} refresh measure again (after a value written by a script that bypassed the setter)
 * @property {(state: 'ready' | 'loading' | 'error', message?: string) => void} setState
 * @property {() => { chars: number, lines: number }} count
 * @property {'css' | 'js'} engine the engine in use
 */
