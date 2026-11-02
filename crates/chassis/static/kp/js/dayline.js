// The day timeline [parts-1102; the Habits todo app's Today timeline, its time blocking]: one day from top to bottom, from the
// day's start hour down to the same hour the next morning, the page's items as blocks as long as they take.
//
//   <section class="kp-dayline" data-kp-dayline data-kp-start-hour="6" data-kp-step="15" aria-label="Today"></section>
//
//   setDaylineItems(el, [
//       { id: 't1', label: 'Write the report', start: '09:00', minutes: 90, tone: 'warning' },
//       { id: 'e1', label: 'Dentist', start: '10:00', minutes: 45, readonly: true, tone: 'muted' },
//   ], { allDay: [{ id: 'e2', label: 'Mum’s birthday', readonly: true }] });
//
// What it draws: the hours down the side; one row per step; each item a block on its rows (`minutes`, drawn at least 30 minutes so
// its words fit), with its time ("09:00–10:30") over its label, and a ⠿ handle; items that overlap share the width in lanes; a now
// line with its time, on the clock (the `now` option, or `data-kp-dayline-now="HH:MM"` for a frozen page), moved every minute;
// the box scrolled once so the now line stands a quarter from the top. A read-only item (`readonly: true`, the muted tone by
// default) is dashed and quiet, has no handle (its column kept, so the words line up) and no press, and takes a lane like any
// other, so a clash with a task shows. `done: true` strikes the label through. `tone` is a status colour by name or a categorical
// colour 1 to 12 (`--kp-cat-N`). Items with `allDay: true` or no start, and the `allDay` list, stand in a strip above the hours;
// the strip takes no room while the page gives none.
//
// Moves: drag the handle up or down, or ↑ / ↓ on it (Shift: an hour), in steps of `data-kp-step`; Escape puts it back, Enter
// ends a keyboard walk at once (else it ends when the keys rest). Every step is said in the status line. A finished move fires
// `kp-dayline-change { id, start, from, source }` and the block keeps its new place; the page saves and may call
// setDaylineItems again. A press on a block's body fires `kp-dayline-open { id, source }`.
//
// Drop from a list beside it: an element marked `data-kp-dayline-source="<id>"` (optionally `data-kp-dayline-for="<day id>"`) is
// made draggable; held over the hours, a marker says "Starts 14:30"; dropped, `kp-dayline-drop { id, start }` fires. A drag is a
// mouse's only: a keyboard or a finger needs the page's own "Set a time".
//
// Options, as attributes (each read again when it changes):
//   data-kp-start-hour      0 to 23 (default 0)
//   data-kp-step            minutes per row and per move, a divisor of 60 from 5 (default 15)
//   data-kp-dayline-hours   hours shown from the start (default 24)
//   data-kp-dayline-now     a frozen clock, HH:MM
// Knobs: --kp-dayline-hour (the height of an hour, 4.5rem; 6rem under a coarse pointer), --kp-dayline-height (the box),
// --kp-dayline-gutter (the hours' column).
//
// States (a timeline loads with the busy card): setDaylineState(el, 'loading'); an empty day (no timed item) shows the package's
// empty plate by itself, or setDaylineState(el, 'empty', title, { text }); setDaylineState(el, 'error', title, { text }) with
// Try again (`kp-dayline-retry`); 'ready' takes them away.
//
// Nothing runs on import; attachDaylines(root, { now }) returns a detach. Words are in the dictionary (`dayline…`).

import { attachAll, attachOne, controllerOf } from './controller.js';
import { DAYLINE } from './dayline/constants.js';
import { DaylineControl } from './dayline/controller.js';

export { DAYLINE, DAYLINE_CHANGE_EVENT, DAYLINE_DROP_EVENT, DAYLINE_OPEN_EVENT, DAYLINE_RETRY_EVENT } from './dayline/constants.js';

/** @typedef {import('./dayline/constants.js').DaylineItem} DaylineItem */
/** @typedef {import('./dayline/constants.js').DaylineState} DaylineState */

/**
 * Wire every day timeline under `root` (the root itself included). Idempotent.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options] `now`, the clock in epoch milliseconds (`Date.now` by default)
 * @returns {() => void} detach
 */
export function attachDaylines(root = document, options = {}) {
    return attachAll(root, DAYLINE, DaylineControl, options);
}

/**
 * Give a day timeline its items (wired first when it is not yet).
 * @param {Element} el
 * @param {readonly DaylineItem[]} items
 * @param {{ allDay?: readonly DaylineItem[] }} [options] the all-day strip's items
 */
export function setDaylineItems(el, items, { allDay } = {}) {
    const c = controllerOf(el, DaylineControl) ?? attachOne(/** @type {HTMLElement} */ (el), DaylineControl);
    c?.setItems(items, allDay);
}

/**
 * The day as a whole: `loading` (the busy card over the hours), `ready`, `empty` (the plate, `title` its heading) or `error` (the
 * plate with Try again, `title` and `text` the words).
 * @param {Element} el
 * @param {DaylineState} state
 * @param {string} [title]
 * @param {{ text?: string }} [options]
 */
export function setDaylineState(el, state, title = '', { text = '' } = {}) {
    const c = controllerOf(el, DaylineControl) ?? attachOne(/** @type {HTMLElement} */ (el), DaylineControl);
    c?.setState(state, title, text);
}
