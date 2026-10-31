// A choice where every option has a date and an age [kpadopt5-time; homelab's snapshot picker, JobTracker's version pickers].
//
// Choosing a snapshot, a backup or a version means choosing a moment: each option is two lines, a name (or its date) and
// how long ago it is, with a size or a kind in a column at the end, the newest first and labelled "Latest":
//
//   <div class="kp-dated" data-kp-dated aria-label="Snapshot to restore"></div>
//   setDatedOptions(el, [{ value: 'a1', when: '2026-10-15T04:00:00+02:00', meta: '4.1 GB' }, …]);
//
// An option is `{ value, label?, when?, meta?, disabled? }` (`when` is optional: an option without a date, a "latest" entry,
// shows its name alone, no age line and no gap where it would be): `label` is its name (the date, in rule 52, stands in when it
// has none), `when` the moment it was made (ISO, ms or Date: the component writes "3 days ago" and the date), `meta` a
// short text the page has formatted (a size from `formatBytes`, a count of files; a list of texts puts several side by side),
// `disabled` the sentence that says why
// it cannot be chosen now. Up to `data-kp-picker-inline-max` options (7) the options are radio rows, one group, the
// meta values in one column so they line up from row to row; with more, a searchable combobox whose list shows the same
// two lines, because a list longer than a screen is better searched. `data-kp-picker="radio"` or `"combobox"` forces one.
//
// Options (markup, then the option of attachDatedOptions()), each with a default [KT6]:
//   data-kp-picker            radio | combobox | auto                       auto
//   data-kp-picker-inline-max the longest list drawn as radio rows          7
//   data-kp-latest            first | none: the badge on the newest         first
//   data-kp-order             newest | oldest | given                       newest
//   data-kp-meta-column       "false" writes the meta under the name        a column
//   data-kp-preselect         "false" leaves the newest unchosen            the newest is chosen
//   data-kp-rows              the rows a state keeps the height of          4 (2 for a combobox)
//   data-kp-name              the radios' name, for a form                  the element's id
//   data-kp-value             the value to choose when the options arrive   the newest
//   data-kp-time-zone         an IANA zone                                  Europe/Brussels
//   data-kp-now               an ISO moment: a fixed clock for a demo or a test   the real clock
//
// Type a few letters on the radio rows and the first option whose name starts with them is chosen. A choice fires
// `kp-dated-change` with `{ value, option }`. States, in the height of the rows: loading is the busy card over
// placeholder rows, empty is the page's reason (and its action) centred at heading size in the package's empty plate,
// error is the alert with a Try again that fires `kp-dated-retry`. Nothing runs on import; attachDatedOptions(root)
// returns a detach.
//
// The module is a facade: a picker is a `DatedController` (closure-pattern B, js/controller.js) in `js/dated-options/`, one file per concern.

export { DATED, DATED_EVENT, DATED_RETRY_EVENT, DATED_STATES } from './dated-options/constants.js';
export { datedAge, orderDated } from './dated-options/time.js';
export { datedOptions, setDatedOptions, setDatedState, datedValue, attachDatedOptions } from './dated-options/api.js';

/** @typedef {import('./dated-options/constants.js').DatedOption} DatedOption */
/** @typedef {import('./dated-options/constants.js').DatedState} DatedState */
/** @typedef {import('./dated-options/constants.js').DatedStateOptions} DatedStateOptions */
/** @typedef {import('./dated-options/constants.js').DatedHandle} DatedHandle */
