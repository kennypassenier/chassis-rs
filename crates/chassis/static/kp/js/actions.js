// A list's row buttons on columns the whole list shares [scope-143].
//
// A button of one role starts at one edge and has one width on every row,
// whatever its label, and a row without that role leaves its column empty.
// A `.kp-action-list` is a CSS subgrid, so the browser sizes the columns and
// by position from the end the stylesheet needs no script at all; this
// module only names each button's column when buttons carry a role
// (`data-kp-action="<role>"`). A table cannot be a subgrid: there each
// role's widest button is measured and the widths are written on the table.
//
//   <ul class="kp-action-list">
//       <li>
//           <div>INC-4471 Pump house 3: pressure below 2.1 bar</div>
//           <div class="kp-row-actions">
//               <button type="button" class="kp-button kp-button--sm">Assign…</button>
//               <button type="button" class="kp-button kp-button--sm kp-button--primary">Open</button>
//           </div>
//       </li>
//   </ul>
//
// Nothing runs on import; attachActionColumns(root) returns a detach.

import { attachAll, attachOne, controllerOf } from './controller.js';
import { ActionColumns } from './actions/columns.js';
import { RowKeys } from './actions/keys.js';
import { ROW_KEYS } from './actions/values.js';

export { ROW_ACTIONS, ACTION_LIST, ROW_KEYS, ROW_OPEN_EVENT } from './actions/values.js';
export { rowRoles, mergeRoles } from './actions/roles.js';
export { fitActionColumns } from './actions/fit.js';
export { setRowBusy } from './actions/busy.js';
export { removeRow } from './actions/remove.js';

/**
 * Keep every list's and table's row buttons on shared columns under `root`:
 * fitted now, and again, once per frame, when a row's buttons change, the
 * theme changes or a font arrives (a table's widths are measured).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachActionColumns(root = document) {
    const host = /** @type {HTMLElement} */ (/** @type {unknown} */ (root));
    // One per root: a root that is already kept is left to the call that wired it.
    const kept = controllerOf(host, ActionColumns);
    const columns = kept ?? attachOne(host, ActionColumns);
    return () => {
        if (!kept) columns?.destroy();
    };
}

// Rows at work, rows that go, rows the keyboard walks [kpadopt4-rows]:
// A list of messages (an inbox, a queue, a dead-letter backlog) acts on one
// row at a time: a press starts a request, the row waits for its answer, and
// on success the row often leaves. setRowBusy() makes the wait visible
// without moving a column, removeRow() lets the row leave the theme's way
// and keeps the keyboard's place, and attachRowKeys() moves the focus from
// row to row with j / k or the arrows, the way a mail client does.

/**
 * Let the keyboard walk the rows of every list marked `data-kp-row-keys`
 * under `root`: j or ↓ to the next row, k or ↑ to the one before, Home and End to the first and the last, Enter on a row fires
 * `kp-row-open`. Never while typing in a field or with a modifier held, and a button in a row
 * keeps Enter for itself. One row of the list is in the tab order (the
 * last one focused), so Tab reaches the list once.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachRowKeys(root = document) {
    return attachAll(root, ROW_KEYS, RowKeys);
}
