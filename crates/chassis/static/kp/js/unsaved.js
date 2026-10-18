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
//   data-kp-keep           session | off: keep the changes across a reload                 session
//   data-kp-keep-exclude   a selector of what is never kept                               [type=password], [data-kp-secret]
//   data-kp-undo-ms        how long Undo is offered after Discard                          6000
//   data-kp-save-label     the Save button's words, {n} for the count                      "Save {n} changes"
//   data-kp-name           the name the kept changes are stored under                      the element's id
//
// Leaving: closing the tab asks the browser's own question; following a link inside the page fires the cancelable
// `kp-unsaved-leave` with `{ href }` and, if the page does not answer it, the package's confirmation dialog. Kept changes
// are restored on the next load with a toast ("2 changes kept from before you left"); a secret is never kept.
// Nothing runs on import; attachUnsaved(root) returns a detach.

import { getStrings } from './strings.js';
import { toast } from './overlays.js';
import { openConfirmation } from './components.js';
import { attachMenuButtons, setMenu, MENU_SELECT_EVENT } from './menu-button.js';
import { raiseOverlay, placeBlockSide } from './top-layer.js';
import { arriveShown, playClose, stopClose } from './motion.js';

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

const ROW = '.kp-formrow, .kp-kv__row, [data-kp-row]';
const CONTROL = 'input:not([type="hidden"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="image"]), select, textarea';

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

/** @type {WeakMap<Element, UnsavedHandle>} */
const HANDLES = new WeakMap();

/** The handle of an attached bar. @param {Element} element */
export function unsaved(element) {
    return HANDLES.get(element) ?? null;
}

/**
 * The page's answer to Save: the changes that went through stop counting, those in `refused` (their key and the
 * reason) stay marked and the bar says why.
 * @param {Element} element @param {{ refused?: Record<string, string> }} [result]
 */
export function unsavedSaved(element, result) {
    HANDLES.get(element)?.saved(result);
}

/**
 * Take what the form holds now as the saved values: nothing counts as changed.
 * @param {Element} element
 */
export function markUnsavedClean(element) {
    HANDLES.get(element)?.markClean();
}

/**
 * Put every changed value back, offering Undo, as Discard does.
 * @param {Element} element
 */
export function discardUnsaved(element) {
    HANDLES.get(element)?.discard();
}

/**
 * Put the bar at work (Save shows the spinner) or at rest, without the page's answer.
 * @param {Element} element @param {boolean} saving
 */
export function setUnsavedSaving(element, saving) {
    HANDLES.get(element)?.setSaving(saving);
}

let seq = 0;

/** What a control holds, as a string; a radio group by its checked value. @param {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} c */
function readValue(c) {
    if (c instanceof HTMLInputElement && c.type === 'checkbox') return c.checked ? 'on' : 'off';
    if (c instanceof HTMLInputElement && c.type === 'radio') {
        const group = c.name
            ? [...(c.form ?? c.ownerDocument).querySelectorAll(`input[type="radio"]`)].filter(
                  (r) => /** @type {HTMLInputElement} */ (r).name === c.name,
              )
            : [c];
        return /** @type {HTMLInputElement | undefined} */ (group.find((r) => /** @type {HTMLInputElement} */ (r).checked))?.value ?? '';
    }
    return c.value;
}

/**
 * What the markup says a control holds (`value`, `checked`, `selected` as written): the saved state, which a browser's own
 * restoring of a reloaded form does not touch.
 * @param {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} c
 */
function readDefault(c) {
    if (c instanceof HTMLInputElement && c.type === 'checkbox') return c.defaultChecked ? 'on' : 'off';
    if (c instanceof HTMLInputElement && c.type === 'radio') {
        const group = c.name
            ? [...(c.form ?? c.ownerDocument).querySelectorAll(`input[type="radio"]`)].filter(
                  (r) => /** @type {HTMLInputElement} */ (r).name === c.name,
              )
            : [c];
        return /** @type {HTMLInputElement | undefined} */ (group.find((r) => /** @type {HTMLInputElement} */ (r).defaultChecked))?.value ?? '';
    }
    if (c instanceof HTMLSelectElement) return ([...c.options].find((o) => o.defaultSelected) ?? c.options[0])?.value ?? '';
    return c instanceof HTMLInputElement ? c.defaultValue : c.defaultValue;
}

/** Put a value back into a control. @param {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} c @param {string} value */
function writeValue(c, value) {
    if (c instanceof HTMLInputElement && c.type === 'checkbox') c.checked = value === 'on';
    else if (c instanceof HTMLInputElement && c.type === 'radio') {
        const group = [...(c.form ?? c.ownerDocument).querySelectorAll(`input[type="radio"]`)].filter(
            (r) => /** @type {HTMLInputElement} */ (r).name === c.name,
        );
        for (const r of group) /** @type {HTMLInputElement} */ (r).checked = /** @type {HTMLInputElement} */ (r).value === value;
    } else c.value = value;
}

/** Tell the page and the tracker that a control was changed by a script. @param {Element} c */
function fire(c) {
    c.dispatchEvent(new Event('input', { bubbles: true }));
    c.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Wire every unsaved-changes bar under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachUnsaved(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(UNSAVED) ? [root] : []),
        ...root.querySelectorAll(UNSAVED),
    ]);
    for (const el of found) {
        if (HANDLES.has(el)) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const win = doc.defaultView ?? window;
        const id = el.id || `kp-unsaved-${++seq}`;
        const scopeSelector = el.dataset.kpUnsavedFor;
        const scope = /** @type {HTMLElement} */ (
            (scopeSelector ? doc.querySelector(scopeSelector) : null) ?? el.closest('form') ?? doc.querySelector('main') ?? doc.body
        );
        const placement =
            el.dataset.kpPlacement === 'header' || el.dataset.kpPlacement === 'sticky-bottom' ? el.dataset.kpPlacement : 'header+sticky';
        const dockInContainer = el.dataset.kpDock === 'container';
        const scrollRoot = el.dataset.kpScrollRoot ? doc.querySelector(el.dataset.kpScrollRoot) : null;
        const auto = el.dataset.kpTrack !== 'app';
        const warn = ['browser', 'app', 'off'].includes(el.dataset.kpWarnLeave ?? '') ? el.dataset.kpWarnLeave : 'both';
        const keepOn = el.dataset.kpKeep !== 'off';
        const exclude = el.dataset.kpKeepExclude ?? '[type="password"], [data-kp-secret]';
        const undoMs = el.dataset.kpUndoMs === undefined ? 6000 : Math.max(0, Number(el.dataset.kpUndoMs) || 0);
        const saveLabel = el.dataset.kpSaveLabel;
        const storeKey = `kp-unsaved:${win.location?.pathname ?? ''}:${el.dataset.kpName ?? id}`;
        el.classList.add('kp-unsaved');
        el.dataset.kpUnsavedAttached = '';

        // ── the bar ──
        const bar = doc.createElement('div');
        bar.className = 'kp-unsaved__bar';
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', s.unsavedGroup);
        const none = doc.createElement('span');
        none.className = 'kp-unsaved__none';
        none.textContent = s.unsavedNone;
        const chip = doc.createElement('button');
        chip.type = 'button';
        chip.className = 'kp-badge kp-badge--info kp-unsaved__count';
        chip.setAttribute('aria-haspopup', 'dialog');
        chip.setAttribute('aria-expanded', 'false');
        chip.setAttribute('aria-controls', `${id}-list`);
        chip.hidden = true;
        const actions = doc.createElement('div');
        actions.className = 'kp-unsaved__actions';
        const discard = doc.createElement('button');
        discard.type = 'button';
        discard.className = 'kp-button kp-unsaved__discard';
        discard.textContent = s.unsavedDiscard;
        const save = doc.createElement('button');
        save.type = 'button';
        save.className = 'kp-button kp-button--primary kp-unsaved__save';
        const more = doc.createElement('div');
        more.className = 'kp-menu-button kp-unsaved__more';
        more.dataset.kpMenuButton = '';
        const moreButton = doc.createElement('button');
        moreButton.type = 'button';
        moreButton.className = 'kp-button kp-unsaved__more-button';
        moreButton.textContent = s.unsavedMore;
        const moreMenu = doc.createElement('div');
        moreMenu.className = 'kp-menu kp-menu--rich';
        moreMenu.setAttribute('role', 'menu');
        moreMenu.setAttribute('aria-label', s.unsavedMore);
        more.append(moreButton, moreMenu);
        actions.append(discard, more, save);
        bar.append(none, chip, actions);

        const problem = doc.createElement('div');
        problem.className = 'kp-unsaved__problem';
        problem.hidden = true;
        const live = doc.createElement('p');
        live.className = 'kp-sr-only';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');

        // The list of changes, on the popover plate.
        const panel = doc.createElement('div');
        panel.className = 'kp-popover kp-unsaved__panel';
        panel.id = `${id}-list`;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', s.unsavedListTitle);
        panel.hidden = true;
        const head = doc.createElement('div');
        head.className = 'kp-unsaved__panel-head';
        const headTitle = doc.createElement('p');
        headTitle.className = 'kp-unsaved__panel-title';
        const first = doc.createElement('button');
        first.type = 'button';
        first.className = 'kp-button kp-button--ghost kp-button--sm kp-unsaved__first';
        first.textContent = s.unsavedGoFirst;
        head.append(headTitle, first);
        const list = doc.createElement('ul');
        list.className = 'kp-unsaved__entries';
        panel.append(head, list);
        el.replaceChildren(bar, problem, panel, live);
        const detachMenu = attachMenuButtons(el);

        // ── what is changed ──
        /** @type {Map<HTMLElement, string>} */
        const baseline = new Map();
        const tracked = () =>
            /** @type {HTMLInputElement[]} */ ([...scope.querySelectorAll(CONTROL)]).filter(
                (c) => !el.contains(c) && !c.hasAttribute('data-kp-untracked'),
            );
        const capture = () => {
            baseline.clear();
            for (const c of tracked()) baseline.set(c, readDefault(c));
        };
        capture();

        /** @param {Element} control @returns {HTMLElement} the row that stands for it */
        const rowOf = (control) => /** @type {HTMLElement} */ (control.closest(ROW) ?? control);
        /** @param {HTMLElement} row */
        const labelOf = (row) => {
            if (row.dataset.kpName) return row.dataset.kpName;
            const node = row.querySelector('.kp-formrow__label, dt, .kp-kv__key');
            if (node) {
                const copy = /** @type {HTMLElement} */ (node.cloneNode(true));
                copy.querySelectorAll('small, .kp-sr-only').forEach((n) => n.remove());
                const text = copy.textContent?.replace(/\s+/g, ' ').trim();
                if (text) return text;
            }
            const c = row.matches(CONTROL) ? row : row.querySelector(CONTROL);
            return c?.getAttribute('aria-label') ?? c?.getAttribute('name') ?? c?.id ?? s.unsavedUnnamed;
        };
        /** What a value reads as in the list. @param {HTMLElement} control @param {string} value */
        const show = (control, value) => {
            if (control instanceof HTMLInputElement && control.type === 'password') return s.unsavedSecret;
            if (control.matches('[data-kp-secret]')) return s.unsavedSecret;
            if (control instanceof HTMLInputElement && control.type === 'checkbox') return value === 'on' ? s.unsavedOn : s.unsavedOff;
            if (control instanceof HTMLSelectElement) return [...control.options].find((o) => o.value === value)?.textContent?.trim() ?? value;
            return value === '' ? s.unsavedEmpty : value;
        };
        /** The controls of a row. @param {HTMLElement} row */
        const controlsOf = (row) => /** @type {HTMLInputElement[]} */ (row.matches(CONTROL) ? [row] : [...row.querySelectorAll(CONTROL)]);

        /** Mark and unmark the row of one control, as it is edited. @param {HTMLInputElement} control */
        const track = (control) => {
            if (!baseline.has(control)) baseline.set(control, readDefault(control));
            const row = rowOf(control);
            const mine = controlsOf(row).filter((c) => baseline.has(c));
            const differs = mine.filter((c) => readValue(c) !== baseline.get(c));
            if (differs.length === 0) {
                row.removeAttribute('data-kp-changed');
                row.removeAttribute('data-kp-was');
                if (row.getAttribute('data-kp-state') === 'error') row.removeAttribute('data-kp-state');
            } else {
                row.setAttribute('data-kp-changed', '');
                const c = differs[0];
                row.setAttribute('data-kp-was', show(c, baseline.get(c) ?? ''));
            }
        };

        /** @returns {UnsavedChange[]} */
        const changes = () =>
            /** @type {HTMLElement[]} */ ([...scope.querySelectorAll('[data-kp-changed]')])
                .filter((r) => !el.contains(r))
                .map((row) => {
                    const c = controlsOf(row).find((x) => baseline.has(x) && readValue(x) !== baseline.get(x)) ?? controlsOf(row)[0];
                    return {
                        key: labelOf(row),
                        was: row.dataset.kpWas ?? (c ? show(c, baseline.get(c) ?? '') : ''),
                        now: row.dataset.kpNow ?? (c ? show(c, readValue(c)) : ''),
                        row,
                    };
                });

        // ── state ──
        let saving = false;
        let lastCount = -1;
        let savedCount = 0;

        const saveText = (/** @type {number} */ n) => (saveLabel ? saveLabel.replace('{n}', String(n)) : s.unsavedSave(n));
        const paint = () => {
            const list0 = changes();
            const n = list0.length;
            const dirty = n > 0;
            const state = saving ? 'saving' : dirty ? 'dirty' : 'clean';
            el.dataset.kpState = state;
            bar.dataset.kpState = state;
            none.hidden = dirty;
            chip.hidden = !dirty;
            chip.textContent = s.unsavedCount(n);
            headTitle.textContent = s.unsavedCount(n);
            save.replaceChildren();
            const text = doc.createElement('span');
            text.className = 'kp-button__text';
            text.textContent = dirty ? saveText(n) : s.unsavedSaveNone;
            save.append(text);
            if (saving) {
                const layer = doc.createElement('span');
                layer.className = 'kp-button__busy';
                layer.setAttribute('aria-hidden', 'true');
                const spin = doc.createElement('span');
                spin.className = 'kp-spinner';
                layer.append(spin);
                save.append(layer);
            }
            save.toggleAttribute('data-kp-busy', saving);
            save.toggleAttribute('aria-busy', saving);
            const offReason = saving ? s.unsavedSavingNow : s.unsavedNothingToSave;
            for (const b of [save, discard, moreButton]) {
                const off = saving || !dirty;
                b.setAttribute('aria-disabled', String(off));
                if (off) b.setAttribute('title', offReason);
                else b.removeAttribute('title');
            }
            chip.disabled = saving;
            setMenu(more, [
                {
                    group: '',
                    items: [
                        {
                            label: s.unsavedDiscardChanges,
                            hint: s.unsavedDiscardHint,
                            value: 'discard',
                            danger: true,
                            disabled: saving || !dirty ? offReason : null,
                        },
                        { label: s.unsavedShowChanges, hint: s.unsavedShowHint, value: 'review', disabled: dirty ? null : s.unsavedNothingToSave },
                    ],
                },
            ]);
            list.replaceChildren(
                ...list0.map((ch) => {
                    const li = doc.createElement('li');
                    li.className = 'kp-unsaved__entry';
                    const key = doc.createElement('button');
                    key.type = 'button';
                    key.className = 'kp-unsaved__jump';
                    key.textContent = ch.key;
                    key.title = s.unsavedGoTo(ch.key);
                    key.addEventListener('click', () => jump(ch));
                    const change = doc.createElement('span');
                    change.className = 'kp-unsaved__diff';
                    const was = doc.createElement('del');
                    was.className = 'kp-unsaved__was';
                    was.textContent = ch.was;
                    const arrow = doc.createElement('span');
                    arrow.className = 'kp-unsaved__arrow';
                    arrow.setAttribute('aria-hidden', 'true');
                    arrow.textContent = '→';
                    const now = doc.createElement('ins');
                    now.className = 'kp-unsaved__now';
                    now.textContent = ch.now;
                    change.append(was, arrow, now);
                    const revert = doc.createElement('button');
                    revert.type = 'button';
                    revert.className = 'kp-button kp-button--ghost kp-button--sm kp-unsaved__revert';
                    revert.textContent = s.unsavedRevert;
                    revert.setAttribute('aria-label', s.unsavedRevertOne(ch.key));
                    revert.addEventListener('click', () => revertOne(ch));
                    li.append(key, change, revert);
                    return li;
                }),
            );
            if (n !== lastCount) {
                if (lastCount !== -1) {
                    el.dispatchEvent(new CustomEvent(UNSAVED_CHANGE_EVENT, { bubbles: true, detail: { count: n, changes: list0 } }));
                    clearTimeout(announceTimer);
                    announceTimer = win.setTimeout(() => (live.textContent = n === 0 ? s.unsavedNone : s.unsavedCount(n)), 400);
                }
                lastCount = n;
                keep();
            }
            if (!dirty && !panel.hidden) void closePanel(false);
            dock();
            compact();
        };
        let announceTimer = 0;

        // ── keeping the changes across a reload ──
        const keep = () => {
            if (!keepOn) return;
            try {
                const kept = /** @type {Record<string, string>} */ ({});
                for (const [c, was] of baseline) {
                    const key = c.getAttribute('name') ?? c.id;
                    if (!key || c.matches(exclude) || c.closest(exclude)) continue;
                    const now = readValue(/** @type {HTMLInputElement} */ (c));
                    if (now !== was) kept[key] = now;
                }
                if (Object.keys(kept).length) win.sessionStorage.setItem(storeKey, JSON.stringify(kept));
                else win.sessionStorage.removeItem(storeKey);
            } catch {
                // No storage: the changes are not kept.
            }
        };
        const restore = () => {
            if (!keepOn) return;
            try {
                const raw = win.sessionStorage.getItem(storeKey);
                if (!raw) return;
                const kept = /** @type {Record<string, string>} */ (JSON.parse(raw));
                let n = 0;
                for (const c of baseline.keys()) {
                    const key = c.getAttribute('name') ?? c.id;
                    if (!key || !(key in kept) || c.matches(exclude)) continue;
                    writeValue(/** @type {HTMLInputElement} */ (c), kept[key]);
                    track(/** @type {HTMLInputElement} */ (c));
                    n++;
                }
                if (n > 0) {
                    paint();
                    const total = changes().length;
                    toast(s.unsavedRestored(total), { ms: 6000 });
                    live.textContent = s.unsavedRestored(total);
                }
            } catch {
                // Unreadable: nothing is restored.
            }
        };

        // ── actions ──
        /** @param {UnsavedChange} ch */
        const jump = (ch) => {
            void closePanel(false);
            const target = controlsOf(ch.row)[0] ?? ch.row;
            ch.row.scrollIntoView({ block: 'center', behavior: 'auto' });
            target.focus({ preventScroll: true });
        };
        /** @param {UnsavedChange} ch */
        const revertOne = (ch) => {
            const ok = el.dispatchEvent(
                new CustomEvent(UNSAVED_REVERT_EVENT, { bubbles: true, cancelable: true, detail: { key: ch.key, row: ch.row } }),
            );
            if (!ok) return;
            for (const c of controlsOf(ch.row)) {
                const was = baseline.get(c);
                if (was !== undefined && readValue(c) !== was) {
                    writeValue(c, was);
                    fire(c);
                }
            }
            paint();
            if (changes().length === 0) (chip.hidden ? save : chip).focus();
            else list.querySelector('button')?.focus();
        };
        /** @type {{ control: HTMLInputElement, value: string }[]} */
        let undoStack = [];
        const doDiscard = () => {
            if (saving) return;
            const before = changes();
            if (before.length === 0) return;
            undoStack = [];
            for (const ch of before) {
                for (const c of controlsOf(ch.row)) {
                    const was = baseline.get(c);
                    if (was !== undefined && readValue(c) !== was) {
                        undoStack.push({ control: c, value: readValue(c) });
                        writeValue(c, was);
                        fire(c);
                    }
                }
            }
            clearProblem();
            paint();
            el.dispatchEvent(new CustomEvent(UNSAVED_DISCARD_EVENT, { bubbles: true, detail: { changes: before } }));
            live.textContent = s.unsavedDropped(before.length);
            if (undoMs > 0) {
                const restoreIt = undoStack.slice();
                toast(s.unsavedDropped(before.length), {
                    ms: undoMs,
                    action: {
                        label: s.unsavedUndo,
                        onClick: () => {
                            for (const r of restoreIt) {
                                writeValue(r.control, r.value);
                                fire(r.control);
                            }
                            paint();
                            el.dispatchEvent(new CustomEvent(UNSAVED_UNDO_EVENT, { bubbles: true, detail: { changes: changes() } }));
                            live.textContent = s.unsavedRestoredUndo(changes().length);
                        },
                    },
                });
            }
        };
        const doSave = () => {
            const list0 = changes();
            if (saving || list0.length === 0) return;
            clearProblem();
            const ok = el.dispatchEvent(new CustomEvent(UNSAVED_SAVE_EVENT, { bubbles: true, cancelable: true, detail: { changes: list0 } }));
            if (ok) {
                saving = true;
                savedCount = list0.length;
                paint();
            }
        };
        const clearProblem = () => {
            problem.hidden = true;
            problem.replaceChildren();
            for (const row of scope.querySelectorAll('[data-kp-state="error"][data-kp-changed]')) row.removeAttribute('data-kp-state');
        };

        /** @param {Record<string, string>} refused */
        const showProblem = (refused) => {
            const keys = Object.keys(refused);
            const alert = doc.createElement('div');
            alert.className = 'kp-alert kp-alert--destructive kp-unsaved__alert';
            const body = doc.createElement('div');
            body.className = 'kp-alert__body';
            const title = doc.createElement('strong');
            title.className = 'kp-unsaved__alert-title';
            const savedN = savedCount - keys.length;
            title.textContent = savedN > 0 ? s.unsavedPartly(savedN, keys.length) : s.unsavedRefused(keys.length);
            const ul = doc.createElement('ul');
            ul.className = 'kp-unsaved__alert-list';
            for (const key of keys) {
                const li = doc.createElement('li');
                li.textContent = s.unsavedWhy(key, refused[key]);
                ul.append(li);
            }
            const dismiss = doc.createElement('button');
            dismiss.type = 'button';
            dismiss.className = 'kp-button kp-button--ghost kp-button--sm kp-unsaved__dismiss';
            dismiss.textContent = s.unsavedDismiss;
            dismiss.addEventListener('click', () => {
                problem.hidden = true;
            });
            body.append(title, ul);
            alert.append(body, dismiss);
            problem.replaceChildren(alert);
            problem.setAttribute('role', 'alert');
            problem.hidden = false;
        };

        /** @type {UnsavedHandle} */
        const handle = {
            element: el,
            changes,
            state: () => (saving ? 'saving' : changes().length ? 'dirty' : 'clean'),
            discard: doDiscard,
            saved(result = {}) {
                const refused = result.refused ?? {};
                const keys = Object.keys(refused);
                saving = false;
                const list0 = changes();
                for (const ch of list0) {
                    if (keys.includes(ch.key)) {
                        ch.row.setAttribute('data-kp-state', 'error');
                        continue;
                    }
                    for (const c of controlsOf(ch.row)) baseline.set(c, readValue(c));
                    ch.row.removeAttribute('data-kp-changed');
                    ch.row.removeAttribute('data-kp-was');
                    ch.row.removeAttribute('data-kp-now');
                    if (ch.row.getAttribute('data-kp-state') === 'error') ch.row.removeAttribute('data-kp-state');
                }
                if (keys.length) showProblem(refused);
                else clearProblem();
                paint();
                const savedN = savedCount - keys.length;
                live.textContent = keys.length ? s.unsavedPartly(Math.max(savedN, 0), keys.length) : s.unsavedSavedAll(savedCount);
                if (!keys.length && savedCount > 0) toast(s.unsavedSavedAll(savedCount), { ms: 3000 });
            },
            markClean() {
                for (const ch of changes()) {
                    ch.row.removeAttribute('data-kp-changed');
                    ch.row.removeAttribute('data-kp-was');
                    ch.row.removeAttribute('data-kp-now');
                }
                baseline.clear();
                for (const c of tracked()) baseline.set(c, readValue(c));
                clearProblem();
                saving = false;
                paint();
            },
            setSaving(next) {
                saving = next;
                paint();
            },
        };
        HANDLES.set(el, handle);

        // ── the list panel ──
        /** @type {(() => void) | null} */
        let lower = null;
        const place = (/** @type {HTMLElement} */ p) => {
            const box = chip.getBoundingClientRect();
            const width = p.offsetWidth;
            const left = Math.max(8, Math.min(box.left, doc.documentElement.clientWidth - width - 8));
            p.style.setProperty('left', `${left}px`);
            p.style.setProperty('top', `${box.bottom + 6}px`);
            placeBlockSide(p, box);
        };
        const openPanel = () => {
            if (!panel.hidden || chip.hidden) return;
            stopClose(panel);
            panel.hidden = false;
            lower = raiseOverlay(panel, place);
            chip.setAttribute('aria-expanded', 'true');
            arriveShown(panel);
            (list.querySelector('button') ?? first).focus();
        };
        /** @param {boolean} [refocus] */
        async function closePanel(refocus = true) {
            if (panel.hidden) return;
            chip.setAttribute('aria-expanded', 'false');
            const done = await playClose(panel);
            if (!done) return;
            panel.hidden = true;
            lower?.();
            lower = null;
            stopClose(panel);
            if (refocus) chip.focus();
        }

        // ── where the bar stands ──
        let headerOut = false;
        const dock = () => {
            const dirty = changes().length > 0;
            const want = dirty && (placement === 'sticky-bottom' || (placement === 'header+sticky' && headerOut));
            const docked = el.hasAttribute('data-kp-docked');
            if (want === docked) return;
            if (want) {
                // The place in the header keeps its size while the bar is away, so nothing moves.
                const box = bar.getBoundingClientRect();
                el.style.setProperty('--kp-unsaved-w', `${Math.round(box.width)}px`);
                el.style.setProperty('--kp-unsaved-h', `${Math.round(box.height)}px`);
                el.setAttribute('data-kp-docked', dockInContainer ? 'container' : 'viewport');
                arriveShown(bar);
            } else {
                el.removeAttribute('data-kp-docked');
                el.style.removeProperty('--kp-unsaved-w');
                el.style.removeProperty('--kp-unsaved-h');
            }
        };
        const watch =
            typeof IntersectionObserver === 'undefined' || placement !== 'header+sticky'
                ? null
                : new IntersectionObserver(
                      (entries) => {
                          const entry = entries[entries.length - 1];
                          if (!entry) return;
                          headerOut = !entry.isIntersecting;
                          dock();
                      },
                      { root: scrollRoot, threshold: 0 },
                  );
        watch?.observe(el);
        // Where there is less than 30rem for it (the header's width, or the docked bar's), Discard goes behind More.
        const compact = () => {
            const room = el.hasAttribute('data-kp-docked')
                ? bar.getBoundingClientRect().width
                : (el.closest('.kp-page-header') ?? el.parentElement ?? el).getBoundingClientRect().width;
            bar.toggleAttribute('data-kp-compact', room > 0 && room < 30 * 16);
        };
        const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(compact);
        size?.observe(el.closest('.kp-page-header') ?? el.parentElement ?? el);
        size?.observe(bar);

        // ── events ──
        /** @param {Event} event */
        const onEdit = (event) => {
            if (!auto) return;
            const c = event.target;
            if (!(c instanceof HTMLElement) || !c.matches(CONTROL) || el.contains(c) || c.hasAttribute('data-kp-untracked')) return;
            track(/** @type {HTMLInputElement} */ (c));
            paint();
        };
        const mutation =
            typeof MutationObserver === 'undefined'
                ? null
                : new MutationObserver(() => {
                      if (changes().length !== lastCount) paint();
                  });
        mutation?.observe(scope, { attributes: true, attributeFilter: ['data-kp-changed'], subtree: true });
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
                if (changes().length === 0 && !saving) return;
                event.preventDefault();
                doSave();
            } else if (event.key === 'Escape' && !panel.hidden) {
                event.preventDefault();
                void closePanel();
            }
        };
        /** @param {PointerEvent} event */
        const onOutside = (event) => {
            if (panel.hidden) return;
            const t = /** @type {Node} */ (event.target);
            if (panel.contains(t) || chip.contains(t)) return;
            void closePanel(false);
        };
        /** @param {BeforeUnloadEvent} event */
        const onBeforeUnload = (event) => {
            if ((warn === 'browser' || warn === 'both') && changes().length > 0 && !leaving) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        let leaving = false;
        /** @param {MouseEvent} event */
        const onLink = (event) => {
            if (
                !(warn === 'app' || warn === 'both') ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
            )
                return;
            const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!(a instanceof HTMLAnchorElement) || el.contains(a) || a.target === '_blank' || a.hasAttribute('download') || changes().length === 0)
                return;
            const to = new URL(a.href, win.location.href);
            if (to.origin === win.location.origin && to.pathname === win.location.pathname && to.search === win.location.search) return;
            event.preventDefault();
            const asked = el.dispatchEvent(new CustomEvent(UNSAVED_LEAVE_EVENT, { bubbles: true, cancelable: true, detail: { href: a.href } }));
            if (!asked) return;
            const n = changes().length;
            openConfirmation(a, {
                phrase: s.unsavedLeaveTitle,
                strings: { confirmAccept: s.unsavedLeaveAccept, confirmCancel: s.unsavedLeaveStay, confirmDescription: s.unsavedLeaveText(n) },
                initialFocus: 'cancel',
                onAccept: () => {
                    leaving = true;
                    win.location.href = a.href;
                },
            });
        };
        chip.addEventListener('click', () => (panel.hidden ? openPanel() : void closePanel()));
        first.addEventListener('click', () => {
            const ch = changes()[0];
            if (ch) jump(ch);
        });
        discard.addEventListener('click', doDiscard);
        save.addEventListener('click', doSave);
        more.addEventListener(MENU_SELECT_EVENT, (event) => {
            const value = /** @type {CustomEvent} */ (event).detail?.value;
            if (value === 'discard') doDiscard();
            else if (value === 'review') openPanel();
        });
        scope.addEventListener('input', onEdit);
        scope.addEventListener('change', onEdit);
        doc.addEventListener('keydown', onKey);
        doc.addEventListener('pointerdown', onOutside, true);
        doc.addEventListener('click', onLink, true);
        win.addEventListener('beforeunload', onBeforeUnload);

        // What a browser put back into a reloaded form is an unsaved change too.
        if (auto) for (const c of baseline.keys()) track(/** @type {HTMLInputElement} */ (c));
        restore();
        paint();

        cleanups.push(() => {
            clearTimeout(announceTimer);
            lower?.();
            detachMenu();
            watch?.disconnect();
            size?.disconnect();
            mutation?.disconnect();
            scope.removeEventListener('input', onEdit);
            scope.removeEventListener('change', onEdit);
            doc.removeEventListener('keydown', onKey);
            doc.removeEventListener('pointerdown', onOutside, true);
            doc.removeEventListener('click', onLink, true);
            win.removeEventListener('beforeunload', onBeforeUnload);
            HANDLES.delete(el);
            el.replaceChildren();
            el.removeAttribute('data-kp-docked');
            el.removeAttribute('data-kp-state');
            el.style.removeProperty('--kp-unsaved-w');
            el.style.removeProperty('--kp-unsaved-h');
            delete el.dataset.kpUnsavedAttached;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
