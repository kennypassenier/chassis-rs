// The toasts that are still counting or committing, and the one key that undoes the newest: state the toasts of a page share.

import { keyName, matchesKeySpec, parseKeySpec } from '../key-spec.js';

/** @typedef {import('../undo-toast.js').UndoToast} UndoToast */
/** @typedef {{ handle: UndoToast, key: string | false }} StackEntry */

/** The toasts still counting or committing, oldest first. @type {StackEntry[]} */
export const live = [];
let listening = false;

export { keyName };

/**
 * Whether a key event is the configured key (a key spec, js/key-spec.js: `Mod` is Ctrl or Command; a modifier not named must be up).
 * @param {KeyboardEvent} event @param {string} spec
 */
export const keyMatches = (event, spec) => matchesKeySpec(event, parseKeySpec(spec));

/** @param {KeyboardEvent} event */
function onKey(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    for (let i = live.length - 1; i >= 0; i -= 1) {
        const entry = /** @type {StackEntry} */ (live[i]);
        if (entry.key === false || entry.handle.state() !== 'counting') continue;
        // Only the newest toast that can still be undone answers, and only to its own key.
        if (!keyMatches(event, entry.key)) return;
        event.preventDefault();
        entry.handle.undo();
        return;
    }
}

/** @param {StackEntry} entry */
export function enter(entry) {
    live.push(entry);
    if (!listening && typeof document !== 'undefined') {
        document.addEventListener('keydown', onKey);
        listening = true;
    }
}

/** @param {UndoToast} handle */
export function leaveStack(handle) {
    const at = live.findIndex((e) => e.handle === handle);
    if (at >= 0) live.splice(at, 1);
    if (live.length === 0 && listening) {
        document.removeEventListener('keydown', onKey);
        listening = false;
    }
}
