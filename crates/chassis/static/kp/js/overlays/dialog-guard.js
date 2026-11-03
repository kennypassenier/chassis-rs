// The close guard of a dialog or a drawer [uxdialogs1101]: a changed form asks "Keep editing / Discard" on every way out.
//
// Opt-in with `data-kp-dialog-guard` on the `<dialog>` (`off` turns it off again). The form counts as changed once a value
// differs from what it held just before the first edit (a key, a press or typing inside the dialog), so a dialog the page
// fills after it opened starts clean. The values are read as js/unsaved reads them (`readValue`, a quantity, a time field
// or a tag input as one value); a field marked `data-kp-untracked` is left out. A submit inside the dialog counts as saved.
//
// The ways out it holds: a close button (`data-kp-dialog-close` without a value or with `cancel`), Escape and a backdrop
// press (`closedby="any"`, both the browser's `cancel`), `closeDialog()` (js/motion/close.js asks first with
// `kp-dialog-close-request`), a motion-shadowed `dialog.close()`, and a beside drawer's Escape. A close with any other
// value (`save`, `accept`) goes through. The question is the package's confirmation, so `data-kp-dialog-stack="replace"`
// puts it in the dialog's place. `requestDialogClose(dialog)` is the way out for a page's own button. A reload and the
// Back button are held too while the form is changed (js/overlays/dialog-leave.js). An editor that is not a dialog opts in
// with `data-kp-region-guard` (js/overlays/region-guard.js), which this guard's listeners serve.
import { DIALOG_CLOSE_REQUEST_EVENT } from './constants.js';
import { attachDialogLeave } from './dialog-leave.js';
import { openDiscardQuestion } from './discard-question.js';
import { readForm } from './guard-fields.js';
import { REGION_LISTENERS, heldRegion, regionLeave } from './region-guard.js';

/** A dialog that guards its form. */
export const DIALOG_GUARD = 'dialog[data-kp-dialog-guard]:not([data-kp-dialog-guard="off"])';
/** The return values that are a way out; any other is an answer (save, accept) and closes without a question. */
const WAYS_OUT = new Set(['', 'cancel']);

/** What a guarded dialog held before its first edit. @type {WeakMap<HTMLDialogElement, string>} */
const before = new WeakMap();
/** Dialogs whose question is open. @type {WeakSet<HTMLDialogElement>} */
const asking = new WeakSet();
/** Dialogs Discard let go of, until they close. @type {WeakSet<HTMLDialogElement>} */
const released = new WeakSet();

/** Whether the guarded dialog's form changed since just before its first edit. @param {HTMLDialogElement} dialog */
export function dialogChanged(dialog) {
    const was = before.get(dialog);
    return was !== undefined && was !== readForm(dialog);
}

/** The form counts as saved as it stands now: a close asks nothing until it changes again. @param {HTMLDialogElement} dialog */
export function markDialogSaved(dialog) {
    before.set(dialog, readForm(dialog));
}

/** Forget the dialog's edits and its Discard: the next edit starts a new count (a beside drawer that moved to another row). @param {HTMLDialogElement} dialog */
export function forgetDialogEdits(dialog) {
    before.delete(dialog);
    released.delete(dialog);
}

/** Whether a close with `value` must ask first. @param {HTMLDialogElement} dialog @param {string | undefined} value */
function holds(dialog, value) {
    if (!dialog.matches(DIALOG_GUARD) || released.has(dialog) || dialog.hasAttribute('data-kp-confirm-replaced')) return false;
    return WAYS_OUT.has(value ?? '') && dialogChanged(dialog);
}

/** The element focus stands on inside the dialog, else the dialog. @param {HTMLDialogElement} dialog */
function anchorIn(dialog) {
    const focused = document.activeElement;
    return focused instanceof HTMLElement && dialog.contains(focused) ? focused : dialog;
}

/** Ask "Discard your changes?"; Discard lets the dialog go and runs `go`. @param {HTMLDialogElement} dialog @param {() => void} go @param {Element | null} [from] */
function ask(dialog, go, from) {
    asking.add(dialog);
    const anchor = from instanceof HTMLElement && from.getClientRects().length > 0 ? from : anchorIn(dialog);
    const opened = openDiscardQuestion(anchor, {
        onAccept: () => {
            asking.delete(dialog);
            released.add(dialog);
            go();
        },
        onCancel: () => asking.delete(dialog),
    });
    if (!opened.open) asking.delete(dialog);
}

/**
 * Run `go` at once when the dialog may let its form go, else ask first and run it on Discard.
 * @param {HTMLDialogElement} dialog @param {() => void} go @param {{ value?: string, from?: Element | null }} [options]
 * @returns {boolean} whether `go` ran at once
 */
export function whenDialogFree(dialog, go, { value, from = null } = {}) {
    if (asking.has(dialog)) return false;
    if (!holds(dialog, value)) {
        go();
        return true;
    }
    ask(dialog, go, from);
    return false;
}

/** Close the dialog the guarded way: a page's own Cancel or ✕. @param {HTMLDialogElement} dialog @param {string} [value] @param {Element | null} [from] */
export function requestDialogClose(dialog, value, from = null) {
    return whenDialogFree(dialog, () => dialog.close(value), { value, from });
}

/** The first edit inside a guarded dialog: note what it held just before. @param {Event} event */
function onEdit(event) {
    const dialog = event.target instanceof Element ? event.target.closest(DIALOG_GUARD) : null;
    if (dialog instanceof HTMLDialogElement && dialog.open && !before.has(dialog)) before.set(dialog, readForm(dialog));
}

/** Escape or a backdrop press on a guarded dialog. @param {Event} event */
function onCancel(event) {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || dialog.hasAttribute('data-kp-confirm-replaced')) return;
    if (!asking.has(dialog) && !holds(dialog, '')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!asking.has(dialog)) ask(dialog, () => dialog.close(''), document.activeElement);
}

/** closeDialog() asks first. @param {Event} event */
function onRequest(event) {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement)) return;
    const value = /** @type {CustomEvent<{ returnValue?: string }>} */ (event).detail?.returnValue;
    if (asking.has(dialog)) return void event.preventDefault();
    if (!holds(dialog, value)) return;
    event.preventDefault();
    ask(dialog, () => dialog.close(value), document.activeElement);
}

/** A submit is a save; a closed dialog starts clean. @param {Event} event */
function onSubmit(event) {
    const dialog = event.target instanceof Element ? event.target.closest(DIALOG_GUARD) : null;
    if (dialog instanceof HTMLDialogElement) markDialogSaved(dialog);
}
/** @param {Event} event */
function onClose(event) {
    const dialog = event.target;
    if (dialog instanceof HTMLDialogElement && dialog.matches(DIALOG_GUARD)) forgetDialogEdits(dialog);
}

/** @type {[string, (event: Event) => void][]} */
const LISTENERS = [
    ['pointerdown', onEdit],
    ['keydown', onEdit],
    ['beforeinput', onEdit],
    ['cancel', onCancel],
    [DIALOG_CLOSE_REQUEST_EVENT, onRequest],
    ['submit', onSubmit],
    ['close', onClose],
];
let attached = 0;
/** @type {(() => void) | null} */
let stopLeave = null;

/** The open guarded dialogs whose form changed and that are not let go. @returns {HTMLDialogElement[]} */
function heldDialogs() {
    /** @type {HTMLDialogElement[]} */
    const out = [];
    for (const d of document.querySelectorAll(DIALOG_GUARD)) if (d instanceof HTMLDialogElement && d.open && !released.has(d) && dialogChanged(d)) out.push(d);
    return out;
}

/** The changed open guarded dialogs as units of the page-wide leave check (js/overlays/page-guard.js). @returns {import('./guard-question.js').GuardUnit[]} */
export function dialogUnits() {
    return heldDialogs().map((dialog) => ({ el: dialog, release: () => released.add(dialog) }));
}

/** The open guarded dialog whose form changed and that is not let go, if any. */
function heldDialog() {
    return heldDialogs()[0] ?? null;
}

/**
 * Start the guard for every `data-kp-dialog-guard` dialog on the page (window listeners, in the capture phase, once
 * however often it is called). attachDialogs() calls it; a page that opens its dialogs itself calls it once.
 * @returns {() => void} detach
 */
export function attachDialogGuards() {
    if (attached++ === 0) {
        for (const [type, listener] of [...LISTENERS, ...REGION_LISTENERS]) window.addEventListener(type, listener, true);
        stopLeave = attachDialogLeave(
            () => heldDialog() ?? heldRegion(),
            (box, go) => (box instanceof HTMLDialogElement ? void whenDialogFree(box, go) : regionLeave(box, go)),
            () => heldDialog() ?? heldRegion({ reload: true }),
        );
    }
    let done = false;
    return () => {
        if (done) return;
        done = true;
        if (--attached > 0) return;
        for (const [type, listener] of [...LISTENERS, ...REGION_LISTENERS]) window.removeEventListener(type, listener, true);
        stopLeave?.();
        stopLeave = null;
    };
}
