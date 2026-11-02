// The selectors, attribute names and events of the popover form [ux-1101].

/** The wrapper: the button that opens the form, and the form. */
export const POPOVER_FORM = '[data-kp-popover-form]';
/** The form inside the wrapper: one or two fields and the accept button, on the menu's raised plate. */
export const POPOVER_FORM_PANEL = 'form.kp-popover-form__panel';
/** The line the form's problem is written in; made when the markup left it out. */
export const POPOVER_FORM_PROBLEM = '.kp-popover-form__problem';

/**
 * Fired on the wrapper, bubbling and cancelable, when the form is accepted (Enter or the accept button) and its fields are
 * valid: `detail` `{ value, values, form, opener, waitUntil(promise) }`. `value` is the first field's value, `values` every
 * named field's. Cancel it to keep the form open; hand `waitUntil` a promise and the form waits for it, busy, and closes when
 * it resolves or shows the rejection's message when it fails.
 */
export const POPOVER_FORM_ACCEPT_EVENT = 'kp-popover-form-accept';
/** Fired on the wrapper, bubbling, when the form opens. */
export const POPOVER_FORM_OPEN_EVENT = 'kp-popover-form-open';
/** Fired on the wrapper, bubbling, when it closes: `detail` `{ reason: 'accept' | 'escape' | 'outside' | 'toggle' | 'script' }`. */
export const POPOVER_FORM_CLOSE_EVENT = 'kp-popover-form-close';

/** Every field the first focus may land on, in order. */
export const FIELDS = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)';

/** @typedef {'accept' | 'escape' | 'outside' | 'toggle' | 'script'} CloseReason */
