// The countdown: a named timer in digits [kpadopt4-ideas, Kenny 2026-10-16].
//
// Kenny: "Ik wil ook een timer met getallen, apart" — next to the visual
// timer (js/timer-disc.js), one timer that counts down in digits, mm:ss or
// h:mm:ss, with Start, Pause, Reset and a minute more, and a gentle signal at
// the end:
//
//   <div class="kp-countdown" data-kp-countdown="25:00" data-kp-countdown-name="Tea"></div>
//
// The digits never move the layout: every digit stands in a cell one `ch`
// wide and the colons in their own, so 1:11 and 0:08 are as wide as each other
// whatever the theme's face, and only a digit that changes is written. The
// format follows the timer's length: h:mm:ss once it holds an hour or more,
// else mm:ss; it changes only when a press changes the length (a minute more
// past the hour), never while it runs. The time shown is rounded up, so the
// last second reads 0:01 and 0:00 is the end.
//
// The words beside the digits (Paused, Time is up) stand in a line that is
// always there; the Start button keeps one width for Start, Pause and Resume
// (the package's state word). At the end the plate breathes three times, under
// the flash threshold, and stands still under reduced motion; the line says
// "Time is up" and a status region says it to a screen reader, which hears the
// start, the pause and the end, not every second.
//
// Options, read again when the attribute changes (js/live-options.js) [gaps-time-1019]:
//   data-kp-countdown-until   "14:30" (the next 14:30 on this device's clock), a date and time ("2026-10-20T09:00") or epoch
//                             ms: the timer counts down to that moment instead of for a length; it starts at once and has no
//                             controls (a moment does not wait). A moment that has passed reads "Time is up".
//   data-kp-countdown-timezone "Europe/Brussels" (on the timer or an ancestor): the zone a "14:30" or a date and time without an
//                             offset is given in; a date and time with its own offset ("+02:00", "Z") is read in that one
//   data-kp-countdown-days="off"  keep digits past 24 hours ("167:59:59"); by default 24 hours or more is read with a days
//                             unit, "6 d 22 h" (under 24 hours nothing changes) [wish-1120, homelab 124]
//   data-kp-countdown-controls="none"  display only: no Start, +1 min or Reset is built (not in the tab order either); the
//                             page drives the clock with countdownOf(el).start() / .pause() / .reset()
//
// Events (bubbling, on the timer):
//   kp-countdown-change  { state, remaining, total }   started, paused, reset, a minute more
//   kp-countdown-end     { total }                      the time is up
//
// The clock reads `now()` (performance.now by default; attachCountdowns takes
// another, for a test), so a hidden tab or a slow frame never loses time: the
// time left is always the end moment minus now. countdownClock() is that
// clock on its own, and the visual timer runs on it too.
//
// Nothing runs on import; attachCountdowns(root) returns a detach.
//
// The module is a facade: a countdown is a `CountdownController` (closure-pattern B, js/controller.js) in `js/countdown/`, one file per concern.

export { COUNTDOWN, COUNTDOWN_EVENT, COUNTDOWN_END_EVENT, COUNTDOWN_STEP } from './countdown/constants.js';
export { parseDuration, formatCountdown } from './countdown/duration.js';
export { timerZone, untilOffset, untilZone } from './countdown/zones.js';
export { parseUntil, untilLabel } from './countdown/until.js';
export { countdownClock } from './countdown/clock.js';
export { timerButton } from './countdown/parts.js';
export { countdownOf, attachCountdowns } from './countdown/api.js';

/** @typedef {import('./countdown/constants.js').UntilZone} UntilZone */
/** @typedef {import('./countdown/constants.js').CountdownState} CountdownState */
/** @typedef {import('./countdown/constants.js').CountdownClock} CountdownClock */
