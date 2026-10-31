// The weekday picker: seven chips, or the days of a month [kpadopt5-time; homelab's `.sch-daypick`].
//
// A schedule says on which days it runs. The picker is the package's chip group (js/segmented.js, `multi`) with
// the three differences a day picker needs: all seven days is a real choice and none is a wrong one, so the group
// never collapses back to "All"; the week starts where the reader's week starts; and a line in words under the
// chips says what is picked ("Mon and Thu", "Every weekday").
//
//   <div class="kp-weekdays" data-kp-weekdays data-kp-value="1,4" aria-label="Run on"></div>
//
// `data-kp-days="month"` draws the days 1 to 31 and "Last" instead of the week, for a monthly schedule.
// A value is a list of numbers (0 is Sunday, as `Date#getDay` counts) or day names ("mon", "Monday"); in a month,
// the day numbers and `last`. The app's data stays its own: this module reads and writes `values` and nothing else.
//
// Options (markup attribute, then the option of attachWeekdays()), every one with a default [KT6]:
//   data-kp-days          week | month                                   week
//   data-kp-week-starts-on 0..6                                          from the locale (Monday for nl-BE, en-GB)
//   data-kp-day-names     short (Mon) | narrow (M)                       short
//   data-kp-min           the fewest days a schedule needs               1  (0 allows none)
//   data-kp-presets       weekdays,weekend,every | false                 all three, in a week
//   data-kp-summary       false hides the line in words                  shown
//   data-kp-value         the days at first, "1,4"                       none
//   data-kp-disabled      the whole group is off                         off
//   data-kp-disabled-reason the sentence that says why it is off         none (shown under the chips)
//
// Fires `kp-weekdays-change` on the element: `{ values, summary, valid }`. Below `min` the group says so in a line
// under it (`.kp-field__error`) and `aria-describedby` points at it; the value is still reported, so the app decides.
// Arrow keys move along the chips and Space or Enter turns one (the segmented control's own keys).
//
// Nothing runs on import; attachWeekdays(root) returns a detach.

import { attachAll, controllerOf } from './controller.js';
import { WeekdayPicker } from './weekdays/controller.js';
import { WEEKDAYS } from './weekdays/values.js';

export { WEEKDAYS, WEEKDAYS_EVENT, WEEKDAY_PRESETS } from './weekdays/values.js';
export { dayNumber, dayNames } from './weekdays/names.js';
export { joinWords, weekdaySummary, monthSummary } from './weekdays/summary.js';

/**
 * @typedef {object} WeekdaysHandle
 * @property {HTMLElement} element
 * @property {() => (number | 'last')[]} values the picked days, in day order
 * @property {(values: readonly (number | string)[]) => void} set replace the picked days (no event)
 * @property {() => string} summary the picked days in words
 * @property {() => boolean} valid whether at least `min` days are picked
 */

/**
 * The handle of an attached picker.
 * @param {Element} element
 * @returns {WeekdaysHandle | null}
 */
export function weekdays(element) {
    return controllerOf(element, WeekdayPicker)?.handle ?? null;
}

/**
 * The days a picker holds.
 * @param {Element} element
 * @returns {(number | 'last')[]}
 */
export function weekdaysOf(element) {
    return weekdays(element)?.values() ?? [];
}

/**
 * Set the days of a picker from a script, without the event.
 * @param {Element} element @param {readonly (number | string)[]} values
 */
export function setWeekdays(element, values) {
    weekdays(element)?.set(values);
}

/**
 * Wire every weekday picker under `root`.
 * @param {ParentNode} [root]
 * @param {{ locale?: string, weekStartsOn?: number }} [options] defaults; per picker `data-kp-week-starts-on`
 * @returns {() => void} detach
 */
export function attachWeekdays(root = document, options = {}) {
    return attachAll(root, WEEKDAYS, WeekdayPicker, options);
}
