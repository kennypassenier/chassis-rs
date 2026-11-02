// Deleting one row with Undo [ux-1101]: the row is held out of sight at once (a data table's own hold, so its count and pager
// follow), the focus goes to the same control in the next row, the package's Undo toast says what went, Undo puts the row back
// where it stood with the focus on its control, and when the window closes the page hears the commit and the row leaves.

import { getStrings } from '../strings.js';
import { undoToast } from '../undo-toast.js';
import { DELETING_ATTRIBUTE, NAME_ATTRIBUTE, ROW, ROW_COMMIT_EVENT, ROW_DELETE, ROW_DELETE_EVENT, ROW_UNDO_EVENT, TABLE_HIDDEN_ATTRIBUTE } from './constants.js';

/** Whether a row stands in a data table, which holds rows out itself. @param {HTMLElement} row */
const inTable = (row) => row.closest('[data-kp-datatable]') !== null;

/** Hold a row out of sight, or let it back. @param {HTMLElement} row @param {boolean} held */
function hold(row, held) {
    row.toggleAttribute(DELETING_ATTRIBUTE, held);
    if (inTable(row)) row.toggleAttribute(TABLE_HIDDEN_ATTRIBUTE, held);
    else row.hidden = held;
}

/** The row's name: the control's value, the row's `data-kp-row-name`, else none. @param {HTMLElement} row @param {Element | null} control */
function nameOf(row, control) {
    return control?.getAttribute('data-kp-row-delete') || row.getAttribute(NAME_ATTRIBUTE) || '';
}

/**
 * Where the focus goes when a row leaves: the same control in the next row still shown, else in the one before, else the
 * list or table itself (made focusable for the moment).
 * @param {HTMLElement} row
 */
function focusNeighbour(row) {
    const shown = (/** @type {Element | null} */ el) => el instanceof HTMLElement && el.matches(ROW) && !el.hidden && !el.hasAttribute(DELETING_ATTRIBUTE);
    let next = row.nextElementSibling;
    while (next && !shown(next)) next = next.nextElementSibling;
    let prev = row.previousElementSibling;
    while (prev && !shown(prev)) prev = prev.previousElementSibling;
    const control = /** @type {HTMLElement | null} */ ((next ?? prev)?.querySelector(ROW_DELETE) ?? null);
    if (control) return control.focus();
    const host = /** @type {HTMLElement | null} */ (row.closest('[data-kp-datatable], table, ul, ol, [role="list"]'));
    if (!host) return;
    if (!host.hasAttribute('tabindex')) host.tabIndex = -1;
    host.focus();
}

/** The page's commit: its promises awaited, then the row leaves. @param {HTMLElement} row @param {EventTarget} owner @param {{ key: string, name: string }} info */
async function commitRow(row, owner, info) {
    /** @type {Promise<unknown>[]} */
    const waits = [];
    owner.dispatchEvent(new CustomEvent(ROW_COMMIT_EVENT, { bubbles: true, detail: { row, ...info, waitUntil: (/** @type {Promise<unknown>} */ p) => void waits.push(p) } }));
    await Promise.all(waits);
    row.remove();
}

/**
 * Delete a row with Undo. Returns the toast's handle, or null when the page cancelled `kp-row-delete`.
 * @param {HTMLElement} row
 * @param {{ name?: string, control?: HTMLElement | null, ms?: number }} [options]
 * @returns {import('../undo-toast.js').UndoToast | null}
 */
export function deleteRowWithUndo(row, { name, control = row.querySelector(ROW_DELETE), ms } = {}) {
    const info = { key: row.getAttribute('data-kp-row-key') ?? row.id ?? '', name: name ?? nameOf(row, control) };
    if (!row.dispatchEvent(new CustomEvent(ROW_DELETE_EVENT, { bubbles: true, cancelable: true, detail: { row, ...info } }))) return null;
    // The commit is heard on the row's list or table: the row itself has left the page by the time a listener would look.
    const owner = row.parentElement?.closest('[data-kp-datatable], table, ul, ol, [role="list"]') ?? row.parentElement ?? row.ownerDocument;
    const hadFocus = row.contains(row.ownerDocument.activeElement);
    hold(row, true);
    if (hadFocus) focusNeighbour(row);
    const s = getStrings();
    return undoToast(info.name ? s.rowDeleted(info.name) : s.rowDeletedNameless, {
        ...(ms === undefined ? {} : { ms }),
        commit: () => commitRow(row, owner, info),
        undo: () => {
            hold(row, false);
            // A data table shows a held row again on its own next turn: the focus is put back once the row can take it.
            const back = /** @type {HTMLElement | null} */ (control ?? row.querySelector(ROW_DELETE));
            requestAnimationFrame(() => back?.isConnected && back.focus());
            row.dispatchEvent(new CustomEvent(ROW_UNDO_EVENT, { bubbles: true, detail: { row, ...info } }));
        },
        ...(info.name ? { restored: s.rowRestored(info.name) } : {}),
    });
}
