// What a viewer remembers: its state, built parts, attributes and the reads of its options.
/** @typedef {import('./types.js').ViewerState} ViewerState */

/** @type {WeakMap<Element, ViewerState>} */
const STATE = new WeakMap();
/** The text a message's marks were built for. @type {WeakMap<Element, string>} */
export const BUILT = new WeakMap();

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
export const attr = (root, name, fallback) => root.getAttribute(`data-kp-log-${name}`) ?? fallback;

/** @param {HTMLElement} root @returns {ViewerState} */
export function stateOf(root) {
    let st = STATE.get(root);
    if (!st) {
        st = {
            lines: [],
            nodes: new Map(),
            dropped: 0,
            serial: 0,
            sig: '',
            matches: [],
            at: -1,
            card: null,
            off: [],
            said: '',
            tools: '',
            highlighted: '',
        };
        STATE.set(root, st);
    }
    return st;
}
