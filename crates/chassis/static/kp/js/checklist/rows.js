// The checklist's groups and rows: grouping the items, the order a group shows them in, and one row built or updated in place.

import { el } from './parts.js';
import { nextSerial, sinks } from './state.js';

/** @typedef {import('../checklist.js').ChecklistItem} ChecklistItem */

/** The groups in the order their first item comes. @param {ChecklistItem[]} items */
export function groupsOf(items) {
    /** @type {Map<string, ChecklistItem[]>} */
    const groups = new Map();
    for (const item of items) {
        const key = item.group ?? '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)?.push(item);
    }
    return groups;
}

/**
 * The order a group shows its items in: the open ones in their own order, then
 * the ticked ones in their own order (when the list sinks).
 * @param {Element} list @param {ChecklistItem[]} items
 */
export const shownOrder = (list, items) => (sinks(list) ? [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)] : items);

/**
 * Build or update one row in place.
 * @param {HTMLElement | null} row @param {ChecklistItem} item
 * @returns {HTMLElement}
 */
export function rowFor(row, item) {
    if (!row) {
        row = el('kp-checklist__item', 'li');
        const label = el('kp-checklist__row', 'label');
        const check = /** @type {HTMLInputElement} */ (el('kp-field__check kp-checklist__check', 'input'));
        check.type = 'checkbox';
        const serial = nextSerial();
        const text = el('kp-checklist__label', 'span');
        text.id = `kp-checklist-${serial}-label`;
        const detail = el('kp-checklist__detail', 'span');
        detail.id = `kp-checklist-${serial}-detail`;
        check.setAttribute('aria-labelledby', text.id);
        label.append(check, text, detail);
        row.append(label);
    }
    row.setAttribute('data-id', item.id);
    row.toggleAttribute('data-kp-checklist-checked', Boolean(item.checked));
    const check = /** @type {HTMLInputElement} */ (row.querySelector('.kp-checklist__check'));
    check.checked = Boolean(item.checked);
    const text = /** @type {HTMLElement} */ (row.querySelector('.kp-checklist__label'));
    if (text.textContent !== item.label) text.textContent = item.label;
    const detail = /** @type {HTMLElement} */ (row.querySelector('.kp-checklist__detail'));
    detail.textContent = item.detail ?? '';
    detail.hidden = !item.detail;
    if (item.detail) check.setAttribute('aria-describedby', detail.id);
    else check.removeAttribute('aria-describedby');
    return row;
}

