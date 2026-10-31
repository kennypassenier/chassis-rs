// The letter keys of an availability grid: y, m, n and Backspace answer the focused cell.
import { getStrings } from '../strings.js';
import { registerShortcuts } from '../shortcuts.js';
import { allowed, editable } from './facts.js';
import { request } from './request.js';
/** @typedef {import('./types.js').AvailabilityAnswer} AvailabilityAnswer */

/** The grid cell that has the focus now, if any. */
const focused = () =>
    /** @type {HTMLElement | null} */ (
        document.activeElement instanceof HTMLElement ? document.activeElement.closest('.kp-availability__grid .kp-heat__cell[data-col-key]') : null
    );

/**
 * Register the answer keys of one grid.
 * @param {HTMLElement} el the availability root
 * @returns {() => void} stop
 */
export function registerAvailabilityKeys(el) {
    const s = getStrings();
    const ownFocused = () => {
        const c = focused();
        return c !== null && el.contains(c) && editable(el, c.getAttribute('data-row-key') ?? '', c.getAttribute('data-col-key') ?? '');
    };
    /** @param {AvailabilityAnswer | null} answer */
    const set = (answer) => () => {
        const c = focused();
        if (c) void request(el, c.getAttribute('data-row-key') ?? '', [c.getAttribute('data-col-key') ?? ''], answer);
    };
    /** @param {string} keys @param {string} what @param {AvailabilityAnswer | null} answer @param {() => boolean} [when] */
    const entry = (keys, what, answer, when = ownFocused) => ({
        keys,
        what,
        group: s.availabilityKeyGroup,
        when,
        reason: s.availabilityKeyReason,
        run: set(answer),
    });
    return registerShortcuts(
        el,
        [
            entry('y', s.availabilityKeyYes, 'yes'),
            entry('m', s.availabilityKeyMaybe, 'maybe', () => ownFocused() && allowed(el).includes('maybe')),
            entry('n', s.availabilityKeyNo, 'no'),
            entry('Backspace', s.availabilityKeyClear, null),
        ],
        { layoutGuard: 'off' },
    );
}
