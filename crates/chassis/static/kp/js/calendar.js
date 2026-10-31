// A month heatmap: a month of days, each a plate in the colour of its state
// [scope-143].
//
// `section.kp-calendar[data-kp-calendar]` is filled by attachCalendars():
// the month's title between ‹ Prev and Next ›, Today, a line for the state,
// a `table[role=grid]` of six weeks, and a legend. The page gives the days
// (setCalendarDays), the state of the whole (setCalendarState) and the
// legend's entries (setCalendarLegend); the calendar paints them in place.
//
//   tones    `ok`, `warn` and `bad` as text on their own status plate,
//            `muted` (nothing to do), `future` and `before` dashed, `none`
//            (nothing known), and `loading` (a pulse, at rest under reduced
//            motion; `.kp-calendar--busy-days` puts a spinner in each
//            loading day instead, `.kp-calendar--busy-whole` one spinner
//            over the grid); a tone is never the only carrier, the day's
//            words say it too
//   grid     always six week rows, so the page does not jump from month to
//            month; the 42 cells are built once and updated in place, and
//            the neighbouring months' days show their numbers, quiet and
//            inert
//   keys     one tab stop: the arrows move a day or a week, Home and End go
//            to the week's ends, Page Up and Page Down change the month
//            (with Shift, the year), Enter and Space pick
//   today    the day it is in `timeZone` (Europe/Brussels by default, rule
//            52), whatever zone the reader's computer is in; an inner ring
//   picked   `td[aria-selected=true]`, an outer ring; `kp-calendar-pick`
//            fires with `{ date, source }`
//
//   <div class="kp-calendar-layout">
//       <section class="kp-calendar" data-kp-calendar data-kp-calendar-month="2026-10" aria-label="Nightly backups"></section>
//       <aside>…the page's own detail of the picked day…</aside>
//   </div>
//
// Calm tones [kpadopt6]: `data-kp-tones="calm"` swaps ok, warn and bad for `logged` (the theme's accent), `quiet` (nothing
// logged: lighter than muted, no border, no count, never "missed") and `paused` (`data-kp-paused-range="2026-10-03/2026-10-14"`,
// hatched), for a calendar that tracks a person and not a machine (js/calm-tones.js). A month with nothing logged keeps its six
// rows quiet under a centred plate; a month that could not be read is dimmed under one with Retry (`kp-calendar-retry`; every tone gets
// the plate, a standard calendar with the page's words or "Nothing to show." / "Could not be read." [r1r2-1019]);
// `data-kp-legend="hide"` leaves out the legend, `setCalendarCaption` writes a sentence under the grid.
//
// Every date a person reads is dd/mm/yyyy (rule 52); the machine's date is
// `YYYY-MM-DD`, the key of setCalendarDays() and of every event. The words
// are the dictionary's (`calendar…` in js/strings.js). Nothing runs on
// import; attachCalendars(root) returns a detach. `decorate` marks every
// control a calendar builds (`month-prev`, `month-next`, `today`, and each
// `day` whenever the month changes), with the shape every kp module's
// `decorate` takes.
//
// The module is a facade: a calendar is a `CalendarController` (closure-pattern B, js/controller.js) in `js/calendar/`, one file per concern.

export { CALENDAR, CALENDAR_PICK_EVENT, CALENDAR_MONTH_EVENT, CALENDAR_RETRY_EVENT } from './calendar/constants.js';
export { dayKey, formatDayKey, shiftDay, shiftMonth, monthCells } from './calendar/dates.js';
export {
    setCalendarDays,
    setCalendarState,
    calendarSelect,
    calendarMonth,
    setCalendarLegend,
    setCalendarCaption,
    attachCalendars,
} from './calendar/api.js';

/** @typedef {import('./calendar/constants.js').CalendarTone} CalendarTone */
/** @typedef {import('./calendar/constants.js').CalendarDay} CalendarDay */
/** @typedef {import('./calendar/constants.js').CalendarState} CalendarState */
/** @typedef {import('./calendar/constants.js').CalendarDecorateInfo} CalendarDecorateInfo */
/** @typedef {import('./calendar/constants.js').CalendarOptions} CalendarOptions */
/** @typedef {import('./strings.js').Strings} Strings */
