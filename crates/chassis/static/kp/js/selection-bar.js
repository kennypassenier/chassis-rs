// The selection bar [kpadopt5; homelab's `.sk-batch`, kyu's dead-letter requeue, JobTracker's list].
//
// A bar that is there as soon as rows are ticked: how many, which ones, the
// page's actions for them, and a way to untick everything. It extends the data
// table's actions slot (`data-kp-datatable-actions`) into a bar of its own that
// also serves a list of cards or a board.
//
//   <div class="kp-selection" data-kp-selection data-kp-selection-for="orders">
//       <div class="kp-selection__actions">
//           <button class="kp-button" data-kp-selection-action="requeue">Requeue</button>
//           <button class="kp-button kp-button--destructive" data-kp-selection-action="delete">Delete</button>
//       </div>
//   </div>
//
// The module adds the count ("3 selected", exact, in the width of the next
// digit), the names (wrapping, "+4 more" with the exact number, never cut with
// an ellipsis), the button that unticks all (also Esc) and, on a narrow bar,
// the Actions button that holds the page's buttons. It is fed by the boxes
// (`data-kp-select-row`) of the element it is for, through their `change`
// events and the data table's `kp-datatable-select`, or by setSelection().
//
// Options, as attributes and as the second argument of attachSelectionBars():
//
//   data-kp-selection-for    ids of the table(s) or list(s) it serves, space separated; default the nearest
//   data-kp-placement        `sticky-top` (default) | `inline` | `floating-bottom`
//   data-kp-selection-names  `names` (default) | `count`
//   data-kp-selection-max    how many names before "+N more" (default 6)
//   data-kp-select-matching  how many rows match in all (the page counts them): the bar offers "Select all 312 that match"
//   data-kp-undo-ms          read by the page's undo (default 6000); the bar only carries it in the action event
//
// The bar keeps its place whether or not anything is ticked: it slides over a
// space it holds (inline and sticky-top) or floats up from the foot
// (floating-bottom), so the list under it never jumps. A press on a button
// marked `data-kp-selection-action` fires `kp-selection-action` on the bar with
// what is ticked. An action that is running calls setSelectionBusy(), one that
// some rows refused calls setSelectionResult(), and setSelectionRules() turns
// an action off, with the reason, for a selection it does not fit.
//
// Each bar is one SelectionBar controller (js/selection-bar/controller.js, on js/controller.js) with its memory on the
// instance; the parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { SelectionBar } from './selection-bar/controller.js';
import { SELECTION } from './selection-bar/model.js';

export {
    SELECTION,
    SELECTION_EVENT,
    SELECTION_CLEAR_EVENT,
    SELECTION_MATCHING_EVENT,
    SELECTION_ACTION_EVENT,
    SELECTION_NAMES,
    SELECTION_SAY_MS,
} from './selection-bar/model.js';
export { setSelection, getSelection, setSelectionBusy, setSelectionProgress, setSelectionResult, setSelectionRules } from './selection-bar/api.js';

/** @typedef {{ key: string, label: string }} SelectionItem */

/**
 * @typedef {object} SelectionOptions
 * @property {'sticky-top' | 'inline' | 'floating-bottom'} [placement]
 * @property {'names' | 'count'} [names]
 * @property {number} [maxNames]
 * @property {number} [matching]
 */

/**
 * Give every selection bar under `root` its parts and its source.
 * @param {ParentNode} [root]
 * @param {SelectionOptions} [options]
 * @returns {() => void} detach
 */
export function attachSelectionBars(root = document, options = {}) {
    return attachAll(root, SELECTION, SelectionBar, options);
}
