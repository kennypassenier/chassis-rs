// A small helper: an element with a class.

/** @param {Document} doc @param {string} className @param {string} [tag] */
export const make = (doc, className, tag = 'span') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};
