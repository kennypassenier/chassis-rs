// A picker with the usual on top [kpadopt6; Life's daily check-in: symptoms, triggers, strategies, meals].
//
// It extends the combobox (js/combobox.js): the same input, listbox, matcher, status line and tag mode, with an opt-in band of
// the choices a person uses most standing first, the rest alphabetical below, and a guard against a near-duplicate when a new
// name is typed. The band is given by the application and changes slowly (a list that reorders on every use is slower and
// disliked: Sears and Shneiderman 1994, Findlater and McGrenere 2004); it is never re-sorted per tap.
//
//   <div class="kp-combobox kp-usual" data-kp-combobox data-kp-usual='["headache","fatigue"]' data-kp-add="inline">
//       <input class="kp-combobox__input" type="text" role="combobox" aria-expanded="false" aria-controls="sym-list" aria-label="Symptom" />
//       <ul class="kp-combobox__list" id="sym-list" role="listbox" hidden>
//           <li class="kp-combobox__option" role="option" data-kp-option data-value="headache">Headache</li> …
//       </ul>
//       <p class="kp-combobox__status" data-kp-combobox-status role="status" aria-live="polite"></p>
//   </div>
//
// Every option is a markup attribute and a field of the handle, and changing one at run time redraws the picker (KT6):
//   data-kp-usual              the values of the band: a comma list, a JSON array, or JSON `{ value, uses }` with the source `counts`
//   data-kp-usual-source       given | counts                           given (the app owns the weekly recompute; counts ranks by uses)
//   data-kp-usual-max          1 to 7                                   5
//   data-kp-usual-label        the band's heading                       "Usual"
//   data-kp-usual-while-typing first | hide                             first (matching usual items still lead while typing)
//   data-kp-order              alphabetical | given                     alphabetical (the full list under the band)
//   data-kp-pinned             JSON [{ value, label }]                  none ("Nothing to log", "Not sure" stand first, never usual)
//   data-kp-all                open | fold                              fold when the list has more than 12 items, else open ("Show all 38")
//   data-kp-multiple           present                                  absent (the combobox's tag mode: symptoms, meals)
//   data-kp-preselect          none | usual                             none (a stock picker never answers for a person)
//   data-kp-not-today          rows | chips | off                       absent = off; present without a value = rows (see "Not today")
//   data-kp-add                off | inline                             off
//   data-kp-usual-undo         field | toast                            field (the Undo after an add: a line under the field, or a toast)
//   data-kp-near               ask | select | off                       ask
//   data-kp-near-threshold     0.5 to 1                                 0.8
//   data-kp-near-max           1 to 5                                   3
//   data-kp-remember           a name                                   the folded or open list is remembered per picker
//   data-kp-hint               "Last time you wrote: ..."               the line the app gives, under the input once something is chosen
//   data-kp-state              loading | empty | error | ready          ready (empty when there are no items)
//   data-kp-undo-ms            the Undo window after an add             6000
//
// Typing a name identical to an existing one after case, accents and spaces are ignored selects the existing item (it cannot
// create a duplicate); its tag lights up, and a name already picked says so in the list ("Headache is already picked") and
// lights its tag instead of doing nothing. A near one ("hoofdpjn", also "Fatigu", the start of a name) puts up to `near-max`
// "Did you mean Hoofdpijn?" rows FIRST in the list, the plain row of that item folded into it, and always "Add 'hoofdpjn' as
// new" last, which always works. Enter on a near name: `ask` lights the first "Did you mean" row (a second Enter takes it),
// `select` takes the closest at once, `off` adds the name as typed. Nothing typed is ever answered by silence (Kenny,
// 2026-10-18 21:37: "Ik zie hem niet take closest pakken of vragen naar een name ... waar zou ik het moeten zien?").
//
// "Not today" [kpadopt6; redesigned after Kenny, 2026-10-18 21:37: a pill inside the tag "lijkt me niet wenselijk", and "wat
// is de bedoeling van die not today pill?"]. A usual choice is something logged nearly every day, so "it did not happen today"
// is an answer of its own, different from "not filled in yet". The tags stay one pill each (name and remove). The usual
// choices get their own check under the field, with a plain heading and one line saying what Not today means, in one of two
// looks: `rows` (default), one line per usual choice, its name and the package's segmented pair "Had it" / "Not today"
// (neither pressed: not answered); `chips`, one row of the package's three-way chips (one press had it, ✓; a second not today,
// ✕ and struck through; a third clears). "Had it" is the same as picking the item (its tag appears), "Not today" takes the
// tag away if there was one; the check and the tags are one state.
//
// Events: `kp-usual-pick` `{ value, from: 'usual' | 'all' | 'pinned' | 'typed' }`, `kp-usual-add`
// `{ label, nearTo }` (cancelable: the app keeps the vocabulary and may refuse), `kp-usual-not-today` `{ value, on }`,
// `kp-usual-retry`. Alt U jumps to the first usual choice (a bare `u` would take the first letter of a name; Alt U is on the `?`
// sheet). No digit key is bound. Nothing runs on import; attachUsualPickers(root) returns a detach.

export {
    USUAL,
    USUAL_PICK_EVENT,
    USUAL_ADD_EVENT,
    USUAL_NOT_TODAY_EVENT,
    USUAL_RETRY_EVENT,
    USUAL_STATES,
    USUAL_FOLD_ABOVE,
} from './usual-picker/constants.js';
export { normaliseName, similarity, nearNames } from './usual-picker/names.js';
export { attachUsualPickers, usualPicker, setUsual, setUsualState, usualNotToday } from './usual-picker/attach.js';

/** @typedef {import('./usual-picker/types.js').UsualItem} UsualItem */
/** @typedef {import('./usual-picker/types.js').UsualModel} UsualModel */
/** @typedef {import('./usual-picker/types.js').UsualHandle} UsualHandle */
