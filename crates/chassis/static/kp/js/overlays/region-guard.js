// The leave guard of an editor that is not a dialog [habits-1103]: a page's editor or a side panel with a changed form holds Back and a reload.
//
// Opt-in with `data-kp-region-guard` on the editor's box (`off` turns it off again). The form counts as changed once a value
// differs from what it held just before the first edit inside the box (a key, a press, typing), read as the dialog guard reads
// it (js/overlays/guard-fields.js; `data-kp-untracked` leaves a field out); a submit inside counts as saved. While a visible
// guarded region is changed, the browser's own `beforeunload` prompt stands for a reload or a closed tab and the Back button is
// held: the move is undone, the package's "Discard your changes?" asks, and Discard replays the move (js/overlays/dialog-leave.js,
// the same hold the dialog guard uses). The cancelable `kp-dialog-guard-leave` `{ dialog: region, region, delta }` fires on the
// region first, for a router that asks itself. `whenRegionFree(region, go)` is the way for the app's own Close or route change;
// `markRegionSaved(region)` says the form is saved as it stands. The window listeners start with attachDialogGuards().
import { openDiscardQuestion } from './discard-question.js';
import { readForm } from './guard-fields.js';

/** A box that guards its form. */
export const REGION_GUARD = '[data-kp-region-guard]:not([data-kp-region-guard="off"], dialog)';

/** What a region held before its first edit. @type {WeakMap<Element, string>} */
const before = new WeakMap();
/** Regions whose question is open. @type {WeakSet<Element>} */
const asking = new WeakSet();
/** Regions Discard let go of, until their next edit. @type {WeakSet<Element>} */
const released = new WeakSet();

/** Whether the region's form changed since just before its first edit. @param {Element} region */
export function regionChanged(region) {
    const was = before.get(region);
    return was !== undefined && was !== readForm(region);
}

/** The form counts as saved as it stands now: leaving asks nothing until it changes again. @param {Element} region */
export function markRegionSaved(region) {
    before.set(region, readForm(region));
}

/** Forget the region's edits and its Discard: the next edit starts a new count (an editor that moved to another row). @param {Element} region */
export function forgetRegionEdits(region) {
    before.delete(region);
    released.delete(region);
}

/** The visible guarded region whose form changed and that is not let go, if any. */
export function heldRegion() {
    for (const region of document.querySelectorAll(REGION_GUARD)) {
        if (region instanceof HTMLElement && region.getClientRects().length > 0 && !released.has(region) && regionChanged(region)) return region;
    }
    return null;
}

/** Ask "Discard your changes?"; Discard lets the region go and runs `go`. @param {HTMLElement} region @param {() => void} go */
function ask(region, go) {
    if (asking.has(region)) return;
    asking.add(region);
    const focused = document.activeElement;
    const opened = openDiscardQuestion(focused instanceof HTMLElement && region.contains(focused) ? focused : region, {
        onAccept: () => {
            asking.delete(region);
            released.add(region);
            go();
        },
        onCancel: () => asking.delete(region),
    });
    if (!opened.open) asking.delete(region);
}

/**
 * Run `go` at once when the region may let its form go, else ask first and run it on Discard.
 * @param {HTMLElement} region @param {() => void} go
 * @returns {boolean} whether `go` ran at once
 */
export function whenRegionFree(region, go) {
    if (!region.matches(REGION_GUARD) || released.has(region) || !regionChanged(region)) {
        go();
        return true;
    }
    ask(region, go);
    return false;
}

/** The leave guard's question for a held region. @param {HTMLElement} region @param {() => void} go */
export function regionLeave(region, go) {
    ask(region, go);
}

/** The first edit inside a guarded region: note what it held just before; an edit after Discard starts a new count. @param {Event} event */
function onEdit(event) {
    const region = event.target instanceof Element ? event.target.closest(REGION_GUARD) : null;
    if (!region) return;
    if (released.has(region)) forgetRegionEdits(region);
    if (!before.has(region)) before.set(region, readForm(region));
}

/** A submit is a save. @param {Event} event */
function onSubmit(event) {
    const region = event.target instanceof Element ? event.target.closest(REGION_GUARD) : null;
    if (region) markRegionSaved(region);
}

/** The window listeners the region guard needs, in the capture phase. @type {[string, (event: Event) => void][]} */
export const REGION_LISTENERS = [
    ['pointerdown', onEdit],
    ['keydown', onEdit],
    ['beforeinput', onEdit],
    ['submit', onSubmit],
];
