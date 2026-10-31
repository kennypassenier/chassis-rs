// A file row's state, written by the page that owns the request: its progress, its being done, its error.

import { PERCENT } from './values.js';

/**
 * Set a file row's progress. Exported because the consumer owns the
 * request and therefore owns the numbers.
 *
 * @param {HTMLElement} item
 * @param {number} percent
 */
export function setProgress(item, percent) {
    const value = Math.max(0, Math.min(PERCENT, Math.round(percent)));
    item.dataset.state = value >= PERCENT ? 'done' : 'uploading';
    delete item.dataset.error;
    item.style.setProperty('--kp-progress', `${value}%`);
    /** @type {HTMLElement | null} */ (item.querySelector('[role="progressbar"]'))?.setAttribute('aria-valuenow', String(value));
}

/** Mark a row done, with an optional message. @param {HTMLElement} item @param {string} [message] */
export function setDone(item, message = '') {
    setProgress(item, PERCENT);
    /** @type {HTMLElement | null} */ (item.querySelector('.kp-upload__message'))?.replaceChildren(message);
}

/**
 * Mark a row failed, with the reason where a screen reader will read it.
 *
 * @param {HTMLElement} item
 * @param {string} message
 */
export function setError(item, message) {
    item.dataset.state = 'error';
    item.dataset.error = message;
    /** @type {HTMLElement | null} */ (item.querySelector('.kp-upload__message'))?.replaceChildren(message);
}
