// A toast with Undo and a visible clock [kpadopt5; homelab's "Undo for 6 s", JobTracker's discard].
//
// After an action, say what happened and offer Undo for a few seconds, instead
// of asking "are you sure?" before. It joins the two halves the package had:
// toast() with an action button (js/overlays.js) and the deferred commit of
// `data-kp-undo-action` (js/patterns.js), and adds the clock that shows how long
// is left.
//
//   undoToast('3 schedules deleted', {
//       commit: () => api.deleteMany(keys),   // runs when the window closes
//       undo: () => rows.restore(),           // runs on Undo
//   });
//
// Two modes. `defer` (default) holds the action back: nothing reaches the
// server until the window closes, and Undo only has to put the rows back.
// `revert` is for an action already done: Undo calls the page's reverse.
//
// Options, as arguments and as attributes on <html> or on the toast region
// (`data-kp-undo-ms` and so on):
//
//   ms       how long Undo is offered (default 6000; 0 = no undo, the action is committed at once)
//   mode     `defer` (default) | `revert`
//   clock    `ring` (default) | `bar` | `text` | `none`, `data-kp-undo-clock`; the toast says the seconds left in words once, not on every tick
//   key      the key that undoes the newest toast (default `Mod+Z`; false for none); never while typing in a field
//   leave    what a pending action does when the page is left: `carry` (default) keeps the toast across an in-app navigation and commits on a
//            full page load; `commit`; `cancel`
//   max      how many toasts stand at once (default 3); the oldest is committed when a newer one pushes it out
//
// The toast stops its clock while the pointer or the focus is on it and goes on
// where it stopped. Esc on it, or its close, accepts the action now. A commit
// that fails turns the toast into the problem ("Not done: why") and calls
// `restore` (default `undo`), so the row comes back. The clock steps once a
// second under reduced motion.
//
// States, on the toast as `data-kp-undo-state`: counting, committing, failed,
// undone, done; `data-kp-paused` while it is held.
//
// Each toast is one UndoRun controller (js/undo-toast/run.js over js/undo-toast/core.js, on js/controller.js; the toast element is its host); the
// parts are listed in js/README.md.

import { attachOne } from './controller.js';
import { toast } from './overlays.js';
import { getStrings } from './strings.js';
import { buildBody, readSettings } from './undo-toast/build.js';
import { UndoRun } from './undo-toast/run.js';
import { UNDO_TOAST } from './undo-toast/values.js';

export { UNDO_TOAST, UNDO_TOAST_EVENT, UNDO_RESTORED_MS, UNDO_MAX } from './undo-toast/values.js';

/**
 * @typedef {object} UndoToastOptions
 * @property {() => unknown | Promise<unknown>} [commit] runs when the window closes (mode `defer`); a rejection is a failure
 * @property {() => unknown} [undo] runs on Undo
 * @property {() => unknown} [restore] runs when a commit failed (default `undo`)
 * @property {number} [ms] the window; 0 commits at once
 * @property {'defer' | 'revert'} [mode]
 * @property {'ring' | 'bar' | 'text' | 'none'} [clock]
 * @property {string | false} [key] `Mod+Z`
 * @property {'carry' | 'commit' | 'cancel'} [leave]
 * @property {number} [max]
 * @property {string} [failed] the toast's line when the commit fails, instead of "Not done: why"
 * @property {string} [restored] the toast's line after Undo, instead of "Restored"
 * @property {HTMLElement | null} [region]
 */

/**
 * @typedef {object} UndoToast
 * @property {HTMLElement & { dismiss: () => void }} toast
 * @property {() => 'counting' | 'committing' | 'failed' | 'undone' | 'done'} state
 * @property {() => void} undo undo now
 * @property {() => Promise<void>} accept commit now
 * @property {Promise<'committed' | 'undone' | 'failed' | 'left'>} done settles with how it ended
 */

/**
 * Show a toast with Undo and a clock.
 * @param {string} text what happened: "3 schedules deleted"
 * @param {UndoToastOptions} [options]
 * @returns {UndoToast}
 */
export function undoToast(text, options = {}) {
    const settings = readSettings(options);
    const ui = buildBody(document, text, settings);
    /** @type {UndoRun | undefined} */
    let run;
    // `ms: 0` for toast(): the clock is this module's, so it can stop and go on where it stopped.
    const el = toast(ui.body, {
        ms: 0,
        region: settings.region,
        pause: false,
        className: `kp-toast ${UNDO_TOAST}`,
        action: settings.ms > 0 ? { label: getStrings().undoToastUndo, onClick: () => run?.undo() } : undefined,
        close: false,
    });
    run = attachOne(el, UndoRun, { options, settings, ui });
    if (!run) throw new Error('The undo toast could not be set up; the cause was reported.');
    return run.handle;
}
