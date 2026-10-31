// The selector, the event and the fixed numbers of the quantity control.

/** The controls this module looks after. */
export const QUANTITY = '[data-kp-quantity]';

/** Fired on the root when a person changed the value: `{ value, previous, source }`. */
export const QUANTITY_EVENT = 'kp-quantity-change';

/** The first repeat of a held button, then the pace it settles to [ms]. */
export const HOLD_DELAY = 450;
export const HOLD_SLOW = 160;
export const HOLD_FAST = 70;

/** How many repeats a held button makes at the slow pace before it goes fast. */
export const HOLD_SLOW_REPEATS = 6;
/** How many steps PageUp and PageDown move by. */
export const PAGE_STEPS = 10;
