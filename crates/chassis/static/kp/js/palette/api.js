// The handle a page gets for a palette and the lookup by dialog.
/** @typedef {import('./types.js').PaletteHandle} PaletteHandle */

/** @type {WeakMap<Element, PaletteHandle>} */
export const handles = new WeakMap();
/** The handle for an attached palette or sheet. @param {Element} element */
export function palette(element) {
    return handles.get(element) ?? null;
}
