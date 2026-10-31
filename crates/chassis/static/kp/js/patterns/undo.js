// One optimistic action with an undo [TH26]: the row goes at once, a toast offers Undo, and only when its window closes is it real.
import { Controller } from '../controller.js';
import { toast } from '../overlays.js';
import { getStrings } from '../strings.js';
import { COMMIT_EVENT, UNDO_EVENT, UNDO_MS } from './constants.js';
/** @typedef {import('./types.js').ActionDetail} ActionDetail */

/** One undo button: how long its window is, and every action still inside its window, so detach can settle it. */
export class UndoControl extends Controller {
    /** @param {HTMLElement} host @param {{ undoMs?: number, undoClassName?: string }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.ms = Number.parseInt(host.dataset.kpUndoMs ?? '', 10) || (options.undoMs ?? UNDO_MS);
        this.undoClassName = options.undoClassName ?? 'kp-button kp-button--ghost';
        /** The cancels of the actions still inside their window. @type {Set<() => void>} */
        this.inFlight = new Set();
    }

    connect() {
        const button = this.host;
        button.dataset.kpUndoAttached = '';
        // Nothing commits after detach: a row still in its window comes back, and its toast goes.
        this.own(() => {
            for (const cancel of this.inFlight) cancel();
            delete button.dataset.kpUndoAttached;
        });
        this.listen(button, 'click', () => this.act());
    }

    /** What goes: the element the consumer named by selector, the nearest marked ancestor, the row, or the parent. */
    targetOf() {
        const button = this.host;
        const selector = button.dataset.kpUndoSelector;
        return (selector ? button.closest(selector) : null) ?? button.closest('[data-kp-undo-target]') ?? button.closest('tr') ?? button.parentElement;
    }

    /**
     * Optimistic: the row goes now. Waiting for the server first is what makes an interface feel slow, and the undo is what makes
     * going first safe.
     */
    act() {
        const button = this.host;
        const target = this.targetOf();
        if (!(target instanceof HTMLElement)) return;
        const key = target.dataset.kpRowKey ?? target.dataset.kpKey ?? (target.id || null);
        target.hidden = true;
        target.dataset.kpUndoPending = '';
        const restore = () => {
            target.hidden = false;
            delete target.dataset.kpUndoPending;
        };
        /** @type {ActionDetail} */
        const detail = { target, button, key, restore };
        const action = { settled: false, timer: 0, cancel: () => {} };
        /** Settle the action once: the first of undo, commit and cancel wins. */
        const settle = () => {
            if (action.settled) return false;
            action.settled = true;
            this.inFlight.delete(action.cancel);
            clearTimeout(action.timer);
            return true;
        };
        const message = this.offer(() => {
            if (!settle()) return;
            restore();
            message.dismiss();
            target.dispatchEvent(new CustomEvent(UNDO_EVENT, { bubbles: true, detail }));
        });
        action.timer = window.setTimeout(() => {
            if (!settle()) return;
            delete target.dataset.kpUndoPending;
            // Only now is it real. The consumer deletes here, so a click that was taken back never reached the server — and
            // restore() is in the detail for the delete the server refuses.
            target.dispatchEvent(new CustomEvent(COMMIT_EVENT, { bubbles: true, detail }));
        }, this.ms);
        action.cancel = () => {
            if (!settle()) return;
            restore();
            message.dismiss();
        };
        this.inFlight.add(action.cancel);
    }

    /** The toast with the Undo action, its buttons in the page's look. @param {() => void} undo */
    offer(undo) {
        const button = this.host;
        const message = toast(button.dataset.kpUndoText ?? getStrings().deleted, {
            ms: Number.parseInt(button.dataset.kpUndoToastMs ?? '', 10) || this.ms,
            action: { label: button.dataset.kpUndoLabel ?? getStrings().undo, onClick: undo },
        });
        for (const b of message.querySelectorAll('button')) b.className = this.undoClassName;
        return message;
    }
}
