// Quiet hours: from, to, which days, and what still comes through [wish-1120, homelab 96; the dashboard's notification rules].
//
// One control for "do not push me between 22:00 and 07:00 on these days, except a critical notice". It is composed of the package's own
// parts, not new inputs: the switch, two time fields (js/timefield.js), the weekday picker (js/weekdays.js) and one tick per severity that
// may break the quiet; a line in words under them says what the whole thing means.
//
//   <div class="kp-quiet" data-kp-quiet data-kp-value='{"on":true,"from":"22:00","to":"07:00","days":[1,2,3,4,5],"through":["critical"]}'></div>
//
// The value is `{ on, from, to, days, through }`: `from` and `to` are `HH:MM` (a window across midnight, 22:00 to 07:00, belongs to the day
// it starts on), `days` the weekdays as `Date#getDay` counts them (0 is Sunday; all seven by default), `through` the severities that still
// come through, by key. While `on` is false the fields stay in place, dimmed and out of the tab order (`inert`), so the control keeps its
// size. `from` equal to `to` is refused with a line under the times (`valid: false` in the event).
//
// Options, as attributes on the root (read again when they change), each with a default [KT6]:
//
//   data-kp-value               the JSON above                                          off, 22:00 to 07:00, every day, critical comes through
//   data-kp-quiet-severities    `critical,warning,info,ok`, each also `key=Words`        the four, in the dictionary's words
//   data-kp-quiet-step          minutes for the time fields                             15
//   data-kp-quiet-label         the control's accessible name                           Quiet hours
//   data-kp-disabled            the sentence that says why it cannot be changed now      none
//   data-kp-state               `loading` shows the control's own bars in its place     ready
//
// `kp-quiet-change` `{ value, summary, valid }` is fired on the root when a person changes something (not for `setQuiet`). The page stores
// the value and tells the control back with setQuiet(el, value). `quietSummary(value)` is the line in words, on its own.
// Nothing runs on import; attachQuietHours(root) returns a detach.

import { attachAll, controllerOf } from './controller.js';
import { QuietHours } from './quiet-hours/controller.js';
import { DEFAULT, QUIET } from './quiet-hours/values.js';

export { QUIET, QUIET_EVENT, QUIET_SEVERITIES } from './quiet-hours/values.js';
export { readQuiet, quietSummary } from './quiet-hours/value.js';

/**
 * @typedef {object} QuietValue
 * @property {boolean} on quiet hours are on
 * @property {string} from `HH:MM`
 * @property {string} to `HH:MM`
 * @property {number[]} days 0 (Sunday) to 6
 * @property {string[]} through the severities that still come through
 */

/**
 * The value a control holds.
 * @param {Element} el
 * @returns {QuietValue | null}
 */
export function quietValue(el) {
    return controllerOf(el, QuietHours)?.handle.value() ?? null;
}

/**
 * Set the control from the page's stored value (no event).
 * @param {Element} el an attached `[data-kp-quiet]`
 * @param {Partial<QuietValue>} value
 */
export function setQuiet(el, value) {
    const handle = controllerOf(el, QuietHours)?.handle;
    handle?.set({ ...(handle.value() ?? DEFAULT), ...value });
}

/**
 * Build every quiet-hours control under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachQuietHours(root = document) {
    return attachAll(root, QUIET, QuietHours);
}
