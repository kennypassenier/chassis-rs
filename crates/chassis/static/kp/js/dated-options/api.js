// The calls a page makes on a dated option picker: attach, get its handle, give it options and a state, read its value.

import { attachAll, controllerOf } from '../controller.js';
import { DATED } from './constants.js';
import { DatedController } from './controller.js';

/** The handle of an attached picker. @param {Element} element @returns {import('./constants.js').DatedHandle | null} */
export function datedOptions(element) {
    return controllerOf(/** @type {HTMLElement} */ (element), DatedController)?.handle ?? null;
}

/**
 * Give a picker its options (none: the empty state), and optionally the value to choose (the newest by default).
 * @param {Element} element @param {readonly import('./constants.js').DatedOption[]} options @param {string | null} [value]
 */
export function setDatedOptions(element, options, value) {
    datedOptions(element)?.set(options, value);
}

/**
 * Put a picker in a state: ready, empty, loading or error.
 * @param {Element} element @param {import('./constants.js').DatedState} state @param {import('./constants.js').DatedStateOptions} [options]
 */
export function setDatedState(element, state, options) {
    datedOptions(element)?.setState(state, options);
}

/**
 * The value a picker holds.
 * @param {Element} element
 */
export function datedValue(element) {
    return datedOptions(element)?.value() ?? null;
}

/**
 * Wire every dated option picker under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachDatedOptions(root = document, { now } = {}) {
    return attachAll(root, DATED, DatedController, now ? { now } : {});
}
