// Realm-safe element check [last-1103; Kitchen gap 02/11, "setChecklistItems draws nothing into an element of another window"].
//
// `el instanceof HTMLElement` is false for an element of an iframe or another window (its HTMLElement is that window's own),
// so a part's `set*` call returned without a word for a list in a printable sheet's frame. `isHtmlElement` asks the element's
// own window, which keeps every same-window answer as it was.

/**
 * Whether `value` is an HTML element of any window.
 * @param {unknown} value
 * @returns {value is HTMLElement}
 */
export function isHtmlElement(value) {
    if (value === null || typeof value !== 'object') return false;
    const own = /** @type {Node} */ (value).ownerDocument?.defaultView?.HTMLElement;
    return typeof own === 'function' ? value instanceof own : value instanceof HTMLElement;
}
