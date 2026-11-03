// The leave guard of an editor that is not a dialog [habits-1103]: a page's editor or a side panel with a changed form holds Back and a reload.
//
// Opt-in with `data-kp-region-guard` on the editor's box (`off` turns it off again). The form counts as changed once a value
// differs from what it held just before the first edit inside the box (a key, a press, typing), read as the dialog guard reads
// it (js/overlays/guard-fields.js; `data-kp-untracked` leaves a field out); a submit inside counts as saved. While a visible
// guarded region is changed, the browser's own `beforeunload` prompt stands for a reload or a closed tab and the Back button is
// held: the move is undone, the package's "Discard your changes?" asks, and Discard replays the move (js/overlays/dialog-leave.js,
// the same hold the dialog guard uses). The cancelable `kp-dialog-guard-leave` `{ dialog: region, region, delta }` fires on the
// region first, for a router that asks itself. `whenRegionFree(region, go)` is the way for the app's own Close or route change;
// `markRegionSaved(region)` says the form is saved as it stands, `markRegionSaved(region, field)` that one field is (an autosave:
// dirty then means "differs from what the server holds"). `setRegionFlush(region, save)` names an async save that runs before
// the question; the question asks only if something is still unsaved, and a rejected save asks too. A leave asks ONCE for every
// changed region and registered editor (js/overlays/page-editors.js). The window listeners start with attachDialogGuards().
import { controlIndex, readForm, readFormValues } from './guard-fields.js';
import { flushUnits, leaveUnits } from './guard-question.js';
import { EDITOR_LISTENERS, editorUnits } from './page-editors.js';

/** A box that guards its form. */
export const REGION_GUARD = '[data-kp-region-guard]:not([data-kp-region-guard="off"], dialog)';

/** What a region held before its first edit. @type {WeakMap<Element, string>} */
const before = new WeakMap();
/** The async save a region runs before the question. @type {WeakMap<Element, () => Promise<unknown>>} */
const flushes = new WeakMap();
/** Regions Discard let go of, until their next edit. @type {WeakSet<Element>} */
const released = new WeakSet();

/** Whether the region's form changed since just before its first edit. @param {Element} region */
export function regionChanged(region) {
    const was = before.get(region);
    return was !== undefined && was !== readForm(region);
}

/**
 * The form counts as saved as it stands now: leaving asks nothing until it changes again. With `field`, only that field is
 * saved (an autosave): the region is changed while any field differs from what it held when last saved.
 * @param {Element} region @param {Element} [field]
 */
export function markRegionSaved(region, field) {
    if (!field) return void before.set(region, readForm(region));
    const was = before.get(region);
    const index = controlIndex(region, field);
    if (was === undefined || index < 0) return; // nothing was edited yet: the next edit takes the snapshot, which includes this value
    const base = JSON.parse(was);
    base[index] = readFormValues(region)[index];
    before.set(region, JSON.stringify(base));
}

/** Name the async save that runs before a leave question; returns the way to remove it. @param {Element} region @param {() => Promise<unknown>} flush */
export function setRegionFlush(region, flush) {
    flushes.set(region, flush);
    return () => void (flushes.get(region) === flush && flushes.delete(region));
}

/** Forget the region's edits and its Discard: the next edit starts a new count (an editor that moved to another row). @param {Element} region */
export function forgetRegionEdits(region) {
    before.delete(region);
    released.delete(region);
}

/** Whether a region holds its form now: visible, changed and not let go. @param {Element} region */
function holding(region) {
    return region instanceof HTMLElement && region.getClientRects().length > 0 && !released.has(region) && regionChanged(region);
}

/** @param {HTMLElement} region @returns {import('./guard-question.js').GuardUnit} */
function unitOf(region) {
    return { el: region, flush: flushes.get(region), release: () => released.add(region) };
}

/**
 * Everything a leave would lose here, as units: the visible changed guarded regions, and the registered editors.
 * @param {{ reload?: boolean }} [options] `reload`: also the editors that survive a screen change
 */
export function regionUnits(options) {
    const regions = [...document.querySelectorAll(REGION_GUARD)].filter(holding).map((r) => unitOf(/** @type {HTMLElement} */ (r)));
    return [...regions, ...editorUnits(options)];
}

/** The first guarded region or editor that holds unsaved work, if any. @param {{ reload?: boolean }} [options] */
export function heldRegion(options) {
    return regionUnits(options)[0]?.el ?? null;
}

/**
 * Run `go` at once when the region may let its form go, else save it (its flush hook), ask if it is still unsaved, and run it
 * on Discard.
 * @param {HTMLElement} region @param {() => void} go
 * @returns {boolean} whether `go` ran at once
 */
export function whenRegionFree(region, go) {
    return leaveUnits(() => (region.matches(REGION_GUARD) && holding(region) ? [unitOf(region)] : []), go);
}

/** The leave guard's question (Back): once for every changed region and editor. @param {HTMLElement} _box @param {() => void} go */
export function regionLeave(_box, go) {
    leaveUnits(regionUnits, go);
}

/** A reload cannot wait for a save: every changed region and editor starts its flush, the browser's prompt stands. */
function onUnload() {
    void flushUnits(regionUnits({ reload: true }));
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
    ['beforeunload', onUnload],
    ...EDITOR_LISTENERS,
];
