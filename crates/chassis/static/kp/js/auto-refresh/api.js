// The calls a page makes on a refresh control: attach, get its handle, answer a refresh, set the interval and the title.

import { attachAll, controllerOf } from '../controller.js';
import { REFRESH } from './constants.js';
import { RefreshController } from './controller.js';

/** The handle of an attached control. @param {Element} element @returns {import('./constants.js').RefreshHandle | null} */
export const refreshOf = (element) => controllerOf(/** @type {HTMLElement} */ (element), RefreshController)?.handle ?? null;

/**
 * Tell a control the app has finished the refresh it asked for.
 * @param {Element} element @param {boolean} ok
 */
export function refreshDone(element, ok) {
    refreshOf(element)?.done(ok);
}

/**
 * Set the interval from the consumer (any whole number of seconds; 0 pauses).
 * @param {Element} element @param {number} seconds
 */
export function setRefreshInterval(element, seconds) {
    refreshOf(element)?.setInterval(seconds, 'script');
}

/**
 * Set (or take away, with an empty string) the title in a control's bar [wish-1028].
 * @param {Element} element @param {string} words
 */
export function setRefreshTitle(element, words) {
    if (words) element.setAttribute('data-kp-refresh-title', words);
    else element.removeAttribute('data-kp-refresh-title');
}

/**
 * Wire every refresh control under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachRefresh(root = document, { now = () => Date.now() } = {}) {
    return attachAll(root, REFRESH, RefreshController, { now });
}
