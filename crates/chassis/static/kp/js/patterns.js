// The small patterns, framework-free [TH50, TH51, TH53].
//
// None of these is a component in the usual sense. They are the things
// every application rewrites badly, and they are here for the same reason
// the data-showing classes are: the fifth reimplementation of "copy this
// value" is not better than the first, it is just differently wrong.
//
//   TH53  a value with a copy button that confirms
//   TH51  a row action that happens optimistically, with an undo
//   TH50  an empty state that knows the difference between "nothing yet"
//         and "nothing matched your filter"
//
// TH52 (status parts) and TH54 (diff) are markup and CSS only — there is
// no behaviour to attach, so they live in the stylesheet and in the React
// components, and nothing here needs to know about them.
//
// Since 3.0.0 [KT6]: the commit and undo events carry a detail — which
// row, which button, its key, and a restore() for a delete the server
// refused; the copy button dispatches its own events and reads its
// revert delay from an attribute; detach cancels every pending timer,
// restores every row still in flight and removes its toasts.

import { toast } from './overlays.js';
import { getStrings } from './strings.js';

const COPY = '[data-kp-copy]';
const UNDO = '[data-kp-undo-action]';

/** How long the undo stays offered before the action is committed. An operational knob; per element as `data-kp-undo-ms`. */
export const UNDO_MS = 6000;
/** How long "copied" stays on the button. Per element as `data-kp-copied-ms`. */
export const COPIED_MS = 1500;

/** @typedef {{ target: HTMLElement, button: HTMLElement, key: string | null, restore: () => void }} ActionDetail */

/** Fired on the row when an optimistic action commits — the undo window closed [TH26]. Detail: ActionDetail. */
export const COMMIT_EVENT = 'kp-action-commit';
/** Fired on the row when it is undone instead. Detail: ActionDetail. */
export const UNDO_EVENT = 'kp-action-undo';
/** Fired on the copy button after a successful copy: `{ text }`. */
export const COPY_EVENT = 'kp-copy';
/** Fired on the copy button when the clipboard refused: `{ text, error }`. */
export const COPY_FAILED_EVENT = 'kp-copy-failed';

/**
 * Attach the patterns under `root`.
 *
 * @param {ParentNode} root
 * @param {{ copiedMs?: number, undoMs?: number, toastOnCopyFailure?: boolean, undoClassName?: string }} [options]
 * @returns {() => void} detach
 */
export function attachPatterns(
    root = document,
    { copiedMs = COPIED_MS, undoMs = UNDO_MS, toastOnCopyFailure = true, undoClassName = 'kp-button kp-button--ghost' } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];

    for (const element of root.querySelectorAll(COPY)) {
        const button = /** @type {HTMLButtonElement} */ (element);
        if (button.dataset.kpCopyAttached !== undefined) continue;
        button.dataset.kpCopyAttached = '';
        const idle = button.textContent ?? '';
        const done = button.dataset.kpCopiedText ?? getStrings().copied;
        const revertMs = Number.parseInt(button.dataset.kpCopiedMs ?? '', 10) || copiedMs;
        let revert = 0;

        const onClick = async () => {
            const target = button.dataset.kpCopy ?? '';
            // By id on the document, not on root: the value a button copies
            // may sit outside the subtree this call attached.
            const source = target === '' ? null : document.getElementById(target);
            const text = source?.textContent?.trim() ?? button.dataset.kpCopyValue ?? '';
            try {
                await navigator.clipboard.writeText(text);
            } catch (error) {
                // Refused — an insecure context, or the permission denied.
                // Saying nothing here is how a copy button becomes the
                // control people click twice and then distrust.
                button.dataset.kpCopyFailed = '';
                if (toastOnCopyFailure && button.dataset.kpCopyToast !== 'false') toast(getStrings().copyBlockedAnnouncement);
                button.dispatchEvent(new CustomEvent(COPY_FAILED_EVENT, { bubbles: true, detail: { text, error } }));
                return;
            }
            delete button.dataset.kpCopyFailed;
            // Confirmed in words on the button itself, and announced: a
            // colour change is invisible to a screen reader, and a toast
            // alone is invisible to someone looking at the button.
            button.textContent = done;
            button.dataset.kpCopied = '';
            button.dispatchEvent(new CustomEvent(COPY_EVENT, { bubbles: true, detail: { text } }));
            clearTimeout(revert);
            revert = window.setTimeout(() => {
                button.textContent = idle;
                delete button.dataset.kpCopied;
            }, revertMs);
        };

        button.addEventListener('click', onClick);
        cleanups.push(() => {
            button.removeEventListener('click', onClick);
            clearTimeout(revert);
            button.textContent = idle;
            delete button.dataset.kpCopied;
            delete button.dataset.kpCopyFailed;
            delete button.dataset.kpCopyAttached;
        });
    }

    for (const element of root.querySelectorAll(UNDO)) {
        const button = /** @type {HTMLButtonElement} */ (element);
        if (button.dataset.kpUndoAttached !== undefined) continue;
        button.dataset.kpUndoAttached = '';
        const ms = Number.parseInt(button.dataset.kpUndoMs ?? '', 10) || undoMs;
        /** Everything still inside its undo window, so detach can settle it. */
        /** @type {Set<() => void>} */
        const inFlight = new Set();

        const onClick = () => {
            // What goes: the element the consumer named by selector, the
            // nearest marked ancestor, the row, or the parent.
            const selector = button.dataset.kpUndoSelector;
            const target =
                (selector ? button.closest(selector) : null) ??
                button.closest('[data-kp-undo-target]') ??
                button.closest('tr') ??
                button.parentElement;
            if (!(target instanceof HTMLElement)) return;
            const key = target.dataset.kpRowKey ?? target.dataset.kpKey ?? (target.id || null);

            // Optimistic: the row goes now. Waiting for the server first
            // is what makes an interface feel slow, and the undo is what
            // makes going first safe.
            target.hidden = true;
            target.dataset.kpUndoPending = '';
            let settled = false;

            const restore = () => {
                target.hidden = false;
                delete target.dataset.kpUndoPending;
            };
            /** @type {ActionDetail} */
            const detail = { target, button, key, restore };

            let timer = 0;
            const message = toast(button.dataset.kpUndoText ?? getStrings().deleted, {
                ms: Number.parseInt(button.dataset.kpUndoToastMs ?? '', 10) || ms,
                action: {
                    label: button.dataset.kpUndoLabel ?? getStrings().undo,
                    onClick: () => {
                        if (settled) return;
                        settled = true;
                        inFlight.delete(cancel);
                        clearTimeout(timer);
                        restore();
                        message.dismiss();
                        target.dispatchEvent(new CustomEvent(UNDO_EVENT, { bubbles: true, detail }));
                    },
                },
            });
            for (const b of message.querySelectorAll('button')) b.className = undoClassName;

            timer = window.setTimeout(() => {
                if (settled) return;
                settled = true;
                inFlight.delete(cancel);
                delete target.dataset.kpUndoPending;
                // Only now is it real. The consumer deletes here, so a
                // click that was taken back never reached the server —
                // and restore() is in the detail for the delete the
                // server refuses.
                target.dispatchEvent(new CustomEvent(COMMIT_EVENT, { bubbles: true, detail }));
            }, ms);
            const cancel = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                restore();
                message.dismiss();
            };
            inFlight.add(cancel);
        };

        button.addEventListener('click', onClick);
        cleanups.push(() => {
            button.removeEventListener('click', onClick);
            // Nothing commits after detach: a row still in its window
            // comes back, and its toast goes.
            for (const cancel of inFlight) cancel();
            delete button.dataset.kpUndoAttached;
        });
    }

    return () => {
        for (const c of cleanups) c();
    };
}
