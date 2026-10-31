// The selectors, event names, form grid blocks and types of the forms module [TH38].

/** A form that is attached. */
export const FORM = '[data-kp-form]';
/** The summary a form focuses on a failed submit. */
export const SUMMARY = '[data-kp-form-summary]';
/** The holder of a field's message. */
export const FIELD_ERROR = '[data-kp-field-error]';
/** A submit button that says it is working. */
export const SUBMIT = '[data-kp-submit]';

/**
 * Fired when a form passes validation. A contract value [TH26]: the
 * detail carries the FormData and, since KT6, a `done()` that ends the
 * busy state. A consumer may call it, or return nothing and dispatch
 * `DONE_EVENT` on the form themselves — same effect.
 */
export const VALID_EVENT = 'kp-form-valid';
/** Fired when a submit failed validation: `{ fields, names }`. */
export const INVALID_EVENT = 'kp-form-invalid';
/** Fired on a field when its validity was checked: `{ valid, message }`. */
export const FIELD_EVENT = 'kp-field-validity';

/**
 * Ends the busy state the submit button took on `VALID_EVENT` [KT6].
 * Dispatched on the form by `detail.done()`, or by the consumer directly.
 * Nothing dispatches it on its own: a consumer who navigates away on
 * submit must not get back a button that double-sends.
 */
export const DONE_EVENT = 'kp-form-done';

/** The row of a switch, and the element its two words go into [gap-11]. */
export const SWITCH = '.kp-switch';
export const SWITCH_STATE = '.kp-switch__state';

/** The stage that shares rows between form grids, and the grids that take their rows from it. */
export const FORMGRID_STAGE = '[data-kp-formgrid-stage]';
/** The blocks of a form grid that give their rows to the grid in a row-sharing card (css: display: contents). */
export const FORMGRID_BLOCK = '.kp-formgrid__group, .kp-formrows, .kp-kv, form';
/** How many levels of blocks the stylesheet flattens when it counts a grid's rows. */
export const FORMGRID_BLOCK_DEPTH = 2;
/** What keeps a form grid's groups from standing side by side: a wide block keeps its stretching tracks. */
export const WIDE_BLOCKS =
    '[data-kp-formgrid-span], .kp-jsonfield, .kp-code, textarea, .kp-refresh, .kp-formrow--wide, .kp-attention, .kp-problems, .kp-command, .kp-segmented--block, .kp-formgrid__fill';
/** Half a pixel of rounding slack when the groups are measured against the grid's width. */
export const FIT_SLACK_PX = 0.5;

/**
 * @typedef {object} FormHandle
 * @property {HTMLFormElement} element
 * @property {() => boolean} validate check every field, show what is wrong, and return whether the form is valid
 * @property {() => HTMLElement[]} invalid the fields currently marked invalid
 * @property {(errors: Record<string, string>) => void} errors show messages by field name — what a server sends back
 * @property {() => void} clear clear every message
 * @property {() => void} done end the busy state
 */

/**
 * @typedef {object} FormOptions
 * @property {'blur' | 'input' | 'submit'} [validateOn]
 * @property {'input' | 'blur' | 'none'} [revalidateOn]
 * @property {boolean} [focusSummary]
 * @property {boolean} [focusFirstInvalid]
 * @property {string} [wrapper]
 * @property {string} [invalidClass]
 * @property {string} [summaryHeading]
 * @property {string} [summaryHeadingClass]
 * @property {boolean} [nativeSubmit]
 */
