// The toggle button: a button that stays pressed until it is pressed again [kpadopt6-ops; homelab's filter chips,
// segmented switches, pin and follow buttons, JobTracker's `Toggle` and `Seg`].
//
// Not a new control: the `.kp-button` (and the chip `.kp-segmented--chips` look) already drew `aria-pressed='true'`
// in twenty places, each with its own rule. This is the one rule family for it and the script that keeps it honest:
// it flips `aria-pressed`, keeps a group coherent, fires one cancelable event and answers an app that needs time.
//
//   <button class="kp-button" data-kp-toggle aria-pressed="false">Only errors</button>
//
//   <div role="group" aria-label="Level" data-kp-toggle-group="level" data-kp-toggle-mode="single-or-none" data-kp-toggle-clear>
//       <button class="kp-button" data-kp-toggle data-kp-toggle-all data-kp-look="chip">All</button>
//       <button class="kp-button" data-kp-toggle data-kp-look="chip" data-kp-count="12" data-kp-toggle-key="e">Error</button>
//   </div>
//
// The label never changes when the state changes (a pressed toggle keeps its name; changing the words as well reads as
// a different button). Words that change go in the hint under the label. Options, as attributes and as the second
// argument of attachToggles():
//
//   aria-pressed            `true`, `false` (default) or `mixed`: the platform attribute is the single source
//   data-kp-look            `button` (default), `chip` (a pill that wraps in a row) or `icon` (a square)
//   data-kp-count           an exact number beside the label ("Error 12", never "9+"), or `loading` (a skeleton, never "0")
//   data-kp-toggle-group    a name (members share it) or a container of the members
//   data-kp-toggle-mode     on the group: `multi` (default), `single` (one is always on) or `single-or-none`
//   data-kp-toggle-all      one member is the "All" chip: on when nothing else is, pressing it clears the rest
//   data-kp-toggle-value    the member's key in `pressedKeys` (default its id, else its label)
//   data-kp-toggle-key      a key that presses it, listed in the `?` sheet (never a digit: AZERTY's unshifted digits are & é ")
//   data-kp-toggle-async    the app answers the event with `detail.wait(promise)`: busy, rolled back, refusal on the button
//   data-kp-pressed-mark    `none` (default) or `check`: a tick beside the label while it is on, its room kept while it is off
//   data-kp-pressed-hint    a short line under the label while it is on (its row is always there, so nothing moves)
//   data-kp-toggle-clear    on the group: a "Clear filters (N)" button, in place whether or not anything is pressed
//   data-kp-announce        `state` (default), `all` (a changed count too) or `off`: one polite line per change
//   data-kp-remember        remembers the state (a group's keys) per device; off by default, most filters start clean
//   data-kp-disabled-reason a toggle that cannot be pressed says why (js/reason.js)
//
// `kp-toggle` is fired on the button before anything changes, bubbling and cancelable: `{ button, pressed, previous,
// group, pressedKeys, wait }`. Keys: Space and Enter (native); in a `single` group the arrow keys walk the buttons.
// Nothing runs on import.
//
// Each toggle is one ToggleControl controller (js/toggle/controller.js over handle.js and parts.js, on js/controller.js);
// the parts are listed in js/README.md.

import { attachAll, controllerOf } from './controller.js';
import { ToggleControl } from './toggle/controller.js';
import { TOGGLE } from './toggle/group.js';

export { TOGGLE, TOGGLE_EVENT, TOGGLE_CHANGED_EVENT, TOGGLE_LOOKS, TOGGLE_MODES, TOGGLE_REFUSED_MS, toggleKey, toggleGroup, togglePressedKeys } from './toggle/group.js';

/** @typedef {'true' | 'false' | 'mixed'} PressedState */

/**
 * @typedef {object} ToggleOptions
 * @property {number} [refusedMs] how long a refusal's word stays (default 3000)
 */

/**
 * @typedef {object} ToggleHandle
 * @property {HTMLElement} element
 * @property {() => PressedState} state
 * @property {(state: boolean | 'mixed', options?: { silent?: boolean }) => void} set set the state without the event; a group keeps its rules
 * @property {(count: number | 'loading' | null) => void} setCount the exact number beside the label, a skeleton, or none
 * @property {(text: string) => void} setHint the line under the label while it is on
 * @property {() => void} done an async answer: it went through
 * @property {(message?: string) => void} refuse an async answer: it was refused; the state goes back and the word shows
 */

/**
 * The handle of an attached toggle.
 * @param {Element} el
 * @returns {ToggleHandle | null}
 */
export function toggle(el) {
    return controllerOf(el, ToggleControl)?.handle ?? null;
}

/**
 * Give every toggle button under `root` its press, its group and its parts.
 *
 * @param {ParentNode} [root]
 * @param {ToggleOptions} [options]
 * @returns {() => void} detach
 */
export function attachToggles(root = document, options = {}) {
    return attachAll(root, TOGGLE, ToggleControl, options);
}
