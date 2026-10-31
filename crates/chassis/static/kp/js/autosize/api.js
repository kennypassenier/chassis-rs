// The calls a page makes on a growing box: attach, get its handle, measure again, set its state.

import { controllerOf, attachOne, hostsOf } from '../controller.js';
import { AUTOSIZE } from './constants.js';
import { AutosizeController } from './controller.js';
import { applyState } from './status.js';

/** The controller of an attached box. @param {Element} element */
const controllerFor = (element) => controllerOf(element, AutosizeController);

/** The handle of an attached box. @param {Element} element @returns {import('./constants.js').AutosizeHandle | null} */
export function autosize(element) {
    return controllerFor(element)?.handle ?? null;
}

/**
 * Measure a box again.
 * @param {Element} element
 */
export function refreshAutosize(element) {
    controllerFor(element)?.handle.refresh();
}

/**
 * Put a box in a state: `loading` lays the busy card over it, `error` writes the sentence in its error line.
 * @param {Element} element @param {'ready' | 'loading' | 'error'} state @param {string} [message]
 */
export function setAutosizeState(element, state, message) {
    const box = controllerFor(element);
    if (box) applyState(box, state, message);
}

/**
 * Wire every growing box under `root`; a box with `data-kp-autosize="off"` stays as it is.
 * @param {ParentNode} [root]
 * @param {import('./constants.js').AutosizeOptions} [options] overrides the markup
 * @returns {() => void} detach
 */
export function attachAutosize(root = document, options = {}) {
    const made = hostsOf(root, AUTOSIZE)
        .filter((area) => !controllerFor(area) && area.getAttribute('data-kp-autosize') !== 'off')
        .map((area) => attachOne(area, AutosizeController, options))
        .filter((box) => box !== undefined);
    return () => {
        for (const box of made) box.destroy();
    };
}
