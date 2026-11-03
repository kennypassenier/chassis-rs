// The close guard's reach past the dialog [habits-1102]: Back (history navigation) and a reload or closed tab.
//
// While a guarded dialog is open with a changed form, the browser's own `beforeunload` prompt stands for a reload, a closed
// tab or a followed link, and a history move (the Back button) is held: the move is undone, the package's confirmation asks
// "Discard your changes?", and Discard replays the move. Opt-in exactly as the guard is (`data-kp-dialog-guard` on the
// dialog); a page without one pays nothing. The cancelable `kp-dialog-guard-leave` `{ dialog, delta }` fires on the dialog
// first, for an app whose router asks itself (`event.preventDefault()` leaves the move to it).
//
// The size of a move comes from the Navigation API where the browser has it (`currententrychange`: -1 for Back, 1 for
// Forward, more for a jump in the history list); without it a move counts as one step back.

/** The event a page can cancel to answer a history move itself. */
export const DIALOG_LEAVE_EVENT = 'kp-dialog-guard-leave';

/**
 * Start the leave guard.
 * @param {() => HTMLDialogElement | null} held the open guarded dialog whose form changed, if any
 * @param {(dialog: HTMLDialogElement, go: () => void) => void} ask asks the package's question, runs `go` on Discard
 * @returns {() => void} detach
 */
export function attachDialogLeave(held, ask) {
    let lastDelta = -1;
    let undoing = false;
    let replaying = false;

    /** @param {Event} event */
    const onUnload = (event) => {
        if (!held()) return;
        event.preventDefault();
        /** @type {BeforeUnloadEvent} */ (event).returnValue = '';
    };
    /** @param {Event} event */
    const onEntry = (event) => {
        const from = /** @type {{ from?: { index: number } }} */ (event).from;
        const now = window.navigation?.currentEntry;
        if (!undoing && !replaying && from && now) lastDelta = now.index - from.index;
    };
    /** @param {Event} event */
    const onPop = (event) => {
        if (undoing) {
            undoing = false;
            event.stopImmediatePropagation();
            return;
        }
        const dialog = replaying ? null : held();
        replaying = false;
        if (!dialog) return;
        const delta = lastDelta || -1;
        if (!dialog.dispatchEvent(new CustomEvent(DIALOG_LEAVE_EVENT, { bubbles: true, cancelable: true, detail: { dialog, delta } }))) return;
        event.stopImmediatePropagation();
        undoing = true;
        window.history.go(-delta);
        ask(dialog, () => {
            replaying = true;
            window.history.go(delta);
        });
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('popstate', onPop, true);
    window.navigation?.addEventListener('currententrychange', onEntry);
    return () => {
        window.removeEventListener('beforeunload', onUnload);
        window.removeEventListener('popstate', onPop, true);
        window.navigation?.removeEventListener('currententrychange', onEntry);
    };
}
