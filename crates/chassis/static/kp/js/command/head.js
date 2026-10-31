// The head of a command block (the terminal, the admin or sudo badge, the copy button) and the note under the code.

import { getStrings } from '../strings.js';

/** @typedef {{ prompt: string, continues: readonly string[], windows: boolean }} Shell */

/**
 * The copy button's cell: invisible copies hold it as wide as the widest word of the code block's Copy (Copy, Copied, Blocked), so
 * the two Copy buttons of one page share one width [alignrest-1019].
 * @param {Document} doc @param {string} codeId @param {string} nameId
 */
function copySlot(doc, codeId, nameId) {
    const s = getStrings();
    const slot = doc.createElement('span');
    slot.className = 'kp-command__copy-slot';
    const copy = doc.createElement('button');
    copy.type = 'button';
    copy.className = 'kp-button kp-button--sm kp-copyable__button kp-command__copy';
    copy.dataset.kpCopy = codeId;
    copy.dataset.kpCopiedText = s.copied;
    copy.textContent = s.copy;
    copy.setAttribute('aria-describedby', nameId);
    for (const [word, copied] of [
        [s.copy, false],
        [s.copied, true],
        [s.copyBlocked, false],
    ]) {
        const ghost = doc.createElement('span');
        ghost.className = 'kp-button kp-button--sm kp-copyable__button kp-command__copy kp-command__ghost';
        ghost.setAttribute('aria-hidden', 'true');
        if (copied) ghost.dataset.kpCopied = '';
        ghost.textContent = /** @type {string} */ (word);
        slot.append(ghost);
    }
    slot.append(copy);
    return slot;
}

/**
 * The head: the terminal, the admin or sudo badge, the copy button.
 * @param {HTMLElement} el the command block
 * @param {{ id: string, key: string, shell: Shell, codeId: string }} how
 * @returns {{ head: HTMLElement, name: HTMLElement }}
 */
export function buildHead(el, { id, key, shell, codeId }) {
    const s = getStrings();
    const doc = el.ownerDocument;
    const head = doc.createElement('div');
    head.className = 'kp-command__head';
    const name = doc.createElement('span');
    name.className = 'kp-command__shell';
    name.id = `${id}-shell`;
    name.textContent = el.dataset.kpCommandLabel ?? s.commandShell(key);
    head.append(name);
    if (el.dataset.kpCommandElevated !== undefined) {
        const badge = doc.createElement('span');
        badge.className = 'kp-badge kp-badge--warning kp-command__elevated';
        badge.textContent = shell.windows ? s.commandAdmin : s.commandSudo;
        badge.title = shell.windows ? s.commandAdminTitle : s.commandSudoTitle;
        head.append(badge);
    }
    head.append(copySlot(doc, codeId, name.id));
    return { head, name };
}

/**
 * The note under the code: where it runs, or null when the block says nothing.
 * @param {HTMLElement} el
 * @returns {HTMLElement | null}
 */
export function buildWhere(el) {
    if (!el.dataset.kpCommandWhere) return null;
    const where = el.ownerDocument.createElement('p');
    where.className = 'kp-command__where';
    where.textContent = getStrings().commandRunsOn(el.dataset.kpCommandWhere);
    return where;
}
