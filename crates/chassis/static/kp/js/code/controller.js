// One code block: the state the reader changes (wrap, layout, fold), the draw flow, and the listeners of its tools.

import { Controller } from '../controller.js';
import { holdFootprint } from '../footprint.js';
import { CELL_LINES } from './constants.js';
import { onLayoutChange, onToolClick } from './actions.js';
import { drawBody } from './body.js';
import { drawHead } from './head.js';
import { withLanguage } from './language.js';
import { drawLoading } from './loading.js';

/** @typedef {import('./constants.js').CodeSpec} CodeSpec */

/** A code block. It lives as long as its element: drawn by `update()`, never detached. */
export class CodeBlock extends Controller {
    /** @param {HTMLElement} host the root, a `.kp-code` */
    constructor(host) {
        super(host);
        /** What the page last drew into the block. @type {CodeSpec} */
        this.spec = {};
        /** Whether `update()` has run once; the first call sets what the reader's choices start from. */
        this.started = false;
        /** Wrapped, the JSON layout and the fold: kept across calls unless the spec names them again. */
        this.wrap = false;
        /** @type {'pretty' | 'raw'} */
        this.layout = 'pretty';
        this.folded = true;
        /** The text as shown, which Copy copies. */
        this.shown = '';
        this.lines = 0;
        /** The busy card laid over a loading block. @type {import('../busy-card.js').BusyCard | null} */
        this.card = null;
        this.drawn = false;
        /** The spec waiting for the busy card to close. @type {CodeSpec | null} */
        this.pending = null;
        /** @type {HTMLElement | null} */
        this.head = null;
        /** The timer that puts the Copy word back. */
        this.revert = 0;
        /** Whether the block is a table cell, as the first call said. */
        this.cell = false;
        /** The tool rows whose segmented control is attached. @type {WeakSet<HTMLElement>} */
        this.segmentedTools = new WeakSet();
    }

    connect() {
        this.listen(this.host, 'kp-segmented-change', (event) => onLayoutChange(this, event));
        this.listen(this.host, 'click', (event) => onToolClick(this, /** @type {MouseEvent} */ (event)));
    }

    /**
     * Draw (or redraw) the block. The reader's Wrap, layout and fold are kept across calls unless the spec names them again.
     * @param {CodeSpec} given
     */
    update(given) {
        const el = this.host;
        const cell = Boolean(given.cell) || el.classList.contains('kp-code--cell');
        const spec = withLanguage({ ...given, cell, maxLines: given.maxLines ?? (cell ? CELL_LINES : undefined) });
        this.remember(spec, cell);
        el.classList.add('kp-code');
        el.classList.toggle('kp-code--cell', cell);
        el.setAttribute('data-kp-code', '');
        // A block a page draws later was not there when js/auto.js scanned: it holds its own loaded height for empty and failed.
        if (!cell && typeof ResizeObserver === 'function') holdFootprint(el);
        if ((spec.state ?? 'ready') === 'loading') {
            this.pending = null;
            drawHead(this);
            drawLoading(this);
        } else if (this.card) this.drawAfterCard(spec);
        else this.draw();
    }

    /** Take the spec; the first call also sets where the reader's choices start. @param {CodeSpec} spec @param {boolean} cell */
    remember(spec, cell) {
        if (!this.started) {
            this.started = true;
            this.wrap = Boolean(spec.wrap ?? cell);
            this.layout = spec.layout ?? 'pretty';
            this.cell = cell;
        } else {
            if (spec.wrap !== undefined) this.wrap = spec.wrap;
            if (spec.layout !== undefined) this.layout = spec.layout;
        }
        this.spec = spec;
    }

    /** The head, then the body. */
    draw() {
        drawHead(this);
        drawBody(this);
    }

    /** Let the busy card close, then draw, unless a newer spec came in meanwhile. @param {CodeSpec} spec */
    drawAfterCard(spec) {
        const card = /** @type {NonNullable<typeof this.card>} */ (this.card);
        this.card = null;
        this.pending = spec;
        void card.close().then(() => {
            if (this.pending !== spec) return;
            this.pending = null;
            this.draw();
        });
    }
}
