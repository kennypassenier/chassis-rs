// The settled row [parts-1102; the Habits todo app's rows that left the list while it is open, as Things 3 keeps them].
//
//   <li class="kp-task-row" data-kp-row-key="t4" data-kp-settled="Deleted">…</li>
//
// A row whose item left the list while the page is open (ticked off, deleted, moved to another list) keeps its place and its
// height, so nothing under it moves: it turns quiet (its parts faded, its frame dashed, its title struck through) and inert (no
// press, no key, no focus, no pick, no drag, no swipe), and shows its value at its end, where the item went: "Deleted",
// "Moved to Work", "Done". It stays so until the list is left: the page draws the list fresh, or calls clearSettled(list),
// which takes the settled rows out. Removing the attribute (Undo) gives the row back as it was.
//
// On a reorder list (`data-kp-reorder`), a checklist (`.kp-checklist`), a task list (`.kp-task-list`) or any list marked
// `data-kp-settled-list`. A row that settles while its list is wired is said once ("Buy milk: Deleted") and fires
// `kp-settled { key, word }`. Every register paints it with its own border and ink.
//
// settleRow(row, word) sets it from a page; nothing runs on import; attachSettled(root) returns a detach.

import { attachAll } from './controller.js';
import { SETTLED, SETTLED_ATTRIBUTE, SETTLED_LISTS } from './settled/constants.js';
import { SettledList } from './settled/controller.js';

export { SETTLED, SETTLED_ATTRIBUTE, SETTLED_EVENT } from './settled/constants.js';

/**
 * Wire every list under `root` that can hold settled rows (the root itself included). Idempotent.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachSettled(root = document) {
    return attachAll(root, SETTLED_LISTS, SettledList);
}

/**
 * Settle a row: where its item went, in words; an empty word takes the settled state away.
 * @param {Element} row
 * @param {string} word
 */
export function settleRow(row, word) {
    if (word) row.setAttribute(SETTLED_ATTRIBUTE, word);
    else row.removeAttribute(SETTLED_ATTRIBUTE);
}

/**
 * The list is left: take its settled rows out. Returns how many went.
 * @param {ParentNode} list
 * @returns {number}
 */
export function clearSettled(list) {
    const rows = [...list.querySelectorAll(SETTLED)];
    for (const row of rows) row.remove();
    return rows.length;
}
