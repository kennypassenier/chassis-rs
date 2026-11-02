// Coupled wheels [parts-1102; Kitchen 15: the side dish turns with the main course]: `data-kp-wheel-follows="<id>"` on a wheel
// makes it follow the wheel with that id. When the leader starts a spin the follower starts one too, over its own choices and
// by its own weights, and turns for exactly the leader's time, so the two settle together; it keeps its own outcome, its own
// answer card and its own `kp-wheel-spin` and `kp-wheel-result`. Its own Spin still turns it alone. A follower that cannot
// spin (fewer than two choices, loading, failed, already turning) stays where it is. Read at every spin, so the attribute
// may be set, changed or removed at any time; a chain (C follows B follows A) turns all three, and a ring stops at the wheel
// that is already turning.

import { WHEEL_SPIN_EVENT } from './state.js';
import { spinWheel } from './spin.js';

/** The attribute that names the leader. */
export const WHEEL_FOLLOWS = 'data-kp-wheel-follows';

/**
 * Listen, on the follower's document, for its leader's spin.
 * @param {HTMLElement} follower
 * @returns {() => void} stop listening
 */
export function followLeader(follower) {
    const doc = follower.ownerDocument;
    /** @param {Event} event */
    const onSpin = (event) => {
        const leader = event.target;
        const id = follower.getAttribute(WHEEL_FOLLOWS)?.trim();
        if (!id || !(leader instanceof HTMLElement) || leader === follower || leader.id !== id || !follower.isConnected) return;
        const { duration } = /** @type {CustomEvent<{ duration?: number }>} */ (event).detail ?? {};
        void spinWheel(follower, { duration });
    };
    doc.addEventListener(WHEEL_SPIN_EVENT, onSpin);
    return () => doc.removeEventListener(WHEEL_SPIN_EVENT, onSpin);
}
