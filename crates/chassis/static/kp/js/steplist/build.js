// buildSteplist() and setStep(): a list made from rows, and one step changed.

import { STEP_ID_ATTRIBUTE } from './values.js';
import { known, span, writeText } from './dom.js';
import { syncItem } from './item.js';

/** @typedef {import('../steplist.js').StepRow} StepRow */
/** @typedef {import('../steplist.js').StepState} StepState */

/**
 * Build a step list from rows. The result still needs attachSteplists() (on
 * the element or its container) for the spoken parts.
 *
 * @param {StepRow[]} rows
 * @param {{ label?: string }} [options] `label`: the list's accessible name
 * @returns {HTMLOListElement}
 */
export function buildSteplist(rows, { label } = {}) {
    const list = document.createElement('ol');
    list.className = 'kp-steplist';
    if (label) list.setAttribute('aria-label', label);
    rows.forEach((row, index) => {
        const item = span('kp-steplist__item', 'li');
        item.setAttribute(STEP_ID_ATTRIBUTE, row.id ?? String(index));
        item.dataset.state = known(row.state);
        if (row.tone) item.dataset.kpTone = String(row.tone);
        const body = span('kp-steplist__body');
        body.append(span('kp-steplist__title'), span('kp-steplist__note'));
        item.append(span('kp-steplist__mark'), body, span('kp-steplist__time', 'time'));
        list.append(item);
        writeText(item, row);
        syncItem(item);
    });
    return list;
}

/**
 * Change one step. `key` is the step's `data-kp-step-id` or its index.
 *
 * @param {Element} list
 * @param {string | number} key
 * @param {{ state?: StepState, title?: string, note?: string, time?: string }} change
 * @returns {Element | null} the item, or null when there is no such step
 */
export function setStep(list, key, change) {
    const items = [...list.querySelectorAll(':scope > .kp-steplist__item')];
    const item = typeof key === 'number' ? items[key] : items.find((el) => el.getAttribute(STEP_ID_ATTRIBUTE) === key);
    if (!item) return null;
    writeText(item, change);
    if (change.state !== undefined) item.setAttribute('data-state', known(change.state));
    syncItem(item, { announce: true });
    return item;
}
