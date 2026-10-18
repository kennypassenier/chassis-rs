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

/** Every busy card, whatever component laid it. */
export const BUSY_CARD = '.kp-datatable__busy-card';

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

/** @param {number} v */
const px = (v) => `${Math.round(v)}px`;

/**
 * Lay the busy card over a data area of `host`.
 * @param {HTMLElement} host
 * @param {BusyCardOptions} options
 * @returns {BusyCard}
 */
export function openBusyCard(host, { words, area, className = '', arrive = true }) {
    const doc = host.ownerDocument;
    const layer = doc.createElement('div');
    layer.className = `kp-datatable__busy-overlay kp-datatable__busy-card${className ? ` ${className}` : ''}`;
    layer.setAttribute('aria-hidden', 'true');
    const panel = doc.createElement('div');
    panel.className = 'kp-datatable__busy-panel';
    const spinner = doc.createElement('span');
    spinner.className = 'kp-spinner';
    const said = doc.createElement('span');
    said.className = 'kp-datatable__busy-words';
    said.textContent = words;
    panel.append(spinner, said);
    layer.append(panel);

    const place = () => {
        if (!layer.isConnected) return;
        const box = host.getBoundingClientRect();
        // The host's padding box in view, and where its scroll origin is: the layer scrolls with the host's content.
        const viewTop = box.top + host.clientTop;
        const viewLeft = box.left + host.clientLeft;
        const viewBottom = viewTop + host.clientHeight;
        const viewRight = viewLeft + host.clientWidth;
        const rects = area().map((b) => ('getBoundingClientRect' in b ? b.getBoundingClientRect() : b));
        if (!rects.length) return;
        let top = Math.max(viewTop, Math.min(...rects.map((r) => r.top)));
        const left = Math.max(viewLeft, Math.min(...rects.map((r) => r.left)));
        let bottom = Math.max(top, Math.min(viewBottom, Math.max(...rects.map((r) => r.bottom))));
        const right = Math.max(left, Math.min(viewRight, Math.max(...rects.map((r) => r.right))));
        const originTop = viewTop - host.scrollTop;
        const originLeft = viewLeft - host.scrollLeft;
        const write = () => {
            layer.style.setProperty('--kp-busy-overlay-top', px(top - originTop));
            layer.style.setProperty('--kp-busy-overlay-left', px(left - originLeft));
            layer.style.setProperty('--kp-busy-overlay-bottom', px(host.clientHeight - (bottom - originTop)));
            layer.style.setProperty('--kp-busy-overlay-right', px(host.clientWidth - (right - originLeft)));
        };
        write();
        // An area shorter than the theme's panel (a heat grid of three rows; a register that gives its panel a foot of
        // its own) lends the card the room it needs from either side, within the host: the panel is never cut.
        const need = panel.offsetHeight + 8;
        if (need > bottom - top) {
            const grow = (need - (bottom - top)) / 2;
            top = Math.max(viewTop, top - grow);
            bottom = Math.min(viewBottom, bottom + grow);
            write();
        }
    };

    host.append(layer);
    place();
    const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null;
    watcher?.observe(host);
    host.addEventListener('scroll', place, { passive: true });
    const unwatch = () => {
        watcher?.disconnect();
        host.removeEventListener('scroll', place);
    };
    if (arrive) void import('./motion.js').then((m) => layer.isConnected && m.arriveShown(layer));

    /** @type {Promise<void> | null} */
    let closing = null;
    return {
        layer,
        place,
        remove() {
            unwatch();
            layer.remove();
        },
        close() {
            closing ??= import('./motion.js')
                .then((m) => {
                    if (!layer.isConnected) return undefined;
                    if (m.leavesState(layer)) return m.leave(layer);
                    layer.setAttribute(m.CLOSING_ATTRIBUTE, '');
                    return m.playClose(panel).then(() => undefined);
                })
                .catch(() => undefined)
                .then(() => {
                    unwatch();
                    layer.remove();
                });
            return closing;
        },
    };
}
