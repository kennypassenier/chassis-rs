// The calls a page makes on a time field: set, read, check, give presets, and attach.

import { attachAll } from '../controller.js';
import { TIME } from './constants.js';
import { TimeController } from './controller.js';
import { fieldFor } from './field.js';
import { FIELDS } from './state.js';

/**
 * Set the value (no event unless `fire`), or clear it with an empty text.
 * @param {HTMLElement} root @param {string} value `HH:MM`, or '' @param {{ fire?: boolean }} [options]
 */
export function setTime(root, value, { fire = false } = {}) {
    if (!(root instanceof HTMLElement)) return;
    const field = fieldFor(root);
    field.setInvalid('');
    field.write(value, { silent: !fire });
}

/** The value as it stands (`HH:MM`, or '' while empty or invalid). @param {HTMLElement} root */
export function timeValue(root) {
    return FIELDS.get(root)?.value ?? '';
}

/** Whether the field is fine: valid, and not empty when required. @param {HTMLElement} root */
export function timeValid(root) {
    const field = FIELDS.get(root);
    if (!field) return true;
    return field.invalid === '' && !(root.hasAttribute('data-kp-time-required') && field.value === '');
}

/**
 * Give the list its presets, or say they are loading or could not be loaded.
 * @param {HTMLElement} root @param {import('./constants.js').TimePresets} presets
 */
export function setTimePresets(root, presets) {
    const field = fieldFor(root);
    field.presets = presets;
    if (field.list.open) field.list.draw();
}

/**
 * Wire every time field under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export const attachTimes = (root = document) => attachAll(root, TIME, TimeController);
