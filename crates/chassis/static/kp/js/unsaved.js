// The unsaved-changes bar [kpadopt5-time; homelab's Settings staged-changes bar, JobTracker's status form].
//
// A form that is changed but not saved says so, and offers Save and Discard, in the page header while you can see it
// and at the foot of the screen once you have scrolled the header away (Kenny, 2026-10-17: "In de kop, onderaan zodra de
// kop uit beeld is"). It counts what the package already marks, the rows with `data-kp-changed`
// (`.kp-formrow[data-kp-changed]`, `.kp-kv__row[data-kp-changed]`), and on its own marks them as the form is edited:
//
//   <div class="kp-page-header__actions">
//     <div class="kp-unsaved" data-kp-unsaved data-kp-unsaved-for="#settings" data-kp-name="settings"></div>
//   </div>
//
// What it shows: while nothing is changed, "No changes" with Save and Discard off and the reason on each; while something is,
// a chip "2 changes" that opens the list of `key  old → new` (each with its own Revert, and a link that takes you to the
// row), Discard, and "Save 2 changes". Pressing Save fires the cancelable `kp-unsaved-save` with `{ changes }` and puts the bar
// at work (the spinner in Save); the page saves and answers with unsavedSaved(el, { refused: { key: 'why' } }): the changes that
// went through stop counting, the ones refused stay marked and the bar says why ("1 saved, 1 refused"). Discard puts every
// value back and offers Undo for `data-kp-undo-ms` (6000; 0 offers none). Ctrl or Cmd+S saves.
//
// Options (markup, each with a default [KT6]):
//   data-kp-unsaved-for    a selector for the form or the area to watch                   the nearest form, else the page's main
//   data-kp-placement      header | sticky-bottom | header+sticky                        header+sticky
//   data-kp-dock           viewport (fixed to the screen) | container (absolute in the nearest positioned ancestor)   viewport
//   data-kp-scroll-root    a selector: the box that scrolls the header out of view        the window
//   data-kp-track          auto (the bar marks the rows as they are edited) | app (the page marks them)   auto
//   data-kp-warn-leave     browser | app | both | off: the warning on closing the tab / following a link   both
//   data-kp-keep           session | local | off: keep the changes across a reload (local: also across a closed tab) [wish-1028]   session
//   data-kp-keep-exclude   a selector of what is never kept                               [type=password], [data-kp-secret]
//   data-kp-undo-ms        how long Undo is offered after Discard                          6000
//   data-kp-save-label     the Save button's words, {n} for the count                      "Save {n} changes"
//   data-kp-name           the name the kept changes are stored under                      the element's id
//
// Leaving: closing the tab asks the browser's own question; following a link inside the page fires the cancelable
// `kp-unsaved-leave` with `{ href }` and, if the page does not answer it, the package's confirmation dialog. Kept changes
// are restored on the next load with a toast ("2 changes kept from before you left"); a secret is never kept.
// Where the kept changes go [wish-1028, chassis-rs 20]: `sessionStorage` by default, `localStorage` with `data-kp-keep="local"`, or any
// browser `Storage` a consumer hands in, once for the page with configureUnsaved({ storage }) (the way configureRemember does it) or
// for one call with attachUnsaved(root, { storage }). `storage: null` keeps nothing. Browser storage only: a Storage-shaped object a
// page writes itself works too, nothing here talks to a server.
// Nothing runs on import; attachUnsaved(root) returns a detach.
//
// The module is a facade: the bar is `UnsavedController` (closure-pattern B, js/controller.js) in `js/unsaved/`, one file per concern.

import { attachAll, controllerOf } from './controller.js';
import { UNSAVED } from './unsaved/config.js';
import { UnsavedController } from './unsaved/controller.js';

export {
    configureUnsaved,
    UNSAVED,
    UNSAVED_CHANGE_EVENT,
    UNSAVED_SAVE_EVENT,
    UNSAVED_DISCARD_EVENT,
    UNSAVED_UNDO_EVENT,
    UNSAVED_LEAVE_EVENT,
    UNSAVED_REVERT_EVENT,
} from './unsaved/config.js';

/** @typedef {import('./unsaved/config.js').UnsavedConfig} UnsavedConfig */
/** @typedef {import('./unsaved/config.js').UnsavedChange} UnsavedChange */
/** @typedef {import('./unsaved/config.js').UnsavedHandle} UnsavedHandle */

/** The handle of an attached bar. @param {Element} element */
export function unsaved(element) {
    return controllerOf(element, UnsavedController)?.handle ?? null;
}

/**
 * The page's answer to Save: the changes that went through stop counting, those in `refused` (their key and the
 * reason) stay marked and the bar says why.
 * @param {Element} element @param {{ refused?: Record<string, string> }} [result]
 */
export function unsavedSaved(element, result) {
    unsaved(element)?.saved(result);
}

/**
 * Take what the form holds now as the saved values: nothing counts as changed.
 * @param {Element} element
 */
export function markUnsavedClean(element) {
    unsaved(element)?.markClean();
}

/**
 * Put every changed value back, offering Undo, as Discard does.
 * @param {Element} element
 */
export function discardUnsaved(element) {
    unsaved(element)?.discard();
}

/**
 * Put the bar at work (Save shows the spinner) or at rest, without the page's answer.
 * @param {Element} element @param {boolean} saving
 */
export function setUnsavedSaving(element, saving) {
    unsaved(element)?.setSaving(saving);
}

/**
 * Wire every unsaved-changes bar under `root`.
 * @param {ParentNode} [root]
 * @param {UnsavedConfig} [options] `storage`: where this call's bars keep their changes (a browser Storage, or null for nowhere)
 * @returns {() => void} detach
 */
export const attachUnsaved = (root = document, options = {}) => attachAll(root, UNSAVED, UnsavedController, options);
