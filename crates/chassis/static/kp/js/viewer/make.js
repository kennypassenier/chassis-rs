// A small helper: an element with a class.

/** @param {Document} doc @param {string} tag @param {string} cls */
export const make = (doc, tag, cls) => {
    const node = doc.createElement(tag);
    node.className = cls;
    return node;
};
