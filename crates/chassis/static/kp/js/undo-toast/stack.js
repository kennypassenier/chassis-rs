// The toasts that are still counting or committing, and the one key that undoes the newest: state the toasts of a page share.

/** @typedef {import('../undo-toast.js').UndoToast} UndoToast */
/** @typedef {{ handle: UndoToast, key: string | false }} StackEntry */

/** The toasts still counting or committing, oldest first. @type {StackEntry[]} */
export const live = [];
let listening = false;

const isMac = () =>
    typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(/** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '');

/** @param {string} key `Mod+Z` */
export const keyName = (key) => key.replace(/^mod\+/i, isMac() ? '⌘' : 'Ctrl+');

/** @param {KeyboardEvent} event */
function onKey(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'z') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    for (let i = live.length - 1; i >= 0; i -= 1) {
        const entry = /** @type {StackEntry} */ (live[i]);
        if (entry.key === false || entry.handle.state() !== 'counting') continue;
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
