// The step list: the steps of one run, live.
//
// A process in flight (an update, an import, a deploy) is a list of steps,
// and each step is waiting, running, done, failed or skipped. The page changes
// them as the run goes, and a person must be able to follow it with their eyes
// or their ears. `data-state` on each item is the source; this module keeps
// the rest in step with it, as js/progressbar.js does for a bar's ARIA:
//
//   <ol class="kp-steplist" aria-label="Update progress">
//     <li class="kp-steplist__item" data-state="done" data-kp-step-id="pull">
//       <span class="kp-steplist__mark" aria-hidden="true"></span>
//       <span class="kp-steplist__body">
//         <span class="kp-steplist__title">Pull the images</span>
//         <span class="kp-steplist__note">Fetches what changed from the registry</span>
//       </span>
//       <time class="kp-steplist__time">4 s</time>
//     </li>
//     …
//   </ol>
//
// What attachSteplists() writes, so the markup can stay that short:
//   - the mark's content: the theme's spinner on the running step (the mark
//     is otherwise drawn by CSS from `data-state`);
//   - the state's word in `.kp-steplist__state` (visually hidden), so a reader
//     moving through the list hears "Pull the images, done";
//   - `aria-current="step"` on the running item;
//   - a visually hidden `role="status"` region after the list, which says "Pull
//     the images: running" when a step changes after the list was attached. The
//     list itself is not a live region: it would read every time and every
//     note again. A burst of changes in one tick is one announcement.
//
// A journey [kpadopt4]: `.kp-steplist--journey` lays the steps side by side
// on one path (a column under 30rem of its own width), the way an
// application goes draft, sent, interview, offer. `data-state="current"` is
// the step it stands at now (no spinner: nothing is running), a reached step
// is `done`, a closed path ends with a `failed` step (rejected, withdrawn),
// and `data-kp-tone="1"` … `"5"` (or `--kp-step-tone`) gives a step its own
// colour. The time column holds the date the step was reached.
//
// Change a step with setStep(list, 'pull', { state: 'running' }); no framework
// is needed, and a framework that sets `data-state` itself is followed too.
// Every word it adds is in js/strings.js.

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names, the DOM helpers, the status region, the per-step sync
// (StepItem, which also serves setStep() before any attach), the builders and the StepListController live in js/steplist/, listed
// in js/README.md.

import { attachAll } from './controller.js';
import { StepListController } from './steplist/controller.js';
import { STEPLIST_SELECTOR } from './steplist/values.js';

export { STEPLIST_SELECTOR, STEP_ID_ATTRIBUTE, STEPLIST_EVENT, STEP_STATES } from './steplist/values.js';
export { buildSteplist, setStep } from './steplist/build.js';

/**
 * @typedef {'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'current'} StepState
 * @typedef {object} StepRow
 * @property {string} [id] names the step for setStep(); defaults to its index
 * @property {string} title
 * @property {string} [note] the one-line description under the title; give every step one, so a note arriving later moves nothing
 * @property {StepState} [state] pending when absent
 * @property {string} [time] how long it took, as the page prints it (in a journey: the date the step was reached)
 * @property {1 | 2 | 3 | 4 | 5} [tone] the step's own colour, `--chart-1` … `--chart-5` (`data-kp-tone`) [kpadopt4]
 */

/**
 * Sync every `.kp-steplist` under `root`, and follow `data-state` changes
 * later, so a framework or a hand-written `setAttribute` is followed too.
 * A list rendered after this ran is attached by calling it on that subtree.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops following the lists
 */
export function attachSteplists(root = document) {
    return attachAll(root, STEPLIST_SELECTOR, StepListController);
}
