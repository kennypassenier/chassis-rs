// One wired checklist: the ticks (with the focus going on down the list by key), Check all, Uncheck all, Clear checked
// and its Undo.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { emit, endUndo } from './api.js';
import { part, say } from './parts.js';
import { glide, render } from './render.js';
import { shownOrder } from './rows.js';
import { CHECKLIST_CLEAR_EVENT, CHECKLIST_EVENT, CHECKLIST_UNDO_EVENT, CHECKLIST_UNDO_MS, ITEMS, UNDO, sinks } from './state.js';

/** @typedef {import('../checklist.js').ChecklistItem} ChecklistItem */

export class Checklist extends Controller {
    /** @param {HTMLElement} list */
    constructor(list) {
        super(list);
        /** Whether the last press on a row came from a key: then a ticked row's place goes to the next open one. */
        this.byKey = false;
    }

    connect() {
        const list = this.host;
        if (!ITEMS.has(list)) ITEMS.set(list, []);
        render(list);
        this.listen(list, 'keydown', (event) => (this.byKey = /** @type {KeyboardEvent} */ (event).key === ' ' || /** @type {KeyboardEvent} */ (event).key === 'Enter'), true);
        this.listen(list, 'pointerdown', () => (this.byKey = false), true);
        this.listen(list, 'change', (event) => this.onChange(event));
        this.listen(list, 'click', (event) => this.onClick(event));
    }

    items() {
        return ITEMS.get(this.host) ?? [];
    }

    /** A row ticked or unticked. @param {Event} event */
    onChange(event) {
        const list = this.host;
        const check = event.target instanceof HTMLInputElement && event.target.classList.contains('kp-checklist__check') ? event.target : null;
        const row = check?.closest('.kp-checklist__item');
        if (!check || !row || !list.contains(row)) return;
        const id = row.getAttribute('data-id') ?? '';
        const items = this.items();
        const item = items.find((i) => i.id === id);
        if (!item) return;
        const group = items.filter((i) => (i.group ?? '') === (item.group ?? ''));
        const placeBefore = shownOrder(list, group).indexOf(item);
        item.checked = check.checked;
        void glide(list, render(list));
        const strings = getStrings();
        if (this.byKey && check.checked && sinks(list)) {
            // The open item that took its place gets the focus, so Space can go on down the list.
            const next = shownOrder(list, group)[placeBefore];
            const target = next && !next.checked ? list.querySelector(`.kp-checklist__item[data-id="${CSS.escape(next.id)}"] .kp-checklist__check`) : null;
            if (target instanceof HTMLElement) target.focus();
            say(list, strings.checklistDoneMoved(item.label));
        } else {
            say(list, check.checked ? strings.checklistDone(item.label) : strings.checklistOpen(item.label));
        }
        emit(list, CHECKLIST_EVENT, { id, checked: check.checked });
    }

    /** The bar's buttons. @param {Event} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('.kp-checklist__all')) this.tickAll(target, true);
        else if (target.closest('.kp-checklist__none')) this.tickAll(target, false);
        else if (target.closest('.kp-checklist__clear')) this.clearChecked();
        else if (target.closest('.kp-checklist__undo')) this.undo();
    }

    /**
     * Check all, or Uncheck all. The pressed button is dimmed afterwards: the focus goes to its opposite, not to the page's top.
     * @param {Element} target @param {boolean} on
     */
    tickAll(target, on) {
        const list = this.host;
        const items = this.items();
        if (!on && !items.some((item) => item.checked)) return;
        for (const item of items) item.checked = on;
        void glide(list, render(list));
        const pressed = on ? '.kp-checklist__all' : '.kp-checklist__none';
        const opposite = on ? '.kp-checklist__none:not(:disabled)' : '.kp-checklist__all:not(:disabled)';
        if (document.activeElement === document.body || target.closest(pressed)?.matches(':disabled'))
            /** @type {HTMLElement | null} */ (part(list, 'bar').querySelector(opposite))?.focus();
        say(list, getStrings().checklistSummary(on ? items.length : 0, items.length));
        emit(list, CHECKLIST_EVENT, { id: null, checked: on });
    }

    /** Clear checked: the ticked items leave, and Undo is on offer for a while. */
    clearChecked() {
        const list = this.host;
        const items = this.items();
        const removed = items.filter((i) => i.checked);
        if (!removed.length) return;
        endUndo(list);
        /** @type {Map<string, number>} */
        const at = new Map(removed.map((item) => [item.id, items.indexOf(item)]));
        ITEMS.set(
            list,
            items.filter((i) => !i.checked),
        );
        const ms = Number(list.getAttribute('data-kp-checklist-undo-ms')) || CHECKLIST_UNDO_MS;
        UNDO.set(list, { removed, at, timer: setTimeout(() => endUndo(list), ms) });
        const strings = getStrings();
        const bar = part(list, 'bar');
        /** @type {HTMLElement} */ (bar.querySelector('.kp-checklist__said')).textContent = strings.checklistCleared(removed.length);
        const button = /** @type {HTMLButtonElement} */ (bar.querySelector('.kp-checklist__undo'));
        button.hidden = false;
        render(list);
        button.focus();
        say(list, strings.checklistCleared(removed.length));
        emit(list, CHECKLIST_CLEAR_EVENT, { removed: removed.map((i) => ({ ...i })) });
    }

    /** Undo: the cleared items come back at the places they had. */
    undo() {
        const list = this.host;
        const offer = UNDO.get(list);
        if (!offer) return;
        const restored = [...this.items()];
        for (const item of offer.removed) restored.splice(Math.min(offer.at.get(item.id) ?? restored.length, restored.length), 0, item);
        ITEMS.set(list, restored);
        endUndo(list);
        say(list, getStrings().checklistRestored(offer.removed.length));
        emit(list, CHECKLIST_UNDO_EVENT, { restored: offer.removed.map((i) => ({ ...i })) });
    }
}
