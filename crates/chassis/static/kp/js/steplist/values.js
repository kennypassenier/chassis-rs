// The selector, the attribute, the event and the states of a step list.

/** The lists this module looks after. */
export const STEPLIST_SELECTOR = '.kp-steplist';
/** The attribute that names a step, for setStep(). */
export const STEP_ID_ATTRIBUTE = 'data-kp-step-id';
/** Fired on the list, bubbling, when a step changed state after attach: `{ item, id, state, previous }`. */
export const STEPLIST_EVENT = 'kp-steplist-step';
/** The states a step can be in. */
export const STEP_STATES = /** @type {const} */ (['pending', 'running', 'done', 'failed', 'skipped', 'current']);
/** How long a status region made just now waits before it speaks, in ms: one put in the page and written in the same breath is often not read. */
export const FRESH_REGION_DELAY = 100;
