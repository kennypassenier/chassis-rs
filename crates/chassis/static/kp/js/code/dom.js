// Small element builders shared by the code block's parts.

/** @param {Document} doc @param {string} className @param {string} [tag] */
export const make = (doc, className, tag = 'span') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Document} doc @param {string} className @param {string} text */
export const span = (doc, className, text) => {
    const node = make(doc, className);
    node.textContent = text;
    return node;
};
