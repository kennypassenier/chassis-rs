// A field for a time of day: 24 hours, typed, stepped or picked from a list [kpadopt6; homelab's Schedules "At" field].
//
//   <div class="kp-time" data-kp-time data-kp-name="at" data-kp-value="03:00" data-kp-label="At"></div>
//
// The native `<input type="time">` follows the system's locale (12 hours with AM and PM on an English machine, which
// breaks rule 52), cannot be themed and has no step keys of its own. This is the package's own field: a text box that
// reads what a person types, a button that opens a list of times, and a hidden input that posts `HH:MM` unchanged.
// Kenny, 2026-10-17 ("Ons eigen veld met een lijst van tijden"): on a phone too the list is the package's own, a sheet
// at the foot of the screen, not the phone's wheel.
//
// Typing is forgiving and fixed: `0230`, `2:30`, `02.30`, `2h30` and `230` give 02:30, `7` gives 07:00, `24:00` is
// refused; pasting `2:30 PM` is converted to 14:30 and the field says so, politely, because the person wrote 12 hours.
// Anything else keeps what was typed and says "Use a time like 03:00" (an invalid text is never dropped silently).
// Keys, in the field only (no page key is claimed): Up and Down step by `data-kp-time-step`, with Shift or Page Up and
// Page Down by an hour; Enter and Escape; Alt+Down opens the list. A time of day wraps (23:55 up is 00:00) and says so.
//
// Options (attributes on the root, each also a key of `setTime`):
//   data-kp-value / data-kp-name / data-kp-label / data-kp-time-id   the value, the posted name, the accessible name, the input's id
//   data-kp-time-step        minutes for the keys and the list: 1, 5 (default), 10, 15, 30 or 60; typing allows any minute
//   data-kp-time-min / -max  a window; a min later than the max wraps midnight ("22:00 to 06:00")
//   data-kp-time-seconds     present: HH:MM:SS (nothing in the projects needs it)
//   data-kp-time-popup       `list` (default) or `none` (typing and keys only)
//   data-kp-time-presets     `03:00,Morning=08:00`: chips above the list, the app's own words
//   data-kp-time-now         present: a "Now" entry (for logging, not for schedules)
//   data-kp-time-zone        an IANA name: a quiet line says whose clock it is
//   data-kp-time-look        `field` (default) or `inline` (the underline form inside a sentence)
//   data-kp-time-clear       present: an explicit "no time"
//   data-kp-time-required    present: empty is invalid, with the line
//   data-kp-time-near        `03:00,12:00`: entries within `data-kp-time-near-width` minutes (60) of these get a mark
//   data-kp-disabled-reason  with `disabled` (or `data-kp-disabled`): why it cannot be used now
//   data-kp-state            `loading` shows the field's own skeleton at its final width
//   data-kp-remember         a name: the last chosen time is kept (off by default)
//
// Events (bubbling, on the root): `kp-time-change` `{ value, text, converted }`, `kp-time-retry` (the Retry of presets that
// could not load). Presets arrive with `setTimePresets(root, list | 'loading' | 'error')`. Every word is in js/strings.js;
// nothing runs on import.
//
// The module is a facade: a field is a `TimeController` over a built `TimeField` (closure-pattern B, js/controller.js) in `js/timefield/`, one file per concern.

export { TIME, TIME_EVENT, TIME_RETRY_EVENT, TIME_STEPS } from './timefield/constants.js';
export { parseTimeOfDay, timeMinutes, timeText, stepTime, timeInWindow } from './timefield/parse.js';
export { setTime, timeValue, timeValid, setTimePresets, attachTimes } from './timefield/api.js';

/** @typedef {import('./timefield/constants.js').TimePreset} TimePreset */
