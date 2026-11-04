// The toasts that are still counting or committing, and the one key that undoes the newest: state the toasts of a page share.

import { keyName, matchesKeySpec, parseKeySpec } from '../key-spec.js';

/** @typedef {import('../undo-toast.js').UndoToast} UndoToast */
/** @typedef {{ handle: UndoToast, key: string | false, focusKey: string | false, returnTo?: Element | null }} StackEntry */

/** The toasts still counting or committing, oldest first. @type {StackEntry[]} */
export const live = [];
let listening = false;

export { keyName };

/**
 * Whether a key event is the configured key (a key spec, js/key-spec.js: `Mod` is Ctrl or Command; a modifier not named must be up).
 * @param {KeyboardEvent} event @param {string} spec
 */
export const keyMatches = (event, spec) => matchesKeySpec(event, parseKeySpec(spec));

/** The newest toast that can still be undone. @returns {StackEntry | undefined} */
const newest = () => [...live].reverse().find((e) => e.handle.state() === 'counting');

/** Move the focus to the toast's Undo button, remembering where it was; true when it moved. @param {StackEntry} entry */
function focusUndo(entry) {
    const button = /** @type {HTMLElement | null} */ (entry.handle.toast.querySelector('[data-kp-undo-button]'));
    if (!button) return false;
    const was = document.activeElement;
    if (was !== button) entry.returnTo = was instanceof HTMLElement && !entry.handle.toast.contains(was) ? was : null;
    button.focus();
    return true;
}

/** @param {KeyboardEvent} event */
function onKey(event) {
    const top = newest();
    // The focus key holds Alt, types nothing, so it works from a field too.
    if (top && top.focusKey !== false && keyMatches(event, top.focusKey) && focusUndo(top)) {
        event.preventDefault();
        return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!top || top.key === false) return;
    if (!keyMatches(event, top.key)) return;
    event.preventDefault();
    top.handle.undo();
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
    const entry = at >= 0 ? live[at] : undefined;
    if (at >= 0) live.splice(at, 1);
    // The focus was on the toast that is going: give it back to where it came from.
    const back = entry?.returnTo;
    if (back?.isConnected && handle.toast.contains(document.activeElement)) /** @type {HTMLElement} */ (back).focus();
    if (live.length === 0 && listening) {
        document.removeEventListener('keydown', onKey);
        listening = false;
    }
}
