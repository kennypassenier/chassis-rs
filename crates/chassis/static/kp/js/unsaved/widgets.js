// The package's own composite fields, each tracked as one value: a quantity, a time field and a tag input [homelab 37].
//
// These fields keep their value in their own state and write their inner inputs silently, so the native `input` and
// `change` events the bar listens to never say what changed: a quantity's buttons, a time field's list and a tag input's
// choices all went unseen, and a time field's text box (built empty) counted as changed before anything was touched.
// The bar now treats each such field as one control: its value is read from the field itself, its own event marks the
// row, Discard and Revert put the value back through the field's own setter, and the inputs inside it are not tracked.

import { QUANTITY, QUANTITY_EVENT } from '../quantity/values.js';
import { getQuantity } from '../quantity/read.js';
import { setQuantity } from '../quantity.js';
import { TIME, TIME_EVENT } from '../timefield/constants.js';
import { FIELDS } from '../timefield/state.js';
import { setTime } from '../timefield/api.js';
import { CHANGE_EVENT } from '../combobox/constants.js';
import { combobox } from '../combobox/handle.js';

/** A tag input: a combobox that holds a list of values. */
const TAG_INPUT = '[data-kp-combobox][data-kp-tags]';
/** Every composite field the bar tracks as one value. */
export const WIDGET = `${QUANTITY}, ${TIME}, ${TAG_INPUT}`;
/** The events those fields fire when a person changes them (a plain combobox's choice is in `kp-combobox-change` too). */
export const WIDGET_EVENTS = [QUANTITY_EVENT, TIME_EVENT, CHANGE_EVENT];

/** The values a tag input holds, in order: each tag's `data-value`, else its text (as the combobox reads them). @param {HTMLElement} root */
function tagValues(root) {
    return [...root.querySelectorAll('[data-kp-tag-list] .kp-tag')].map((t) => /** @type {HTMLElement} */ (t).dataset.value ?? (t.textContent ?? '').trim());
}

/** Whether an element is one of the composite fields. @param {Element} el */
export const isWidget = (el) => el.matches(WIDGET);

/**
 * The composite field a node sits in, or null. A field marked `data-kp-untracked` (on itself or on any input inside it, the
 * way a page that keeps its own mirror opted out before) is left out.
 * @param {Element} node
 * @returns {HTMLElement | null}
 */
export function widgetOf(node) {
    const root = /** @type {HTMLElement | null} */ (node.closest(WIDGET));
    if (!root || root.matches('[data-kp-untracked]') || root.querySelector('[data-kp-untracked]')) return null;
    return root;
}

/**
 * What a composite field holds, as a string: a quantity's number, a time field's `HH:MM` ('' while empty), a tag input's values
 * as a JSON list. Read from the field's own state once it is attached, else from its markup.
 * @param {HTMLElement} root
 */
export function readWidget(root) {
    if (root.matches(QUANTITY)) return String(getQuantity(root));
    if (root.matches(TIME)) return FIELDS.get(root)?.value ?? root.getAttribute('data-kp-value') ?? '';
    return JSON.stringify(tagValues(root));
}

/** What a composite field's value reads as in the list (a tag input's values joined). @param {HTMLElement} root @param {string} value */
export function showWidget(root, value) {
    if (!root.matches(TAG_INPUT)) return value;
    return /** @type {string[]} */ (JSON.parse(value || '[]')).join(', ');
}

/**
 * Put a value back into a composite field through its own setter. A tag input not attached yet has no setter, and that is said.
 * @param {HTMLElement} root @param {string} value
 */
export function writeWidget(root, value) {
    if (root.matches(QUANTITY)) setQuantity(root, Number(value));
    else if (root.matches(TIME)) setTime(root, value);
    else {
        const handle = combobox(root);
        if (!handle) throw new Error('kp-unsaved: a tag input must be attached (attachComboboxes) before its value can be put back');
        handle.set(/** @type {string[]} */ (JSON.parse(value || '[]')));
    }
}
