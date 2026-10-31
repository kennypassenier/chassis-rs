// A wheel's selector, events and state, its geometry and the pure helpers: weights, the weighted pick, the angles, and
// making its SVG and HTML parts. The state is a registry, not controller state: setWheelItems() works before wiring.

/** @typedef {import('../wheel.js').WheelItem} WheelItem */

export const WHEEL = '[data-kp-wheel]';
export const WHEEL_SPIN_EVENT = 'kp-wheel-spin';
export const WHEEL_RESULT_EVENT = 'kp-wheel-result';

/**
 * @typedef {object} WheelState
 * @property {WheelItem[]} items
 * @property {Map<string, number>} shown  the weights drawn now (they glide to the items' weights)
 * @property {string[]} order  the ids drawn, in order (a leaving one stays until it has shrunk)
 * @property {number} angle  the disc's turn, degrees
 * @property {boolean} spinning
 * @property {string | null} last  the id the wheel chose last
 * @property {number} glide  the frame of a glide
 * @property {import('../busy-card.js').BusyCard | null} busy
 */

/** @type {WeakMap<Element, WheelState>} */
const STATES = new WeakMap();
export const SVG = 'http://www.w3.org/2000/svg';
/** The disc's radius, the labels' room and the hub's, in the SVG's units. */
export const R = 96;
export const LABEL_IN = 34;
export const LABEL_OUT = 84;
/** Whole turns a spin makes, drawn between these (data-kp-wheel-turns-min / -max). */
export const DEFAULT_TURNS_MIN = 3;
export const DEFAULT_TURNS_MAX = 6;

/** @param {WheelItem} item */
export const weightOf = (item) => Math.max(0.05, Number.isFinite(item.weight) ? Number(item.weight) : 1);

/**
 * Draw an outcome by the weights. `avoid` (an id) is left out while there is
 * another choice. Pure but for `random`.
 * @param {readonly WheelItem[]} items
 * @param {{ random?: () => number, avoid?: string | null }} [options]
 * @returns {number} the index drawn, -1 when there is none
 */
export function pickWeighted(items, { random = Math.random, avoid = null } = {}) {
    // A resting choice is not drawn while another is not resting; when every one rests, they are all in play again.
    const awake = items.some((item) => !item.resting);
    const open = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => (items.length < 2 || item.id !== avoid) && (!awake || !item.resting));
    const total = open.reduce((sum, { item }) => sum + weightOf(item), 0);
    if (!open.length || total <= 0) return -1;
    let at = random() * total;
    for (const { item, index } of open) {
        at -= weightOf(item);
        if (at < 0) return index;
    }
    return open[open.length - 1].index;
}

/**
 * Each segment's start and end, in degrees clockwise from the top, by weight.
 * @param {readonly number[]} weights
 * @returns {[number, number][]}
 */
export function wheelAngles(weights) {
    const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
    let at = 0;
    return weights.map((w) => {
        const span = total > 0 ? (Math.max(0, w) / total) * 360 : 0;
        const segment = /** @type {[number, number]} */ ([at, at + span]);
        at += span;
        return segment;
    });
}

/** @param {number} deg @param {number} r */
export const point = (deg, r) => {
    const rad = (deg * Math.PI) / 180;
    return `${(r * Math.sin(rad)).toFixed(3)} ${(-r * Math.cos(rad)).toFixed(3)}`;
};

/** @param {string} name @param {Record<string, string>} [attrs] */
export const svg = (name, attrs = {}) => {
    const node = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
};

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @returns {WheelState} */
export const stateOf = (root) => {
    let state = STATES.get(root);
    if (!state) {
        state = { items: [], shown: new Map(), order: [], angle: 0, spinning: false, last: null, glide: 0, busy: null };
        STATES.set(root, state);
    }
    return state;
};

/** @param {Element} root @param {string} name */
export const part = (root, name) => /** @type {HTMLElement} */ (root.querySelector(`.kp-wheel__${name}`));

