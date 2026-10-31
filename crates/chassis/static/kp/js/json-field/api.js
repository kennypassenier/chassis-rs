// The calls a page makes on a JSON field: attach and get a field's handle.

import { attachAll, controllerOf } from '../controller.js';
import { JSON_FIELD } from './constants.js';
import { JsonFieldController } from './controller.js';

/**
 * The handle of a field that has been attached.
 * @param {Element} area
 * @returns {import('./constants.js').JsonFieldHandle | null}
 */
export function jsonField(area) {
    return controllerOf(area, JsonFieldController)?.handle ?? null;
}

/**
 * Give every `textarea[data-kp-json]` under `root` its checking, gutter and tools.
 * @param {ParentNode} [root]
 * @param {import('./constants.js').JsonFieldOptions} [options]
 * @returns {() => void} detach
 */
export function attachJsonFields(root = document, options = {}) {
    return attachAll(root, JSON_FIELD, JsonFieldController, options);
}
