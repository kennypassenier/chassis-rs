// The unsaved bar's names, fixed numbers, page-wide storage choice and the settings one bar reads from its markup.

/**
 * What one `attachUnsaved` call may hand its bars.
 * @typedef {object} UnsavedConfig
 * @property {Storage | null} [storage] where the changes are kept (null: nowhere)
 * @property {UnsavedShow} [show] the words a value reads as in the list, for an editor the bar cannot word itself [homelab 71]
 */

/**
 * Names a value in the list of changes: what `control` holding `value` reads as, in the page's own words. It is asked for both
 * sides of a row ("was" and "now"); a string is shown, anything else leaves the bar's own wording. A secret is never asked.
 * @callback UnsavedShow
 * @param {HTMLElement} control the tracked control (a mirror input, or a composite field)
 * @param {string} value the value to word: the saved one or the current one
 * @param {HTMLElement} row the row that stands for the control
 * @returns {string | null | undefined}
 */

/** The page-wide default for where kept changes go; `undefined`: the bar's own choice (session or local). @type {{ storage: Storage | null | undefined }} */
export const config = { storage: undefined };

/**
 * Set where every bar keeps its changes, once: a browser `Storage`, or `null` to keep nothing. Without it a bar uses
 * `sessionStorage` (`localStorage` with `data-kp-keep="local"`). A bar attached with its own `storage` option keeps that one [wish-1028].
 * @param {UnsavedConfig} next
 */
export function configureUnsaved(next) {
    if (next.storage !== undefined) config.storage = next.storage;
}

/** An unsaved-changes bar. */
export const UNSAVED = '[data-kp-unsaved]';
/** Fired on the bar when the count changes: `{ count, changes }`. */
export const UNSAVED_CHANGE_EVENT = 'kp-unsaved-change';
/** Fired on the bar, bubbling and cancelable, when Save is pressed: `{ changes }`. */
export const UNSAVED_SAVE_EVENT = 'kp-unsaved-save';
/** Fired on the bar when the changes were discarded: `{ changes }`; and `kp-unsaved-undo` when they were put back. */
export const UNSAVED_DISCARD_EVENT = 'kp-unsaved-discard';
/** Fired on the bar when a discard is undone: `{ changes }`. */
export const UNSAVED_UNDO_EVENT = 'kp-unsaved-undo';
/** Fired on the bar, bubbling and cancelable, when a link would leave a page with unsaved changes: `{ href }`. */
export const UNSAVED_LEAVE_EVENT = 'kp-unsaved-leave';
/** Fired on the bar, bubbling and cancelable, when one change is reverted: `{ key, row }`. */
export const UNSAVED_REVERT_EVENT = 'kp-unsaved-revert';

/** What stands for a changed control: the row it sits in. */
export const ROW = '.kp-formrow, .kp-kv__row, [data-kp-row]';
/** The controls that count as form values (buttons, hidden fields and files do not). */
export const CONTROL =
    'input:not([type="hidden"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="image"]), select, textarea';

/** How long Discard offers Undo unless `data-kp-undo-ms` says otherwise [ms]. */
export const UNDO_MS_DEFAULT = 6000;
/** The pause before a count change is read out, so a burst of edits is announced once [ms]. */
export const ANNOUNCE_DELAY_MS = 400;
/** How long the "restored" toast stays after changes come back from storage [ms]. */
export const RESTORED_TOAST_MS = 6000;
/** How long the "all saved" toast stays [ms]. */
export const SAVED_TOAST_MS = 3000;
/** The gap between the count chip and the list panel under it, and the panel's distance from the window's edge [px]. */
export const PANEL_GAP_PX = 6;
export const PANEL_EDGE_PX = 8;
/** Below this width the bar puts Discard behind More: 30rem at the default font size [px]. */
export const COMPACT_BELOW_PX = 30 * 16;
/** The values a bar may be told to warn about leaving with. */
const WARN_MODES = ['browser', 'app', 'off'];

/**
 * @typedef {object} UnsavedChange
 * @property {string} key the row's name
 * @property {string} was what it was
 * @property {string} now what it is
 * @property {HTMLElement} row the row (or the control) that carries `data-kp-changed`
 */

/**
 * @typedef {object} UnsavedHandle
 * @property {HTMLElement} element
 * @property {() => UnsavedChange[]} changes the changes now
 * @property {() => 'clean' | 'dirty' | 'saving'} state
 * @property {() => void} discard put every value back (with Undo)
 * @property {(result?: { refused?: Record<string, string> }) => void} saved the page's answer to Save
 * @property {() => void} markClean take what the form holds now as the saved values
 * @property {(saving: boolean) => void} setSaving
 */

/** The places a bar may be told to stand. */
const PLACEMENTS = ['header', 'sticky-bottom'];

/**
 * Where a bar stands, from its `data-kp-placement`: read at attach and again whenever the attribute changes [homelab 38].
 * @param {HTMLElement} el the bar
 * @returns {'header' | 'sticky-bottom' | 'header+sticky'}
 */
export function readPlacement(el) {
    const asked = el.getAttribute('data-kp-placement') ?? '';
    return PLACEMENTS.includes(asked) ? /** @type {'header' | 'sticky-bottom'} */ (asked) : 'header+sticky';
}

/**
 * What one bar's markup asks for, each with its default [KT6].
 * @param {HTMLElement} el the bar
 * @param {string} id the bar's id
 */
export function readSettings(el, id) {
    const doc = el.ownerDocument;
    const win = doc.defaultView ?? window;
    const scopeSelector = el.dataset.kpUnsavedFor;
    return {
        scope: /** @type {HTMLElement} */ (
            (scopeSelector ? doc.querySelector(scopeSelector) : null) ?? el.closest('form') ?? doc.querySelector('main') ?? doc.body
        ),
        placement: readPlacement(el),
        dockInContainer: el.dataset.kpDock === 'container',
        scrollRoot: el.dataset.kpScrollRoot ? doc.querySelector(el.dataset.kpScrollRoot) : null,
        auto: el.dataset.kpTrack !== 'app',
        warn: WARN_MODES.includes(el.dataset.kpWarnLeave ?? '') ? el.dataset.kpWarnLeave : 'both',
        keepAttribute: el.dataset.kpKeep,
        exclude: el.dataset.kpKeepExclude ?? '[type="password"], [data-kp-secret]',
        undoMs: el.dataset.kpUndoMs === undefined ? UNDO_MS_DEFAULT : Math.max(0, Number(el.dataset.kpUndoMs) || 0),
        saveLabel: el.dataset.kpSaveLabel,
        storeKey: `kp-unsaved:${win.location?.pathname ?? ''}:${el.dataset.kpName ?? id}`,
    };
}
