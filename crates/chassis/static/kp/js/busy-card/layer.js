// The busy card's layer: built, placed over the data area, kept in place while the host scrolls or resizes, and let go.

import { Controller } from '../controller.js';
import { HALF_SEEN_SLACK, PANEL_HEIGHT_ROOM, PANEL_WIDTH_ROOM, px } from './values.js';
import { scrollersAround, seenAcross } from './scroll.js';
import { coverage, lendHeight, lendWidth, viewOf } from './geometry.js';

/** @typedef {import('../busy-card.js').BusyCardOptions} BusyCardOptions */
/** @typedef {import('../busy-card.js').BusyCard} BusyCard */
/** @typedef {import('./geometry.js').Box} Box */

/** One busy card on one host. */
export class BusyCardLayer extends Controller {
    /**
     * @param {HTMLElement} host a positioned box; it may scroll
     * @param {BusyCardOptions} options
     */
    constructor(host, options) {
        super(host, options);
        this.area = options.area;
        this.arrive = options.arrive ?? true;
        const doc = host.ownerDocument;
        const { words, className = '' } = options;
        this.layer = doc.createElement('div');
        this.layer.className = `kp-datatable__busy-overlay kp-datatable__busy-card${className ? ` ${className}` : ''}`;
        this.layer.setAttribute('aria-hidden', 'true');
        this.panel = doc.createElement('div');
        this.panel.className = 'kp-datatable__busy-panel';
        const spinner = doc.createElement('span');
        spinner.className = 'kp-spinner';
        const said = doc.createElement('span');
        said.className = 'kp-datatable__busy-words';
        said.textContent = words;
        this.panel.append(spinner, said);
        this.layer.append(this.panel);
        /** The close in flight, so a second close is the same one. @type {Promise<void> | null} */
        this.closing = null;
    }

    connect() {
        const { host, layer } = this;
        host.append(layer);
        this.place();
        const place = () => this.place();
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(place)).observe(host);
        this.listen(host, 'scroll', place, { passive: true });
        for (const scroller of scrollersAround(host)) this.listen(scroller, 'scroll', place, { passive: true });
        if (this.arrive) void import('../motion.js').then((m) => layer.isConnected && m.arriveShown(layer));
    }

    /** Measure and place the card again. */
    place() {
        const { host, layer, panel } = this;
        if (!layer.isConnected) return;
        const view = viewOf(host);
        // A host wider than the box that scrolls it (a heat grid on a phone, in its page's scroller) is covered only where it is
        // seen, so the panel is centred on what the reader sees and not on a middle off screen [hltwo-1019].
        const seen = seenAcross(host, view.left, view.right);
        const rects = this.area().map((b) => ('getBoundingClientRect' in b ? b.getBoundingClientRect() : b));
        if (!rects.length) return;
        let box = coverage(rects, view, seen);
        const origin = { top: view.top - host.scrollTop, left: view.left - host.scrollLeft };
        this.write(box, origin);
        const need = panel.offsetHeight + PANEL_HEIGHT_ROOM;
        if (need > box.bottom - box.top) {
            box = lendHeight(box, view, need);
            this.write(box, origin);
        }
        // It also covers at least half of what is seen, so it is a card and not a strip beside the labels.
        const wide = Math.max(panel.offsetWidth + PANEL_WIDTH_ROOM, (seen.right - seen.left) / 2 + HALF_SEEN_SLACK);
        if (wide > box.right - box.left) {
            box = lendWidth(box, seen, wide);
            this.write(box, origin);
        }
    }

    /** The layer scrolls with the host's content, so its edges are written from the host's scroll origin. @param {Box} box @param {{ top: number, left: number }} origin */
    write(box, origin) {
        const { host, layer } = this;
        layer.style.setProperty('--kp-busy-overlay-top', px(box.top - origin.top));
        layer.style.setProperty('--kp-busy-overlay-left', px(box.left - origin.left));
        layer.style.setProperty('--kp-busy-overlay-bottom', px(host.clientHeight - (box.bottom - origin.top)));
        layer.style.setProperty('--kp-busy-overlay-right', px(host.clientWidth - (box.right - origin.left)));
    }

    /** Take the card out at once (a new loading state while it was leaving). */
    remove() {
        this.destroy();
        this.layer.remove();
    }

    /** Let the card leave the theme's way; settles once it is gone. @returns {Promise<void>} */
    close() {
        const { layer, panel } = this;
        this.closing ??= import('../motion.js')
            .then((m) => {
                if (!layer.isConnected) return undefined;
                if (m.leavesState(layer)) return m.leave(layer);
                layer.setAttribute(m.CLOSING_ATTRIBUTE, '');
                return m.playClose(panel).then(() => undefined);
            })
            .catch(() => undefined)
            .then(() => this.remove());
        return this.closing;
    }

    /** The handle a page gets back: the layer and three functions that need no `this`. @returns {BusyCard} */
    handle() {
        return { layer: this.layer, place: () => this.place(), remove: () => this.remove(), close: () => this.close() };
    }
}

/**
 * Lay the busy card over a data area of `host`.
 * @param {HTMLElement} host
 * @param {BusyCardOptions} options
 * @returns {BusyCard}
 */
export function openBusyCard(host, options) {
    // Built directly, not keyed on the host: a second card over one host is a second card, as it always was.
    const card = new BusyCardLayer(host, options);
    try {
        card.connect();
    } catch (error) {
        card.destroy();
        throw error;
    }
    return card.handle();
}
