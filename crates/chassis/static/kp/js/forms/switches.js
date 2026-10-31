// The two words of a switch: the On and Off beside the track come from the dictionary, not from the server [gap-11, KT5].

import { getStrings } from '../strings.js';
import { SWITCH, SWITCH_STATE } from './constants.js';

/**
 * Give every switch under `root` its two words [gap-11, KT5].
 *
 * The switch itself needs no script — it is a checkbox, and Space flips
 * it natively. What a server cannot write is the dictionary: the On and
 * Off beside the track come from `js/strings.js`, so a consumer's
 * `setStrings()` (or `strings` here) reaches them like every other word.
 * A state element that already has content is left alone — a server that
 * wrote its own words has decided. The stylesheet shows the word that
 * applies; nothing here listens to the checkbox.
 *
 *   <label class="kp-switch">
 *     <input class="kp-switch__input" type="checkbox" role="switch" />
 *     <span class="kp-switch__state" aria-hidden="true"></span>
 *     <span>Night alarms</span>
 *   </label>
 *
 * @param {ParentNode} [root]
 * @param {{ strings?: Partial<import('../strings.js').Strings> }} [options]
 * @returns {() => void} detach: removes the words this call put in
 */
export function attachSwitches(root = document, { strings } = {}) {
    const s = { ...getStrings(), ...strings };
    /** @type {HTMLElement[]} */
    const filled = [];
    for (const state of root.querySelectorAll(`${SWITCH} ${SWITCH_STATE}`)) {
        // `data-kp-switch-state="none"` is a switch without a state word: nothing is written and the track is not kept.
        if (!(state instanceof HTMLElement) || state.childNodes.length > 0 || state.closest(SWITCH)?.getAttribute('data-kp-switch-state') === 'none') continue;
        const on = document.createElement('span');
        on.className = 'kp-switch__on';
        on.textContent = s.switchOn;
        const off = document.createElement('span');
        off.className = 'kp-switch__off';
        off.textContent = s.switchOff;
        state.append(on, off);
        filled.push(state);
    }
    return () => {
        for (const state of filled) state.replaceChildren();
    };
}
