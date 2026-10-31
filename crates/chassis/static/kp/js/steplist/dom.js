// Small helpers of the step list: a known state, an element with a class, and the text parts of an item.

import { STEP_STATES } from './values.js';

/** @typedef {import('../steplist.js').StepState} StepState */

/** @param {unknown} state @returns {StepState} */
export const known = (state) => (STEP_STATES.includes(/** @type {any} */ (state)) ? /** @type {StepState} */ (state) : 'pending');

/** @param {string} className @param {string} [tag] */
export const span = (className, tag = 'span') => {
    const el = document.createElement(tag);
    el.className = className;
    return el;
};

/**
 * Set the text parts of an item from a row or a change.
 * @param {Element} item
 * @param {{ title?: string, note?: string, time?: string }} change
 */
export function writeText(item, { title, note, time }) {
    if (title !== undefined) item.querySelector('.kp-steplist__title')?.replaceChildren(title);
    if (note !== undefined) item.querySelector('.kp-steplist__note')?.replaceChildren(note);
    if (time !== undefined) item.querySelector('.kp-steplist__time')?.replaceChildren(time);
}
