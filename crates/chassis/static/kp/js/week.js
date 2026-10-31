// A week agenda: seven day columns, the items of the week placed in time
// [kpadopt-time; the admin dashboard's `sch-week` and `sch-pill`].
//
// `section.kp-week[data-kp-week]` is filled by attachWeeks(): optionally a
// row of week buttons (`data-kp-week-nav`), the head of each day, an hour
// axis, and one column per day in which every item is a pill placed at its
// time of day. The page gives the items (setWeekEvents) and the state of the
// whole (setWeekState); the agenda paints them in place.
//
//   <section class="kp-week" data-kp-week data-kp-week-start="2026-10-16"
//            aria-label="Runs in the next 7 days"></section>
//
//   setWeekEvents(el, [
//       { id: 'backup', start: '2026-10-17T02:00:00+02:00', label: 'Backup photos', series: 1, detail: 'nightly, keeps 14' },
//       { id: 'host',   start: '2026-10-17T03:30:00+02:00', label: 'Host round',    state: 'reference' },
//   ]);
//
//   start    the day the week begins on, `YYYY-MM-DD` (`data-kp-week-start`,
//            else today in `data-kp-time-zone`, Europe/Brussels by default);
//            `data-kp-week-days` is how many columns (7)
//   series   1 to 5: the pill's colour, from `--chart-1` to `--chart-5`; the
//            colour never carries the meaning alone, the label does
//   state    `next` (a ring), `off` and `skipped` (muted, struck through),
//            `reference` (dashed, not a button: the host's own round);
//            `data-kp-week-off="hide"` leaves the `off` items out of the week
//            (default `show`: drawn muted and struck through), read again when
//            it changes [homelab gap 43]
//   crowd    a column holds as many pills as its height fits at one pill's
//            height; what does not fit is folded into a `+N` menu button at
//            the end of the stack, and its menu lists them. The page never
//            grows and no pill sits on another
//   narrow   below the agenda's own width of 40rem (a container query) the
//            seven columns become seven rows: the day on the left, its items
//            in time order on the right, every item shown, no `+N`
//   now      a line across today's column (`aria-label` "now, 14:32"),
//            moved every 30 s; items already past are muted
//   keys     one tab stop: ↑ ↓ move within a day, ← → to the neighbouring day
//            (the item nearest in time), Home and End to the day's first and
//            last, Enter or Space opens; Tab leaves the agenda
//   hover    the item's `detail` (else its name and time) in the page's one
//            hover card (js/hovercard.js)
//   loading  the days stay empty and the data table's busy panel (the
//            theme's spinner and "Reading the week") stands centred over
//            them, arriving and leaving as the busy table's does
//   upcoming opt-in, `data-kp-week-upcoming="8"` [kpadopt3]: below 40rem the
//            agenda lists the next 8 items instead of its day rows, the way
//            a phone reads a schedule: one row per item, its day on the left
//            on one line (named once for a run of the same day, Today for
//            today), the item's own pill on
//            the right. "Next" is from now within the range shown, and an
//            item that is off, skipped or only there for reference is not
//            one; an item that passes leaves the list on the next tick. The
//            same pills, keys (↑ ↓ Home End), hover card, events, loading
//            card and arrivals as the rows; `data-kp-week-upcoming-label`
//            names the list for a screen reader, `data-kp-week-upcoming-empty`
//            is its sentence when nothing is still to come (else the
//            dictionary's weekEmpty). Wider, the week is the week
//
// Events (bubbling, on the agenda):
//   kp-week-open    { id, event, source: 'pointer' | 'keyboard' }  an item was opened
//   kp-week-range   { start: 'YYYY-MM-DD', source: 'nav' }         a week button moved the range; give the new items
//
// Every date a person reads is dd/mm (the year in the day's name, rule 52);
// the machine's day is `YYYY-MM-DD`. Every word is in the dictionary (`week…`
// in js/strings.js). Nothing runs on import; attachWeeks(root) returns a
// detach. `decorate` marks every control the agenda builds (`pill`, `more`,
// `prev`, `next`, `today`), the shape every kp module's `decorate` takes.

export { WEEK, WEEK_OPEN_EVENT, WEEK_RANGE_EVENT, WEEK_TICK_MS, WEEK_RETRY_EVENT } from './week/constants.js';
export { stackPills, pillCapacity } from './week/pills.js';
export { attachWeeks } from './week/attach.js';
export { setWeekEvents, setWeekState, setWeekStart, setWeekLegend } from './week/api.js';

/** @typedef {import('./week/types.js').WeekEventState} WeekEventState */
/** @typedef {import('./week/types.js').WeekEvent} WeekEvent */
/** @typedef {import('./week/types.js').WeekState} WeekState */
/** @typedef {import('./week/types.js').Strings} Strings */
/** @typedef {import('./week/types.js').WeekDecorateInfo} WeekDecorateInfo */
/** @typedef {import('./week/types.js').WeekOptions} WeekOptions */
/** @typedef {import('./week/types.js').WeekItem} WeekItem */
/** @typedef {import('./week/types.js').WeekDay} WeekDay */
/** @typedef {import('./week/types.js').WeekModel} WeekModel */
