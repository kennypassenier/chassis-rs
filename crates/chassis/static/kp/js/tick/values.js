// The marker, the knob, the default length and the event of a ticking number.

/** An element whose number ticks when its text changes. */
export const TICK = '[data-kp-tick]';
/** How long a tick takes, in ms. */
export const TICK_KNOB = '--kp-tick';
/** The default length of a tick, in ms. */
export const TICK_MS = 600;
/** Fired when a tick lands: `{ value }`. */
export const TICK_EVENT = 'kp-tick';
/** The most steps of the precision a tick draws: a bigger jump starts this far from its end. */
export const MAX_STEPS = 400;
/** NodeFilter.SHOW_TEXT: the text nodes a tree walker visits. */
export const SHOW_TEXT = 4;
/** The exponent of the ease-out curve of a tick. */
export const EASE_POWER = 3;
