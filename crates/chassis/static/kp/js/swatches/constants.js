// The selectors, attributes, event and shapes of the swatch picker [parts-1102].

/** A swatch picker: `.kp-swatches[data-kp-swatches]`. */
export const SWATCHES = '[data-kp-swatches]';
/** The swatches on a row (default 6; the grid wraps sooner when the picker is narrower). */
export const COLUMNS_ATTRIBUTE = 'data-kp-swatches-columns';
/** `on` (default) shows the current swatch's name under the grid; `off` leaves it to the swatches' own names. */
export const NAME_ATTRIBUTE = 'data-kp-swatches-name';
/** Fired on the picker, bubbling, when a person picked a swatch: `{ value, label, source }`. */
export const SWATCH_CHANGE_EVENT = 'kp-swatch-change';
/** The number of categorical colours a theme gives (`--kp-cat-1` … `--kp-cat-12`). */
export const CATEGORICAL_COUNT = 12;

/**
 * One swatch.
 * @typedef {object} Swatch
 * @property {string} value what the page stores and the event reports
 * @property {string} label its name, said and shown ("Teal")
 * @property {number | string} [colour] 1 to 12, a categorical colour of the theme (`--kp-cat-N`, the default: the swatch's place);
 *   any other text is a CSS colour
 */
