// A group of charts that share a selection and a window.
import { parseSpan } from './stats.js';
import { CHIPS, GROUPS, LOOSE, PAGES } from './api.js';
import { chipKey, decorateWith, h } from './dom.js';
import { CHART_GROUP, CHART_RANGE_EVENT, CHART_ZOOM_EVENT } from './constants.js';
import { wallTime } from './time.js';
/** @typedef {import('./api.js').ChartContext} ChartContext */
/** @typedef {import('./api.js').ChartState} ChartState */
/** @typedef {import('./words.js').ChartWindow} ChartWindow */

/** Charts that share one crosshair, one zoom and one range, across attachCharts() calls. */
export class ChartGroup {
    /**
     * @param {HTMLElement | null} el the `[data-kp-chart-group]`, or none (the document's loose charts)
     * @param {Document} doc
     * @param {ChartContext} ctx the first call's words and times, for the chips
     */
    constructor(el, doc, ctx) {
        this.el = el;
        this.doc = doc;
        this.ctx = ctx;
        /** @type {Set<ChartState>} */
        this.charts = new Set();
        /** @type {ChartWindow | null} */
        this.zoom = null;
        /** The chart the crosshair was last moved on: the only one, unpinned, that shows its tooltip. @type {ChartState | null} */
        this.owner = null;
        this.span = parseSpan(el?.dataset.kpChartSpan);
        /** @type {(() => void)[]} */
        this.stops = [];
        /** Every chip given to this group, and its words. @type {Map<HTMLElement, HTMLElement>} */
        this.chips = new Map();
        if (el) {
            GROUPS.set(el, this);
            this.wireRanges();
        } else LOOSE.set(doc, this);
        let page = PAGES.get(doc);
        if (!page) {
            // Esc anywhere outside a chart (and outside a dialog) resets
            // every zoom on the page.
            /** @param {KeyboardEvent} e */
            const onEsc = (e) => {
                if (e.key !== 'Escape') return;
                const target = /** @type {Element | null} */ (e.target instanceof Element ? e.target : null);
                if (target?.closest('.kp-chart__plot, dialog')) return;
                for (const group of PAGES.get(doc)?.groups ?? []) if (group.zoom) group.setZoom(null);
            };
            page = { groups: new Set(), onEsc };
            PAGES.set(doc, page);
            doc.addEventListener('keydown', onEsc);
        }
        page.groups.add(this);
        this.bindChips();
    }

    /** Take every chip on the page that names this group and is not taken yet. */
    bindChips() {
        const key = this.el ?? this.doc;
        for (const chip of /** @type {HTMLElement[]} */ ([...this.doc.querySelectorAll('[data-kp-chart-zoom]')])) {
            if (!CHIPS.has(chip) && chipKey(chip) === key) this.bindChip(chip);
        }
    }

    /** @param {HTMLElement} chip */
    bindChip(chip) {
        const { strings, decorate } = this.ctx;
        const doc = this.doc;
        const text = h(doc, 'span');
        const reset = h(doc, 'button', { type: 'button', class: 'kp-chart-zoom__reset', title: strings.resetTitle }, strings.reset);
        reset.addEventListener('click', () => this.setZoom(null));
        chip.classList.add('kp-chart-zoom');
        chip.setAttribute('role', 'status');
        chip.replaceChildren(text, reset);
        chip.hidden = this.zoom == null;
        if (this.zoom) text.textContent = this.zoomText(this.zoom);
        CHIPS.set(chip, this);
        this.chips.set(chip, text);
        decorateWith(decorate, reset, { kind: 'zoom-reset', host: chip, key: this.el?.getAttribute('data-kp-key') ?? undefined });
    }

    wireRanges() {
        const el = /** @type {HTMLElement} */ (this.el);
        const buttons = /** @type {HTMLElement[]} */ ([...el.querySelectorAll('[data-kp-chart-range]')]).filter((b) => b.closest(CHART_GROUP) === el);
        const paint = () => {
            for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.kpChartRange === el.dataset.kpChartSpan));
        };
        /** @param {Event} event */
        const onClick = (event) => {
            const button = /** @type {HTMLElement} */ (event.currentTarget);
            const range = button.dataset.kpChartRange ?? '';
            const span = parseSpan(range);
            if (span == null) return;
            el.dataset.kpChartSpan = range;
            this.span = span;
            paint();
            this.zoom = null;
            // The page may hand the charts new data for this range first.
            el.dispatchEvent(new CustomEvent(CHART_RANGE_EVENT, { bubbles: true, detail: { range, span } }));
            this.setZoom(null);
        };
        for (const b of buttons) {
            b.addEventListener('click', onClick);
            decorateWith(this.ctx.decorate, b, {
                kind: 'range',
                host: el,
                key: el.getAttribute('data-kp-key') ?? undefined,
                value: b.dataset.kpChartRange,
            });
        }
        paint();
        this.stops.push(() => buttons.forEach((b) => b.removeEventListener('click', onClick)));
    }

    /** The newest point of any plot in the group. */
    end() {
        let end = -Infinity;
        for (const c of this.charts) if (!c.spark) end = Math.max(end, c.lastTime() ?? -Infinity);
        return Number.isFinite(end) ? end : null;
    }

    /** @param {ChartWindow | null} zoom */
    setZoom(zoom) {
        this.zoom = zoom;
        for (const c of this.charts) c.draw();
        // A chip the page added since the group was made.
        this.bindChips();
        for (const [chip, text] of this.chips) {
            chip.hidden = zoom == null;
            if (zoom) text.textContent = this.zoomText(zoom);
        }
        (this.el ?? this.doc).dispatchEvent(new CustomEvent(CHART_ZOOM_EVENT, { bubbles: true, detail: zoom }));
    }

    /**
     * The chip's words for a zoom: its span in the `range` style (dates
     * once it spans more than one day).
     * @param {ChartWindow} zoom
     */
    zoomText(zoom) {
        const { strings, time, timeZone } = this.ctx;
        if (!strings.zoomedByEnds) return strings.zoomedSpan(time(zoom.from, 'range', { from: zoom.from, to: zoom.to }));
        const a = wallTime(zoom.from, timeZone);
        const b = wallTime(zoom.to, timeZone);
        const style = a.year === b.year && a.month === b.month && a.day === b.day ? 'clock' : 'full';
        return strings.zoomed(time(zoom.from, style, {}), time(zoom.to, style, {}));
    }

    /** @param {number | null} t @param {ChartState | null} owner */
    cursor(t, owner) {
        this.owner = owner;
        for (const c of this.charts) c.cursorAt(t, c === owner);
    }

    /** No chart left: let go of the page. */
    stop() {
        for (const f of this.stops) f();
        for (const chip of this.chips.keys()) {
            chip.replaceChildren();
            chip.hidden = true;
            CHIPS.delete(chip);
        }
        this.chips.clear();
        if (this.el) {
            if (GROUPS.get(this.el) === this) GROUPS.delete(this.el);
        } else if (LOOSE.get(this.doc) === this) LOOSE.delete(this.doc);
        const page = PAGES.get(this.doc);
        page?.groups.delete(this);
        if (page && page.groups.size === 0) {
            this.doc.removeEventListener('keydown', page.onEsc);
            PAGES.delete(this.doc);
        }
    }
}
