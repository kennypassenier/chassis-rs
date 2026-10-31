// Registering the disc's custom property once, so a reset can fill the disc in the theme's own curve.

import { TIMER_DISC_LEFT } from './values.js';

/** Whether the property is registered. */
let registered = false;

/** Register the custom property; a second call, or a browser that cannot, does nothing. */
export function registerDiscProperty() {
    if (registered || typeof CSS === 'undefined' || typeof CSS.registerProperty !== 'function') return;
    registered = true;
    try {
        CSS.registerProperty({ name: TIMER_DISC_LEFT, syntax: '<number>', inherits: true, initialValue: '1' });
    } catch {
        // Registered before (a second copy of this module): the same registration stands.
    }
}

/** Whether a fill can be animated. */
export const isDiscPropertyRegistered = () => registered;
