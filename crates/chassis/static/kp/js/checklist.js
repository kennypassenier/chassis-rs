// A checklist: tick items off, the ticked ones sink [kpadopt4; the AuDHD recipe app's shopping list].
//
// A list a person works down: a shopping list by shop, a packing list, the
// steps of a chore. What is still to do stays on top; what is done sinks to
// the end of its group, struck through, so the eye only ever looks at the top.
//
//   <div class="kp-checklist" data-kp-checklist aria-label="Shopping list"></div>
//
//   setChecklistItems(list, [{ id: 'milk', label: 'Milk', detail: '2 l', group: 'Colruyt' }, …]);
//   list.addEventListener('kp-checklist-change', (e) => save(e.detail.items));
//
// Parts, made by the module: a bar (`__bar`) with the count of what is done
// and Check all, Uncheck all and Clear checked; a body (`__body`) of groups (`__group`,
// with a heading `__head` holding `__title` and `__count`, "4 of 9") and
// rows (`__item` > `label.__row` > a real checkbox `__check`, `__label`,
// `__detail`); an empty line (`__empty`) and a status region (`__live`).
//
// What it does:
//   - The whole row is the checkbox's label, so a tap anywhere on it ticks it.
//   - A ticked item sinks to the end of its group (`data-kp-checklist-sink`
//     "false" keeps it where it stands, struck through). The move glides in
//     the theme's own size time and curve (js/motion.js), so the eye sees
//     where it went; under reduced motion it moves at once. Ticking it again
//     brings it back to its own place among the open ones.
//   - Ticked with the keyboard, the focus goes to the open item that took its
//     place, so a person can tick down the list with Space and the arrows
//     never jump; ticked with a pointer, the focus stays on the item.
//   - Clear checked takes the ticked items away and, for a while
//     (`data-kp-checklist-undo-ms`, 6000), offers Undo in the bar's own line,
//     in place of the count, so nothing moves.
//   - Nothing is stored: every change is an event with the whole list, so the
//     page saves it (offline first, synchronised later) as it likes.
//
// States: `setChecklistState(list, 'loading' | 'error' | 'ready', message)`:
// loading lays the data table's busy card over the body (js/busy-card.js),
// error says the message on the failed plate with a Retry in the empty line's place; an empty list says
// `data-kp-checklist-empty` (or the dictionary's sentence) on the empty plate. Both are js/state-plate.js.
//
// Events (bubbling, on the list):
//   kp-checklist-change   { id, checked, items }   a tick, Check all or Uncheck all (id null)
//   kp-checklist-clear    { removed, items }       Clear checked
//   kp-checklist-undo     { restored, items }      Undo after a clear
//   kp-checklist-retry    {}                       the Retry of the failed state
//
// Every word it adds is in js/strings.js. Nothing runs on import.
//
// Each wired list is one Checklist controller (js/checklist/controller.js, on js/controller.js); the items, the Undo and the
// busy card stay in a per-list registry (js/checklist/state.js), so a page can give a list its items before wiring it. The
// parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { Checklist } from './checklist/controller.js';
import { CHECKLIST } from './checklist/state.js';

export {
    CHECKLIST,
    CHECKLIST_EVENT,
    CHECKLIST_CLEAR_EVENT,
    CHECKLIST_UNDO_EVENT,
    CHECKLIST_RETRY_EVENT,
    CHECKLIST_RENDER_EVENT,
    CHECKLIST_UNDO_MS,
    getChecklistItems,
} from './checklist/state.js';
export { setChecklistItems, setChecklistChecked, setChecklistState } from './checklist/api.js';

/**
 * @typedef {object} ChecklistItem
 * @property {string} id
 * @property {string} label
 * @property {string} [detail]  the amount or a note, after the label ("3 pieces")
 * @property {string} [group]  a shop or a section; items without one share a group without a heading
 * @property {boolean} [checked]
 * @property {import('./claim.js').ClaimInfo} [claim]  who brings it (js/claim.js, `data-kp-checklist-claim`) [kpadopt6]
 */

/**
 * Wire every checklist under `root`: the ticks, Check all, Clear checked and
 * its Undo. Items come from setChecklistItems().
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachChecklists(root = document) {
    return attachAll(root, CHECKLIST, Checklist);
}
