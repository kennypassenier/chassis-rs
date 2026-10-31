// The range picker: a preset or a custom from–to [kpadopt4-ideas, Kenny 2026-10-16].
//
// The time window of a metrics page: the presets as the package's segmented
// control, and a Custom… button that opens a panel with two date pickers (the
// package's, dd/mm/yyyy) and two times (HH:MM, 24 hours), checked before Apply:
//
//   <div class="kp-range" data-kp-range="24h" data-kp-range-presets="1h 6h 24h 7d 30d" aria-label="Time range"></div>
//
// Under the control one line says exactly which window is chosen: "Last 24
// hours · 15/10/2026 14:05 – 16/10/2026 14:05", in Europe/Brussels unless
// `data-kp-time-zone` names another. Choosing a preset, or applying a custom
// range, fires `kp-range-change` with `{ preset, start, end, label }`: the
// preset's key or null, the two moments as ISO strings (UTC), and the line.
//
// A preset is a length back from now ("1h", "6h", "24h", "7d", "30d"; any
// number with m, h, d or w). The custom panel opens under the control, on
// the theme's own popover plate, with the window that is chosen filled in; it
// checks that both dates and times are whole, that the start comes first,
// that the end is not in the future (unless `data-kp-range-future`) and that
// the span is at most `data-kp-range-max-days` (none by default), says what is
// wrong under the fields and marks them, and holds Apply's result until it is
// right. Cancel, Escape or a press outside closes it and keeps the window as
// it was. The control is one tab stop with arrow keys for the presets, then
// Custom…; the panel takes the focus and gives it back.
//
// `data-kp-range-custom="off"` makes it a presets-only picker [combo-range-1019, N17]: the Custom… button and its panel
// (the two date pickers, the times, Apply) are not built at all, so they are not in the DOM or in the tab order, the
// window's name fills the line under the presets, and a custom window from the markup (`data-kp-range-start`, `-end`) or
// from `setRange(el, { start, end })` is ignored.
//
// `data-kp-range-disabled` turns everything off. setRange(el, …) sets the
// window from a script (without the event); rangeOf(el) reads it.
//
// Nothing runs on import; attachRanges(root, { now }) returns a detach.
//
// Each picker is one RangeController (js/range/controller.js over js/range/core.js, on js/controller.js); the parts are listed in js/README.md.

import { attachAll, controllerOf } from './controller.js';
import { RangeController } from './range/controller.js';
import { RANGE } from './range/values.js';

export { RANGE, RANGE_EVENT, RANGE_PRESETS, presetMs, rangeMoment, parseTime, rangeFaults } from './range/values.js';

/** @typedef {import('./range/core.js').RangeValue} RangeValue */

/**
 * The window a picker holds, as ISO strings.
 * @param {Element} el
 * @returns {{ preset: string | null, start: string, end: string } | null}
 */
export function rangeOf(el) {
    const st = controllerOf(el, RangeController);
    return st ? { preset: st.value.preset, start: new Date(st.value.start).toISOString(), end: new Date(st.value.end).toISOString() } : null;
}

/**
 * Set a picker's window from a script, without the event: a preset's key, or a start and an end (Date, ISO or ms).
 * @param {Element} el @param {{ preset?: string, start?: Date | string | number, end?: Date | string | number }} next
 */
export function setRange(el, next) {
    const st = controllerOf(el, RangeController);
    if (!st) return;
    const ms = (/** @type {Date | string | number | undefined} */ v) => (v === undefined ? NaN : new Date(v).getTime());
    if (next.preset) st.set({ preset: next.preset, start: 0, end: 0 }, false);
    else if (Number.isFinite(ms(next.start)) && Number.isFinite(ms(next.end))) st.set({ preset: null, start: ms(next.start), end: ms(next.end) }, false);
}

/**
 * Wire every range picker under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachRanges(root = document, options = {}) {
    return attachAll(root, RANGE, RangeController, options);
}
