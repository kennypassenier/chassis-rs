// A list and its detail side by side, folding to one pane on a phone [kpadopt5-ops; spec item 7].
//
// homelab's Secrets page has three panes (stacks, items, detail), JobTracker's
// dossiers two. Both are `kp-split` with fixed columns and a narrow behaviour,
// so this extends the split instead of adding a second layout:
//
//   <div class="kp-split kp-split--panes" data-kp-master-detail data-kp-pane-widths="17rem 1fr 24rem">
//       <section class="kp-split__pane" data-kp-pane="list" aria-label="Secrets">
//           <ul class="kp-pane__list" role="listbox" aria-label="Secrets">
//               <li role="option" data-kp-pane-key="db">Database</li>
//           </ul>
//       </section>
//       <section class="kp-split__pane" data-kp-pane="detail" aria-label="Secret">
//           <h2 data-kp-pane-heading tabindex="-1">Database</h2>
//           <div class="kp-pane__body">…</div>
//       </section>
//       <aside class="kp-split__pane" data-kp-pane="aside" aria-label="History">…</aside>
//   </div>
//
// Panes: `list` and `detail` are required; `aside` is optional. Options, each
// an attribute and a JS option of attachMasterDetails(root, options):
//
//   data-kp-pane-widths      "17rem 1fr" (+ " 24rem" with an aside): the columns
//   data-kp-fold-at          "48rem": the layout's width below which the panes fold
//   data-kp-aside-fold-at    "90rem": below it the aside moves under the other panes
//   data-kp-narrow           one-pane (default) | stack | sheet: what a phone shows
//   data-kp-resizable        present: write a `kp-split__separator` between the list and the detail and `data-kp-split`
//                            on the root, and the divider drags like kp-split's (add `data-kp-remember` to keep the width)
//   data-kp-pane-history     "off" leaves the browser's history alone (default: on)
//
// One pane, narrow: the list; choosing an item opens the detail with a Back
// button at the top of the pane. Back (the button, the browser's Back, Esc in
// the detail) returns; the list keeps its scroll and its selection. The detail
// arrives the theme's own way (js/motion.js arriveShown), not a generic slide.
// Focus moves to the detail's heading on open and back to the row on Back.
// Arrow keys in the list change the selected item without the focus leaving the
// list, as a listbox does; Home and End jump; Enter and Space open it when the
// panes are folded. Esc in the aside closes it (`data-kp-aside-closable`).
//
// States (setPaneState): `empty` (the default while nothing is selected:
// "Pick an item on the left", centred at the heading size in the detail pane;
// with nothing in the list it covers the whole master-detail), `loading` (the theme's
// busy card over the detail pane only; the list stays usable; where the detail is a closed sheet on a phone, over the list), `error` (the
// destructive plate over the whole master-detail with Retry) and `ready`. The consumer reacts to the events and draws the detail itself.
//
// Which failed plate wins [kyugaps-1020, kyu gap 52]: the innermost component's own, for its own failure. A data component in the
// detail (a code block, a table, a chart) that already shows its failed plate (`data-kp-state="error"` or a `.kp-stateplate--error`
// inside `.kp-pane__body`, on screen) is not covered: `setPaneState(root, 'error')` then draws no plate of its own, the list stays usable, the body
// stays reachable and the component's own Retry (its own event) is the one to press. The root still reads `data-kp-state="error"` and
// also `data-kp-error-own`, so a page can tell the two apart. The master-detail's plate (and `kp-pane-retry`) is for a failure no
// component in the detail owns: the list or the detail could not be read at all.
//
// Events (bubbling, on the root):
//   kp-pane-select  { key, item }       the selection moved (arrow keys, a click)
//   kp-pane-open    { key, item }       the detail was opened: a click or Enter; the page loads it, its router writes ?item=
//   kp-pane-close   { pane, key }       the detail (narrow) or the aside went away
//   kp-pane-retry   { key }             Retry in an errored detail
//
// Nothing runs on import; attachMasterDetails(root) returns a detach.
//
// The module is a facade: a layout is a `MasterDetailController` (closure-pattern B, js/controller.js) in `js/master-detail/`, one file per concern.

export {
    MASTER_DETAIL,
    PANE_SELECT_EVENT,
    PANE_OPEN_EVENT,
    PANE_CLOSE_EVENT,
    PANE_RETRY_EVENT,
    PANE_WIDTHS,
    PANE_ASIDE_WIDTH,
    PANE_FOLD_AT,
    PANE_ASIDE_FOLD_AT,
} from './master-detail/constants.js';
export { masterDetail, setPaneState, selectPane, openPane, closePane, attachMasterDetails } from './master-detail/api.js';

/** @typedef {import('./master-detail/constants.js').PaneState} PaneState */
/** @typedef {import('./master-detail/constants.js').PaneStateOptions} PaneStateOptions */
/** @typedef {import('./master-detail/constants.js').MasterDetailHandle} MasterDetailHandle */
