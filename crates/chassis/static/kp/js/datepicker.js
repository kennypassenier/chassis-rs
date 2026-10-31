// Date picker, framework-free [TH43].
//
// The classic place where keyboard access dies. Two rules decide whether
// this is usable, and both are about not trapping anyone in the grid:
//
//   1. **Typing always works.** The text input is the control; the
//      calendar is an aid. Someone who knows the date types it and never
//      opens the grid, and someone using a screen reader is not forced
//      through 31 buttons to say "the fourth".
//   2. **The grid is a real grid.** Arrows move by day, PageUp/PageDown
//      by month, Home/End to the ends of the week, and exactly one day is
//      in the tab order at a time.
//
//   <div class="kp-datepicker" data-kp-datepicker data-kp-min="2026-01-01" data-kp-disabled-days="0,6">
//     <label class="kp-field__label" for="from">From</label>
//     <input class="kp-field__input" id="from" type="text" inputmode="numeric" data-kp-date-input />
//     <button type="button" data-kp-date-open aria-label="Open the calendar">📅</button>
//     <div class="kp-datepicker__panel" data-kp-date-panel hidden></div>
//   </div>
//
// The panel is built here rather than written by the server, and that is
// the one place this package departs from "the server writes the markup":
// a month grid is derived from a date, so writing it by hand would mean
// writing twelve of them and keeping them in step.
//
// ISO in the value attribute, the locale on screen. A consumer reads
// `input.dataset.kpDateValue` and gets `2026-09-04` whatever the display
// format is, because parsing a localised string on the server is how off-
// by-one-day bugs are born.
//
// Since 10.1.0 the numeric display is dd/mm/yyyy for every reader, whatever
// the locale (Kenny's rule 52: every date a kp component shows is
// dd/mm/yyyy); `data-kp-date-format="locale"` (or the `dateFormat` option)
// brings back the locale's own order. Month and weekday names, and the
// first day of the week, still follow the locale.
//
// Since 3.0.0 [KT6, D5]: the display format, the parsing order and the
// first day of the week come from the locale — the nearest `lang`, the
// browser's, or `data-kp-locale` — instead of being Dutch; the first
// version also set the placeholder hint from a string that nothing
// formatted by, so changing it made the hint lie. A minimum, a maximum
// and disabled weekdays exist; the date is settable through the handle;
// the day cells can be decorated; and the panel's glyphs are attributes.
//
// The module is a facade: the picker is `DatePickerController` (closure-pattern B, js/controller.js) in `js/datepicker/`, one file per concern.

export { DATE_EVENT, OPEN_EVENT, MONTH_EVENT } from './datepicker/constants.js';
export { toISO, formatLocalDate, toDutch, parseDate, yearBlockStart, clampToMonth, outsideRange, jumpMove } from './datepicker/dates.js';
export { placeDatePanel, raiseDatePanel, measureDateView } from './datepicker/place.js';
export { datePicker, attachDatePickers } from './datepicker/attach.js';

/** @typedef {import('./datepicker/constants.js').DateView} DateView */
/** @typedef {import('./datepicker/constants.js').DatePickerHandle} DatePickerHandle */
