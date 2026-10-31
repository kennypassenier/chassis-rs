// The selector, the four states and the events of a card in four data states.

/** The cards this module looks after. */
export const CARD_STATE = '.kp-card[data-kp-state]';
/** The four states, in the order a read goes through them. */
export const CARD_STATES = /** @type {const} */ (['loading', 'empty', 'error', 'ready']);
/** Fired on the card, bubbling, when its state changed after attach: `{ card, state, previous }`. */
export const CARD_STATE_EVENT = 'kp-card-state';
/** Fired on the card, bubbling, when its Try again is pressed: `{ card }`. */
export const CARD_RETRY_EVENT = 'kp-card-retry';
