// Status rows: one state per item [kpadopt2-tiles; the dashboard's
// `perstack-chip`].
//
// A page that reads or checks many things one by one (a backup per stack, a
// health check per host) shows each item as a row that is OK, still loading,
// failed (with the reason, and a Retry that tries that one item again) or
// empty (with the reason there is nothing). `data-state` on each row is the
// source; this module keeps the rest in step with it, as js/steplist.js does:
//
//   <ul class="kp-statuslist" aria-label="Backups per stack">
//     <li class="kp-statusrow" data-state="failed" data-kp-status-id="vault">
//       <span class="kp-statusrow__mark" aria-hidden="true"></span>
//       <span class="kp-statusrow__body">
//         <span class="kp-statusrow__label">vault</span>
//         <span class="kp-statusrow__detail">The host did not answer in 20 s</span>
//       </span>
//       <span class="kp-statusrow__action"><button type="button" class="kp-button kp-button--sm">Retry</button></span>
//     </li>
//   </ul>
//
// What attachStatusLists() writes, so the markup can stay that short:
//   - the mark's spinner on a loading row (the mark is otherwise drawn by CSS
//     from `data-state`), `aria-busy` on that row;
//   - the state's word in `.kp-statusrow__state` (visually hidden), so a reader
//     moving through the list hears "vault, failed";
//   - the action cell with a Retry button, shown on a failed row only (leave it
//     out with `data-kp-status-retry="false"` on the list); its name says which
//     row it retries. Pressing it fires `kp-status-retry` on the list and
//     changes nothing else: the page decides what a retry is (usually
//     `setStatus(list, id, { state: 'loading' })`). When the focused Retry goes
//     away with the state change, the focus moves to the row's body, so the
//     keyboard keeps its place;
//   - a visually hidden `role="status"` region after the list, which says "vault:
//     failed, The host did not answer" when a row changes after the list was
//     attached. The list itself is not a live region: it would read every row
//     again. A burst of changes in one tick is one announcement, and more than
//     three become "12 updated, 2 failed".
//
// A check list [kpadopt4-rows] uses two more parts, both opt-in: the state
// `warn` (passes with a reservation: the warning pair on the mark, "!" as its
// shape) and `.kp-statusrow__fix` inside the body, the fix written out, shown
// on a failed or warn row only. buildStatusList() and setStatus() take `fix`.
//
// The calm vocabulary [kpadopt6; Life's today card, the plant dashboard]: `data-kp-status-vocab="calm"` on the list swaps the
// four states for `open`, `done`, `paused` and `unknown` (`loading` stays), with no red anywhere and no tally: a row asked for
// `failed`, `warn` or anything else is drawn as `unknown` and says so in the console. `unknown` exists for a thing that reports
// "ok" because it has no data (a plant with a dead soil sensor): it is never drawn as done. A paused row says "Paused since
// 03/10/2026" from its `data-kp-since` (`data-kp-today-since`: `both` by default, `date` or `relative`) and offers Resume in one press
// (`data-kp-today-resume="off"` leaves it out): `kp-status-resume` fires, the row is open again, and a toast offers Undo that puts
// it back paused with its original date (`kp-status-undo`). `data-kp-today-pause` adds a Pause button on open rows
// (`kp-status-pause`). `data-kp-today-order="open-first"` orders the rows once, at attach, and never again (a row that becomes
// done does not move under a thumb); `data-kp-today-paused="fold"` gathers rows paused longer than `data-kp-today-fold-after`
// days (30) into one expandable line; `data-kp-today-mark` is `glyph` (default) or `none`. Keys while the focus is in the list:
// ArrowUp and ArrowDown between rows, `r` resumes the focused paused row. Inside a `.kp-card[data-kp-state]` (js/card-state.js)
// the card brings loading, empty and failed.
//
// Change a row with setStatus(list, 'vault', { state: 'loading', detail: 'reading (3 s)' });
// a framework that sets `data-state` itself is followed too. Every word it adds
// is in js/strings.js.
//
// Each list is one StatusList controller (js/statusrow/controller.js, on js/controller.js); the parts are listed in
// js/README.md. Attaching a list twice no longer wires it twice.

import { attachAll } from './controller.js';
import { StatusList } from './statusrow/controller.js';
import { STATUS_LIST } from './statusrow/state.js';

export {
    STATUS_LIST,
    STATUS_ID_ATTRIBUTE,
    STATUS_EVENT,
    STATUS_RETRY_EVENT,
    STATUS_RESUME_EVENT,
    STATUS_PAUSE_EVENT,
    STATUS_UNDO_EVENT,
    STATUS_STATES,
    CALM_STATUS_STATES,
} from './statusrow/state.js';
export { buildStatusList, settleToday, setStatus, countStatus, setTodayState } from './statusrow/list.js';

/** @typedef {import('./statusrow/state.js').StatusState} StatusState */
/** @typedef {import('./statusrow/state.js').StatusRow} StatusRow */

/**
 * Sync every `.kp-statuslist` under `root`, follow `data-state` changes later
 * and turn a press on a Retry into `kp-status-retry`. A list rendered after
 * this ran is attached by calling it on that subtree.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachStatusLists(root = document) {
    return attachAll(root, STATUS_LIST, StatusList);
}
