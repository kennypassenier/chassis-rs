// The element builder every part of the feed uses: a tag, a class and, when given, its text.

/**
 * @param {Document} doc @param {string} tag @param {string} className @param {string} [text]
 * @returns {HTMLElement}
 */
export function make(doc, tag, className, text = '') {
    const node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
}
