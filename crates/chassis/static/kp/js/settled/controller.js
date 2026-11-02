// The settled rows of one list [parts-1102]: a row that carries `data-kp-settled` keeps its place and its height, goes quiet and
// inert, and says where its item went, until the list is left (the page calls clearSettled, or draws the list fresh). A row that
// settles while the list is wired is said once in a polite line ("Buy milk: Deleted").

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { SETTLED, SETTLED_ATTRIBUTE, SETTLED_EVENT, WORD_CLASS } from './constants.js';

/** What a row is called in words. @param {HTMLElement} row */
export const nameOf = (row) =>
    row.dataset.kpLabel ??
    row.getAttribute('aria-label') ??
    row.querySelector('.kp-checklist__label, .kp-task-row__title')?.textContent?.trim() ??
    getStrings().settledNameless;

/**
 * Settle one row: it keeps the height it has now, turns inert, and shows its word. Again with another word changes the word.
 * @param {HTMLElement} row @param {string} word
 */
export function dress(row, word) {
    if (!row.style.getPropertyValue('--kp-settled-height')) row.style.setProperty('--kp-settled-height', `${row.getBoundingClientRect().height}px`);
    row.inert = true;
    let mark = /** @type {HTMLElement | null} */ (row.querySelector(`:scope > .${WORD_CLASS}`));
    if (!mark) {
        mark = row.ownerDocument.createElement('span');
        mark.className = WORD_CLASS;
        row.append(mark);
    }
    if (mark.textContent !== word) mark.textContent = word;
}

/** Take a row out of its settled state (the item came back, Undo). @param {HTMLElement} row */
export function undress(row) {
    row.inert = false;
    row.style.removeProperty('--kp-settled-height');
    row.querySelector(`:scope > .${WORD_CLASS}`)?.remove();
}

export class SettledList extends Controller {
    connect() {
        const list = this.host;
        for (const row of /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll(SETTLED))) dress(row, row.getAttribute(SETTLED_ATTRIBUTE) ?? '');
        const watch = this.observe(new MutationObserver((records) => this.onChange(records)));
        watch.observe(list, { subtree: true, attributes: true, attributeFilter: [SETTLED_ATTRIBUTE], attributeOldValue: true });
    }

    /** @param {MutationRecord[]} records */
    onChange(records) {
        for (const record of records) {
            const row = /** @type {HTMLElement} */ (record.target);
            const word = row.getAttribute(SETTLED_ATTRIBUTE);
            if (word === null) {
                undress(row);
                continue;
            }
            dress(row, word);
            if (record.oldValue === null) this.said(row, word);
        }
    }

    /** Say the row settled, and tell the page. @param {HTMLElement} row @param {string} word */
    said(row, word) {
        const live = this.live();
        live.textContent = getStrings().settledSaid(nameOf(row), word);
        row.dispatchEvent(new CustomEvent(SETTLED_EVENT, { bubbles: true, detail: { key: row.dataset.kpRowKey ?? row.dataset.kpItem ?? row.id, word } }));
    }

    /** The polite line, made once beside the list. */
    live() {
        const next = this.host.nextElementSibling;
        if (next instanceof HTMLElement && next.dataset.kpSettledStatus !== undefined) return next;
        const live = this.host.ownerDocument.createElement('span');
        live.className = 'kp-sr-only';
        live.setAttribute('role', 'status');
        live.dataset.kpSettledStatus = '';
        this.host.after(live);
        this.own(() => live.remove());
        return live;
    }
}
