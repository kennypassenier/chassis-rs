// What the bar's buttons do: jump to a change, revert one, discard with Undo, save, and take the page's answer to Save.

import { toast } from '../overlays.js';
import { SAVED_TOAST_MS, UNSAVED_DISCARD_EVENT, UNSAVED_REVERT_EVENT, UNSAVED_SAVE_EVENT, UNSAVED_UNDO_EVENT } from './config.js';
import { paintBar } from './paint.js';
import { buildAlert } from './parts.js';
import { fire, readValue, writeValue } from './values.js';

/** @typedef {import('./controller.js').UnsavedController} UnsavedController */
/** @typedef {import('./config.js').UnsavedChange} UnsavedChange */

/** Close the list and take the visitor to the changed row. @param {UnsavedController} ctl @param {UnsavedChange} ch */
export function jumpTo(ctl, ch) {
    void ctl.panel.close(false);
    const target = ctl.tracker.controlsOf(ch.row)[0] ?? ch.row;
    ch.row.scrollIntoView({ block: 'center', behavior: 'auto' });
    target.focus({ preventScroll: true });
}

/** Put one change back, unless the page cancels it. @param {UnsavedController} ctl @param {UnsavedChange} ch */
export function revertOne(ctl, ch) {
    const ok = ctl.el.dispatchEvent(new CustomEvent(UNSAVED_REVERT_EVENT, { bubbles: true, cancelable: true, detail: { key: ch.key, row: ch.row } }));
    if (!ok) return;
    for (const c of ctl.tracker.controlsOf(ch.row)) {
        const was = ctl.tracker.baseline.get(c);
        if (was !== undefined && readValue(c) !== was) {
            writeValue(c, was);
            fire(c);
        }
    }
    paintBar(ctl);
    const { chip, save, list } = ctl.parts;
    if (ctl.tracker.changes().length === 0) (chip.hidden ? save : chip).focus();
    else list.querySelector('button')?.focus();
}

/**
 * Put every changed value back and offer Undo.
 * @param {UnsavedController} ctl
 */
export function discardChanges(ctl) {
    if (ctl.saving) return;
    const before = ctl.tracker.changes();
    if (before.length === 0) return;
    ctl.undoStack = [];
    for (const ch of before) {
        for (const c of ctl.tracker.controlsOf(ch.row)) {
            const was = ctl.tracker.baseline.get(c);
            if (was !== undefined && readValue(c) !== was) {
                ctl.undoStack.push({ control: c, value: readValue(c) });
                writeValue(c, was);
                fire(c);
            }
        }
    }
    clearProblem(ctl);
    paintBar(ctl);
    ctl.el.dispatchEvent(new CustomEvent(UNSAVED_DISCARD_EVENT, { bubbles: true, detail: { changes: before } }));
    ctl.live.textContent = ctl.s.unsavedDropped(before.length);
    if (ctl.settings.undoMs > 0) offerUndo(ctl, before.length);
}

/** The toast that puts the discarded values back. @param {UnsavedController} ctl @param {number} count */
export function offerUndo(ctl, count) {
    const { s } = ctl;
    const restoreIt = ctl.undoStack.slice();
    toast(s.unsavedDropped(count), {
        ms: ctl.settings.undoMs,
        action: {
            label: s.unsavedUndo,
            onClick: () => {
                for (const r of restoreIt) {
                    writeValue(r.control, r.value);
                    fire(r.control);
                }
                paintBar(ctl);
                ctl.el.dispatchEvent(new CustomEvent(UNSAVED_UNDO_EVENT, { bubbles: true, detail: { changes: ctl.tracker.changes() } }));
                ctl.live.textContent = s.unsavedRestoredUndo(ctl.tracker.changes().length);
            },
        },
    });
}

/**
 * Ask the page to save; if it does not cancel, the bar goes to work.
 * @param {UnsavedController} ctl
 */
export function saveChanges(ctl) {
    const changes = ctl.tracker.changes();
    if (ctl.saving || changes.length === 0) return;
    clearProblem(ctl);
    const ok = ctl.el.dispatchEvent(new CustomEvent(UNSAVED_SAVE_EVENT, { bubbles: true, cancelable: true, detail: { changes } }));
    if (ok) {
        ctl.saving = true;
        ctl.savedCount = changes.length;
        paintBar(ctl);
    }
}

/** @param {UnsavedController} ctl */
export function clearProblem(ctl) {
    const { problem } = ctl.parts;
    problem.hidden = true;
    problem.replaceChildren();
    for (const row of ctl.settings.scope.querySelectorAll('[data-kp-state="error"][data-kp-changed]')) row.removeAttribute('data-kp-state');
}

/** @param {UnsavedController} ctl @param {Record<string, string>} refused */
export function showProblem(ctl, refused) {
    const { problem } = ctl.parts;
    const alert = buildAlert(ctl.doc, ctl.s, refused, ctl.savedCount, () => {
        problem.hidden = true;
    });
    problem.replaceChildren(alert);
    problem.setAttribute('role', 'alert');
    problem.hidden = false;
}

/** The page's answer to Save. @param {UnsavedController} ctl @param {{ refused?: Record<string, string> }} [result] */
export function applySaved(ctl, result = {}) {
    const { s } = ctl;
    const refused = result.refused ?? {};
    const keys = Object.keys(refused);
    ctl.saving = false;
    for (const ch of ctl.tracker.changes()) {
        if (keys.includes(ch.key)) {
            ch.row.setAttribute('data-kp-state', 'error');
            continue;
        }
        for (const c of ctl.tracker.controlsOf(ch.row)) ctl.tracker.baseline.set(c, readValue(c));
        ctl.tracker.clearRow(ch.row);
        if (ch.row.getAttribute('data-kp-state') === 'error') ch.row.removeAttribute('data-kp-state');
    }
    if (keys.length) showProblem(ctl, refused);
    else clearProblem(ctl);
    paintBar(ctl);
    const savedN = ctl.savedCount - keys.length;
    ctl.live.textContent = keys.length ? s.unsavedPartly(Math.max(savedN, 0), keys.length) : s.unsavedSavedAll(ctl.savedCount);
    if (!keys.length && ctl.savedCount > 0) toast(s.unsavedSavedAll(ctl.savedCount), { ms: SAVED_TOAST_MS });
}

/**
 * Take what the form holds now as the saved values.
 * @param {UnsavedController} ctl
 */
export function markAllClean(ctl) {
    for (const ch of ctl.tracker.changes()) ctl.tracker.clearRow(ch.row);
    ctl.tracker.adoptCurrent();
    clearProblem(ctl);
    ctl.saving = false;
    paintBar(ctl);
}

/** @param {UnsavedController} ctl @param {boolean} next */
export function setSaving(ctl, next) {
    ctl.saving = next;
    paintBar(ctl);
}
