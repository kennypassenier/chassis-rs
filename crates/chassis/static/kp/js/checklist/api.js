// What a page (and the controller) does to a checklist: give it items, tick one, set its state, fire its events and end
// the Undo on offer. These work on any list element, wired or not.

import { openBusyCard } from '../busy-card.js';
import { getStrings } from '../strings.js';
import { part } from './parts.js';
import { glide, render } from './render.js';
import { BUSY, ITEMS, UNDO, getChecklistItems } from './state.js';

/** @typedef {import('../checklist.js').ChecklistItem} ChecklistItem */

/**
 * Give a list its items, changing the rows in place (by id).
 * @param {Element} list
 * @param {ChecklistItem[]} items
 */
export function setChecklistItems(list, items) {
    if (!(list instanceof HTMLElement)) return;
    ITEMS.set(
        list,
        items.map((item) => ({ ...item, checked: Boolean(item.checked) })),
    );
    render(list);
}

/**
 * Tick or untick one item as the page (no event).
 * @param {Element} list @param {string} id @param {boolean} checked
 */
export function setChecklistChecked(list, id, checked) {
    if (!(list instanceof HTMLElement)) return;
    const item = (ITEMS.get(list) ?? []).find((i) => i.id === id);
    if (!item) return;
    item.checked = checked;
    void glide(list, render(list));
}

/**
 * The list's state: `loading` lays the busy card over the body (and keeps it
 * at its height), `error` says `message` where the rows were, `ready` is
 * neither.
 * @param {Element} list @param {'loading' | 'error' | 'ready'} state @param {string} [message]
 */
export function setChecklistState(list, state, message) {
    if (!(list instanceof HTMLElement)) return;
    list.setAttribute('data-kp-state', state);
    if (state === 'error') list.setAttribute('data-kp-checklist-error', message ?? getStrings().checklistFailed);
    else list.removeAttribute('data-kp-checklist-error');
    const body = part(list, 'body');
    const card = BUSY.get(list);
    if (state === 'loading') {
        list.setAttribute('aria-busy', 'true');
        if (!card) {
            BUSY.set(
                list,
                openBusyCard(body, { words: message ?? getStrings().checklistLoading, area: () => [body], className: 'kp-checklist__busy' }),
            );
        }
    } else {
        list.removeAttribute('aria-busy');
        if (card) {
            BUSY.delete(list);
            void card.close();
        }
    }
    render(list);
}

/** @param {HTMLElement} list @param {string} type @param {object} detail */
export const emit = (list, type, detail) =>
    list.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { ...detail, items: getChecklistItems(list) } }));

/** End the Undo on offer, if any. @param {HTMLElement} list */
export function endUndo(list) {
    const undo = UNDO.get(list);
    if (!undo) return;
    clearTimeout(undo.timer);
    UNDO.delete(list);
    const button = /** @type {HTMLButtonElement} */ (part(list, 'bar').querySelector('.kp-checklist__undo'));
    const hadFocus = button === document.activeElement;
    button.hidden = true;
    render(list);
    if (hadFocus)
        /** @type {HTMLElement | null} */ (
            part(list, 'bar').querySelector('.kp-checklist__clear:not(:disabled), .kp-checklist__none:not(:disabled), .kp-checklist__all:not(:disabled)')
        )?.focus();
}

