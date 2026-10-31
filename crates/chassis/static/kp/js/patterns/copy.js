// Attaches the copy buttons, the secret blocks and the other patterns of a page.
import { Controller, attachOne } from '../controller.js';
import { toast } from '../overlays.js';
import { getStrings } from '../strings.js';
import { CLEAR_AFTER_MS, COPIED_MS, COPY, COPY_EVENT, COPY_FAILED_EVENT, UNDO, UNDO_MS } from './constants.js';
import { attachSecrets } from './secrets.js';
import { UndoControl } from './undo.js';
/** @typedef {import('./types.js').SecretLoad} SecretLoad */

/**
 * Attach the patterns under `root`.
 *
 * `secretLoad(field, purpose)` reads a secret field's value when it is shown or copied (purpose `reveal` or `copy`), so the
 * value is in the page only while it is shown; without it a field asks through `kp-secret-request`, and last reads its
 * own `data-kp-secret-value`.
 *
 * `clearAfterMs` is how long after a Copy the clipboard is emptied again (default 30 000 ms; 0 or false: never), for every
 * secret field without its own `data-kp-secret-clear`.
 *
 * @param {ParentNode} root
 * @param {{ copiedMs?: number, undoMs?: number, clearAfterMs?: number | false, toastOnCopyFailure?: boolean, undoClassName?: string, secretLoad?: SecretLoad }} [options]
 * @returns {() => void} detach
 */
export function attachPatterns(
    root = document,
    {
        copiedMs = COPIED_MS,
        undoMs = UNDO_MS,
        clearAfterMs = CLEAR_AFTER_MS,
        toastOnCopyFailure = true,
        undoClassName = 'kp-button kp-button--ghost',
        secretLoad,
    } = {},
) {
    const detachSecrets = attachSecrets(root, { copiedMs, clearAfterMs, ...(secretLoad ? { load: secretLoad } : {}) });
    // A button marked attached is wired already, by this call's controller or an earlier one.
    const copies = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(COPY)])
        .filter((button) => !('kpCopyAttached' in button.dataset))
        .map((button) => attachOne(button, CopyControl, { copiedMs, toastOnCopyFailure }));
    const undos = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(UNDO)])
        .filter((button) => !('kpUndoAttached' in button.dataset))
        .map((button) => attachOne(button, UndoControl, { undoMs, undoClassName }));
    return () => {
        detachSecrets();
        for (const control of [...copies.splice(0), ...undos.splice(0)]) control?.destroy();
    };
}

/** One copy button: its own words, the words that confirm a copy, and the timer that puts its own words back. */
class CopyControl extends Controller {
    /** @param {HTMLElement} host @param {{ copiedMs?: number, toastOnCopyFailure?: boolean }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.idle = host.textContent ?? '';
        this.done = host.dataset.kpCopiedText ?? getStrings().copied;
        this.revertMs = Number.parseInt(host.dataset.kpCopiedMs ?? '', 10) || (options.copiedMs ?? COPIED_MS);
        this.toastOnCopyFailure = options.toastOnCopyFailure ?? true;
        this.revert = 0;
    }

    connect() {
        const button = this.host;
        button.dataset.kpCopyAttached = '';
        this.own(() => {
            clearTimeout(this.revert);
            button.textContent = this.idle;
            delete button.dataset.kpCopied;
            delete button.dataset.kpCopyFailed;
            delete button.dataset.kpCopyAttached;
        });
        this.listen(button, 'click', () => void this.copy());
    }

    async copy() {
        const button = this.host;
        const target = button.dataset.kpCopy ?? '';
        // By id on the document, not on root: the value a button copies may sit outside the subtree this call attached.
        const source = target === '' ? null : document.getElementById(target);
        const text = source?.textContent?.trim() ?? button.dataset.kpCopyValue ?? '';
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            // Refused — an insecure context, or the permission denied. Saying nothing here is how a copy button becomes the
            // control people click twice and then distrust.
            button.dataset.kpCopyFailed = '';
            if (this.toastOnCopyFailure && button.dataset.kpCopyToast !== 'false') toast(getStrings().copyBlockedAnnouncement);
            button.dispatchEvent(new CustomEvent(COPY_FAILED_EVENT, { bubbles: true, detail: { text, error } }));
            return;
        }
        delete button.dataset.kpCopyFailed;
        // Confirmed in words on the button itself, and announced: a colour change is invisible to a screen reader, and a toast
        // alone is invisible to someone looking at the button.
        button.textContent = this.done;
        button.dataset.kpCopied = '';
        button.dispatchEvent(new CustomEvent(COPY_EVENT, { bubbles: true, detail: { text } }));
        clearTimeout(this.revert);
        this.revert = window.setTimeout(() => {
            button.textContent = this.idle;
            delete button.dataset.kpCopied;
        }, this.revertMs);
    }
}
