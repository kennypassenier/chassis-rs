// The visual timer: the time left as a shrinking disc [kpadopt4-ideas, Kenny 2026-10-16].
//
// The Time Timer's idea: no numbers ticking, only a coloured disc that grows
// smaller as the time goes, so the time left is seen at a glance and nothing
// on the page flickers.
//
//   <div class="kp-timer-disc" data-kp-timer-disc="25m" data-kp-timer-disc-name="Focus"></div>
//
// The disc starts full (the whole set time) and its edge turns back towards
// twelve o'clock as the time goes; with `data-kp-timer-disc-scale="60"` the face
// is a 60-minute dial instead, the classic Time Timer, and 25 minutes is a
// sector of 150°. Twelve marks stand round the rim, nothing else is written on
// the face. Under it: the timer's name and its length ("Focus · 25 min",
// still), one line for "Paused" or "Time is up", and Start, Pause and Reset
// as the package's buttons (Start keeps one width for its three words).
//
// The disc is drawn by one number, `--kp-timer-disc-left` (1 full, 0 gone),
// written only when the edge has moved a tenth of a degree, so a 25-minute
// timer writes a few times a second and a page does nothing else. Reset fills
// the disc again in the theme's own time and curve (--fx-duration, --fx-ease).
// Under reduced motion the disc steps once a minute (once every second under
// a minute) and nothing glides or breathes.
//
// At the end the face breathes three times, slowly, under the flash
// threshold, and stands still under reduced motion; the line says "Time is up"
// and a status region says it. A screen reader hears the time left in whole
// minutes on the face (role="img"), and the start, the pause and the end.
//
// Options, read again when the attribute changes (js/live-options.js) [gaps-time-1019]:
//   data-kp-timer-disc-until   "14:30" (the next 14:30 on this device's clock), a date and time or epoch ms: the disc counts
//                              down to that moment, starts at once and has no controls (a moment does not wait); the line
//                              under it reads "until 14:30"
//   data-kp-timer-disc-timezone "Europe/Brussels" (on the disc or an ancestor): the zone "14:30" and the caption are in; a date and
//                              time with its own offset ("+02:00", "Z") is read and written in that offset. Without either,
//                              this device's clock
//   data-kp-timer-disc-controls="none"  display only: no Start, Pause or Reset is built (left out of the tab order too); the
//                              page drives the clock with timerDiscOf(el).start() / .pause() / .reset(seconds). The caption
//                              follows the clock, so a reset(seconds) from the page changes "Focus · 25 min" too
//
// Events: the countdown's, `kp-countdown-change` and `kp-countdown-end` (the
// clock is js/countdown.js's countdownClock).
//
// Nothing runs on import; attachTimerDiscs(root) returns a detach.

import { attachAll, controllerOf } from './controller.js';
import { registerDiscProperty } from './timer-disc/register.js';
import { TimerDisc } from './timer-disc/controller.js';
import { TIMER_DISC } from './timer-disc/values.js';

export { TIMER_DISC, TIMER_DISC_LEFT } from './timer-disc/values.js';
export { discShare } from './timer-disc/share.js';

/** The clock of an attached visual timer, to drive it from a script. @param {Element} el */
export const timerDiscOf = (el) => controllerOf(el, TimerDisc)?.clock ?? null;

/**
 * Wire every visual timer under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number, wall?: () => number }} [options] `now` is the clock's (performance.now), `wall` the device's
 *   date and time (Date.now), which an `until` option is counted against
 * @returns {() => void} detach
 */
export function attachTimerDiscs(root = document, options = {}) {
    registerDiscProperty();
    return attachAll(root, TIMER_DISC, TimerDisc, options);
}
