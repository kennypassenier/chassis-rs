// Who can come: people in the rows, days or periods in the columns [kpadopt6; kp-soft's trip "Datums" tab].
//
// The package's heat grid (js/heat.js) turned into something a person edits: each person sets their own row, a press on
// a cell cycles empty, can, maybe, cannot, and the column everyone can lights up. The grid drawing, the arrow keys, the
// summary row that fills from the bottom, the hover card and the busy card are heat's own; this module adds the three-way
// answer, the "who may change which row" rule, painting a stroke, the best column and the states around it.
//
//   <div class="kp-availability" data-kp-availability data-kp-availability-choose aria-label="Who can come"></div>
//
//   setAvailability(el, {
//       unit: 'range',
//       columns: [{ key: 'jun21', label: 'Sat 21/6', sub: '21 to 23 June' }, …],
//       people: [{ id: 'kenny', name: 'Kenny', mine: true }, { id: 'tom', name: 'Tom' }],
//       answers: { kenny: { jun21: 'yes' }, tom: { jun21: 'no' } },
//   });
//   el.addEventListener('kp-availability-change', (e) => e.detail.settle(api.save(e.detail)));
//
// Kenny, 2026-10-17 ("Allebei, met een schakelaar per reis"): a trip is asked per period (the proposed date ranges, as
// kp-soft has them) or per day, and the organiser switches it per trip. The spec may carry both sets,
// `sets: { range: { columns, answers }, day: { columns, answers } }` with `canSwitchUnit: true`; a segmented switch above
// the grid then fires `kp-availability-unit` and the grid shows the chosen set. A plain `columns` / `answers` pair is a
// single set. `availabilityDays()` and `availabilityRange()` write the column labels in rule 52 (Europe/Brussels).
//
// Options (attributes on the root, each also a key of the spec):
//   data-kp-heat-edit                   `own` (default: a person changes only their own row), `all`, `off`
//   data-kp-availability-answers        `3` (can, maybe, cannot; default) or `2`
//   data-kp-availability-press          `menu` (default: a press opens the answers) or `cycle` (a press steps through them)
//   data-kp-availability-paint          on by default; `false` turns the drag across a row off
//   data-kp-availability-best           `most` (default), `everyone` or `none`
//   data-kp-availability-best-rule      `yes-count` (default) or `no-nobody`: which comes first when columns tie
//   data-kp-availability-window         a number of days: in day mode the best stretch of that many days is marked
//   data-kp-availability-quorum         how many must answer a column before it can be best (default everybody)
//   data-kp-availability-sort           `mine-first` (default), `given`, `answered-first`
//   data-kp-availability-summary        `both` (default), `count` or `bar`
//   data-kp-availability-choose         present: the best column offers "Choose these dates" (`kp-availability-choose`)
//   data-kp-availability-locked         column keys nobody can change any more
//   data-kp-availability-narrow         `scroll` (default) or `by-column` (a list per column on a phone)
//   data-kp-availability-keys           `false` turns the keys off (y, m, n, Backspace on the focused own cell)
//   data-kp-availability-undo-ms        Undo after a stroke (6000, 0 for none)
//   data-kp-availability-unit-switch    `on` or `off`: the organiser's periods/days switch, overriding `canSwitchUnit` of the spec (absent: the spec decides)
//   data-kp-availability-density                     `comfortable` (default) or `compact`
//   data-kp-time-zone                   the zone the day labels are written in (Europe/Brussels)
//   data-kp-disabled-reason             present with `disabled`: every cell is inert and says why
//
// Events (bubbling, on the root): `kp-availability-change` `{ person, keys, answer, previous, answers, settle }`
// (cancelable; `settle(promise)` holds the pressed cells on their spinner, a rejection or `false` puts them back and
// marks them refused for 3000 ms), `kp-availability-choose` `{ keys }`, `kp-availability-unit` `{ unit }`,
// `kp-availability-retry`. Every word is in js/strings.js; nothing runs on import.

export {
    AVAILABILITY,
    AVAILABILITY_EVENT,
    AVAILABILITY_CHOOSE_EVENT,
    AVAILABILITY_UNIT_EVENT,
    AVAILABILITY_RETRY_EVENT,
    AVAILABILITY_ANSWERS,
    AVAILABILITY_REFUSED_MS,
    AVAILABILITY_UNDO_MS,
} from './availability/constants.js';
export { availabilityDays, availabilityRange } from './availability/dates.js';
export { availabilityBest } from './availability/facts.js';
export { setAvailability, availabilityAnswers, setAvailabilityAnswer } from './availability/api.js';
export { attachAvailability } from './availability/attach.js';

/** @typedef {import('./availability/types.js').AvailabilityAnswer} AvailabilityAnswer */
/** @typedef {import('./availability/types.js').AvailabilityColumn} AvailabilityColumn */
/** @typedef {import('./availability/types.js').AvailabilityPerson} AvailabilityPerson */
/** @typedef {import('./availability/types.js').AvailabilityAnswers} AvailabilityAnswers */
/** @typedef {import('./availability/types.js').AvailabilitySet} AvailabilitySet */
/** @typedef {import('./availability/types.js').AvailabilitySpec} AvailabilitySpec */
/** @typedef {import('./availability/types.js').AvState} AvState */
