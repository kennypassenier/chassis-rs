// A row at work: its buttons say no to a press, the pressed one shows the theme's spinner, and nothing moves.

import { ROW_ACTIONS } from './values.js';

/** The press blocker of each busy row. @type {WeakMap<Element, (event: Event) => void>} */
const blockers = new WeakMap();

/** The row's buttons. @param {HTMLElement} row */
const buttonsOf = (row) => /** @type {HTMLElement[]} */ ([...row.querySelectorAll(`${ROW_ACTIONS} > *`)]);

/** Every button of the row says no to a press, the focus staying where it is. @param {HTMLElement[]} buttons */
function blockButtons(buttons) {
    for (const b of buttons) {
        if (b.getAttribute('aria-disabled') === 'true' && !b.hasAttribute('data-kp-row-blocked')) continue;
        b.setAttribute('aria-disabled', 'true');
        b.setAttribute('data-kp-row-blocked', '');
    }
}

/** Wrap the loose words of a button in an element of their own, so they can keep their room while hidden. @param {HTMLElement} button */
function wrapWords(button) {
    const doc = button.ownerDocument;
    for (const node of [...button.childNodes])
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            const words = doc.createElement('span');
            words.className = 'kp-button__text';
            node.replaceWith(words);
            words.append(node);
        }
}

/** The pressed button shows the spinner in place of its words, which keep their room, so no column moves. @param {HTMLElement} button */
function showSpinner(button) {
    const doc = button.ownerDocument;
    // Its width as it stands, held while it waits: no column moves, whatever lays the button out.
    button.style.setProperty('min-inline-size', `${button.getBoundingClientRect().width}px`);
    wrapWords(button);
    const holder = doc.createElement('span');
    holder.className = 'kp-button__busy';
    holder.setAttribute('aria-hidden', 'true');
    const wheel = doc.createElement('span');
    wheel.className = 'kp-spinner';
    holder.append(wheel);
    button.append(holder);
    button.setAttribute('data-kp-busy', '');
}

/** A press on a blocked button goes nowhere. @param {HTMLElement} row */
function blockPresses(row) {
    if (blockers.has(row)) return;
    /** @param {Event} event */
    const block = (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-kp-row-blocked]') : null;
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    row.addEventListener('click', block, true);
    blockers.set(row, block);
}

/** Give the row and its buttons back. @param {HTMLElement} row @param {HTMLElement[]} buttons */
function release(row, buttons) {
    row.removeAttribute('aria-busy');
    for (const b of buttons) {
        if (!b.hasAttribute('data-kp-row-blocked')) continue;
        b.removeAttribute('aria-disabled');
        b.removeAttribute('data-kp-row-blocked');
    }
    for (const b of row.querySelectorAll('[data-kp-busy]')) {
        b.removeAttribute('data-kp-busy');
        /** @type {HTMLElement} */ (b).style.removeProperty('min-inline-size');
        b.querySelector(':scope > .kp-button__busy')?.remove();
    }
    const block = blockers.get(row);
    if (block) {
        row.removeEventListener('click', block, true);
        blockers.delete(row);
    }
}

/**
 * Make a row busy while its action runs, or done with it. The row carries
 * `aria-busy`; every button in it says no to a press (`aria-disabled`, so the
 * focus stays where it is); `button`, the one pressed, shows the theme's
 * spinner in place of its words, which keep their room, so no column moves.
 * @param {HTMLElement} row a list item of a `.kp-action-list`
 * @param {boolean} [busy] true when absent
 * @param {HTMLElement | null} [button] the button that started it
 * @returns {HTMLElement} the row
 */
export function setRowBusy(row, busy = true, button = null) {
    const buttons = buttonsOf(row);
    if (!busy) {
        release(row, buttons);
        return row;
    }
    row.setAttribute('aria-busy', 'true');
    blockButtons(buttons);
    if (button && !button.hasAttribute('data-kp-busy')) showSpinner(button);
    blockPresses(row);
    return row;
}
