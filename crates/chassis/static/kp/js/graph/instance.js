// One graph's state and the SVG helpers every part uses.
/** @typedef {import('./options.js').GraphData} GraphData */
/** @typedef {import('./options.js').GraphDecorateInfo} GraphDecorateInfo */
/** @typedef {import('./options.js').GraphDetailInfo} GraphDetailInfo */
/** @typedef {import('./labels.js').GraphLabel} GraphLabel */
/** @typedef {import('./options.js').GraphNode} GraphNode */
/** @typedef {import('./options.js').GraphOptions} GraphOptions */

/**
 * A node's radius: 14, or 10 to 24 by its weight; an outside node 9. A page's own `radius` on the node wins, and `base`
 * (14) scales the rest [graph-1020].
 * @param {GraphNode} n
 * @param {number} [base]
 */
export const radiusOf = (n, base = 14) => {
    if (n.radius != null && n.radius > 0) return n.radius;
    const r = n.external ? 9 : n.weight != null ? 10 + 14 * Math.sqrt(Math.max(0, Math.min(1, n.weight))) : 14;
    return base === 14 ? r : (r * base) / 14;
};
/** Is `el` laid out (not hidden, not inside something hidden)? @param {Element | null} el */
export const isShown = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};
const SVG_NS = 'http://www.w3.org/2000/svg';
/** @param {Document} doc @param {string} tag @param {Record<string, string | number>} [attrs] @returns {SVGElement} */
export const svgEl = (doc, tag, attrs = {}) => {
    const el = /** @type {SVGElement} */ (doc.createElementNS(SVG_NS, tag));
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
    return el;
};
/**
 * @typedef {GraphLabel & { text: SVGTextElement }} DrawnLabel
 * @typedef {{ k: number, x: number, y: number }} GraphView
 * @typedef {{ el: HTMLElement, data: GraphData | null, state: 'loading' | 'ready' | 'empty' | 'error', words: string, text: string, art: Node | string | null,
 *   selected: Set<string>, hidden: Set<string>, hover: string | null, focus: string | null, drawnWidth: number,
 *   bar: HTMLElement, showAll: HTMLButtonElement, legend: HTMLElement, box: HTMLElement, svg: SVGSVGElement,
 *   note: HTMLElement, plate: HTMLElement, drawn: boolean, hint: HTMLElement, decorate?: (part: Element, info: GraphDecorateInfo) => void,
 *   strings: import('../strings.js').Strings, labels: DrawnLabel[], size: [number, number],
 *   options: GraphOptions, world: SVGGElement | null, at: Map<string, { x: number, y: number, angle: number }>, view: GraphView,
 *   zoomBox: HTMLElement, zoomIn: HTMLButtonElement, zoomOut: HTMLButtonElement, zoomReset: HTMLButtonElement,
 *   panel: HTMLElement, detail: string | null, detailShown: string | null, detailHook?: (info: GraphDetailInfo) => Node | string | null | void,
 *   readyHeight: number, readyWidth: number }} GraphModel
 */

/** @type {WeakMap<Element, GraphModel>} */
export const graphs = new WeakMap();
/** How far a view may zoom, and by how much a key or a button steps [graph-1020]. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 1.25;
