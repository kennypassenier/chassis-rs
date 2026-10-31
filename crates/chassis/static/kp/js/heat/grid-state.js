// The per-grid memory the drawing and the wiring share: decorate, tab stop and lit keys.
/** @typedef {import('./types.js').HeatDecorateInfo} HeatDecorateInfo */

/** The `decorate` each grid was given, kept for the redraws that wait for the busy card. @type {WeakMap<Element, (part: HTMLElement, info: HeatDecorateInfo) => void>} */
export const DECORATE = new WeakMap();

/** The tab stop of each grid, by row and column. @type {WeakMap<Element, { r: number, c: number }>} */
export const STOPS = new WeakMap();
/** The keys of the labels or headers that are pressed. @type {WeakMap<Element, Set<string>>} */
export const LIT = new WeakMap();
