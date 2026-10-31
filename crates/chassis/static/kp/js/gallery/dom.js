// Small helpers of the gallery's parts: an element with a class, an attribute with a default, and a picture address that asks again.

/** @param {Element} el @param {string} name @param {string} fallback */
export const attr = (el, name, fallback) => el.getAttribute(name) ?? fallback;

/** @param {Document} doc @param {string} tag @param {string} cls */
export const make = (doc, tag, cls) => {
    const node = doc.createElement(tag);
    node.className = cls;
    return node;
};

/** A picture address that asks again (past a cached failure). @param {string} url */
export const again = (url) => `${url}${url.includes('?') ? '&' : '?'}kp-retry=${Date.now()}`;
