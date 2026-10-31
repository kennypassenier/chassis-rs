// What a diff remembers and reads: its state, attributes and count.
/** @typedef {import('./types.js').DiffState} DiffState */

/** @type {WeakMap<Element, DiffState>} */
const STATE = new WeakMap();

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
export const attr = (root, name, fallback) => root.getAttribute(`data-kp-diff-${name}`) ?? fallback;

/** `off` and `0` mean no. @param {Element} root @param {string} name @param {number} fallback */
export function count(root, name, fallback) {
    const raw = attr(root, name, String(fallback));
    if (raw === 'off' || raw === 'false') return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** @param {HTMLElement} root */
export function stateOf(root) {
    let st = STATE.get(root);
    if (!st) {
        const first = root.getAttribute('data-kp-diff-state');
        st = {
            spec: first === 'loading' || first === 'empty' || first === 'error' ? { state: first } : {},
            files: [],
            opened: new Map(),
            folds: new Set(),
            all: new Set(),
            card: null,
            off: [],
            mode: attr(root, 'open', 'all'),
            said: '',
        };
        STATE.set(root, st);
    }
    return st;
}
