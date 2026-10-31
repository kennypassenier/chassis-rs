// The handles of the comboboxes and the lookup a page uses.
/** @typedef {import('./types.js').ComboboxHandle} ComboboxHandle */

/** @type {WeakMap<Element, ComboboxHandle>} */
export const handles = new WeakMap();

/** The handle for an attached combobox. @param {Element} element */
export function combobox(element) {
    return handles.get(element) ?? null;
}

/** @type {WeakMap<Element, import('./types.js').SelectHandle>} */
export const selectHandles = new WeakMap();
