// The row deleted with Undo [ux-1101]: the review found the Undo toast was the right answer for a restorable delete, yet only
// one app in three wired it, and the others reached for a confirm. This is the wiring, ready for a data table or a list:
//
//   <tr data-kp-row-key="ibuprofen-400"> … <button type="button" class="kp-button kp-button--sm" data-kp-row-delete="Ibuprofen 400">Delete</button></tr>
//
// A press on a `[data-kp-row-delete]` control (its value is the row's name; else the row's `data-kp-row-name`) deletes its
// row, the nearest `[data-kp-row-key]`, `tr` or `li`:
//   1. `kp-row-delete` `{ row, key, name }` fires on the row, cancelable;
//   2. the row is held out of sight at once: in a data table with its own `data-kp-row-hidden`, so the count and the pager
//      follow; in a list with `hidden`; it carries `data-kp-row-deleting` meanwhile;
//   3. the focus goes to the same control in the next row (else the row before, else the list or table);
//   4. the package's Undo toast (js/undo-toast.js) says "Ibuprofen 400 deleted" with its clock; the window, the clock and
//      the key are the toast's own options (`data-kp-undo-ms` and so on);
//   5. Undo puts the row back where it stood, the focus on its control, says "Ibuprofen 400 is back" and fires
//      `kp-row-delete-undo`; when the window closes, `kp-row-delete-commit` `{ row, key, name, waitUntil(promise) }` fires on
//      the row's table or list and the row leaves once the page's promise resolves. A rejection puts the row back and the
//      toast says the delete was not done.
// Nothing reaches the server before the window closes. `deleteRowWithUndo(row, { name, control, ms })` does the same from a
// page's own code (a row menu's Delete entry). The control is a kp button, 44 px under a coarse pointer.
//
// Nothing runs on import; attachRowUndo(root) listens under root and returns a detach.

import { attachOne } from './controller.js';
import { RowUndoRoot } from './row-undo/controller.js';

export { ROW_DELETE, ROW_DELETE_EVENT, ROW_COMMIT_EVENT, ROW_UNDO_EVENT } from './row-undo/constants.js';
export { deleteRowWithUndo } from './row-undo/delete.js';

/**
 * Delete rows with Undo under `root`: one delegated listener. Idempotent per root.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachRowUndo(root = document) {
    const host = /** @type {HTMLElement} */ (root instanceof Document ? root.documentElement : root);
    const control = attachOne(host, RowUndoRoot);
    return () => control?.destroy();
}
