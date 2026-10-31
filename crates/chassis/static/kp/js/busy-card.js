// The busy card: the data table's loading card over any data area [kpadopt2].
//
// Kenny, 2026-10-16, on the matrix and the run timeline: "ik zie geen loading
// icoon? moet hier ook zoals bij een table zijn waar het icoon in het midden
// van de matrix staat en lijkt te laden". A data component that loads lays
// the card a busy data table lays over its rows (js/datatable.js
// drawOverlay()) over its own data area, centred: the same layer, panel,
// spinner and words,
//
//   .kp-datatable__busy-overlay.kp-datatable__busy-card > .kp-datatable__busy-panel
//       > .kp-spinner + .kp-datatable__busy-words
//
// so every theme dresses it as it dresses its busy table (its spinner, its
// plate, pastel's caterpillar from js/loading-pieces.js) and nothing per
// component has to be drawn again. js/week.js builds the same markup itself
// (approved before this module existed); gates/check-busy-card.mjs refuses a
// data component whose loading state lays no such card.
//
// The layer is absolutely placed in `host` (a positioned box; it may scroll)
// over the union of the boxes `area()` returns, clipped to what of the host is
// in view, and placed again when the host changes size or scrolls: the
// headers, the axis and the labels beside it stay readable and nothing moves
// when it comes or goes. It arrives the theme's way (js/motion.js
// arriveShown(), unless `arrive: false`, for a component's first render, which
// is the page and not news) and leaves as the busy table's layer leaves:
// leave() where the theme leaves its states whole, else its panel's close.
// Hidden from assistive technology, which hears the component's own state.
//
//   const card = openBusyCard(host, { words: 'Reading…', area: () => [cells], className: 'kp-heat__busy' });
//   await card.close();   // the data is drawn once it has gone: nothing under a card on its way out

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the class, the scrolling ancestors, the geometry and the
// BusyCardLayer controller live in js/busy-card/, listed in js/README.md. It has no import of its own: nothing runs on import.

export { BUSY_CARD } from './busy-card/values.js';
export { scrollersAround, seenAcross } from './busy-card/scroll.js';
export { openBusyCard } from './busy-card/layer.js';

/**
 * @typedef {object} BusyCardOptions
 * @property {string} words what the card says under the spinner
 * @property {() => readonly (Element | { top: number, right: number, bottom: number, left: number })[]} area
 *   the boxes the card covers, in viewport coordinates (an element's border box, or a rectangle); measured on every placement
 * @property {string} [className] the component's own class on the layer, beside `kp-datatable__busy-card`
 * @property {boolean} [arrive] arrive the theme's way (default true); false for a component's first render
 */

/**
 * @typedef {object} BusyCard
 * @property {HTMLElement} layer
 * @property {() => void} place measure and place it again
 * @property {() => Promise<void>} close let it leave the theme's way; settles once it is gone
 * @property {() => void} remove take it out at once (a new loading state while it was leaving)
 */
