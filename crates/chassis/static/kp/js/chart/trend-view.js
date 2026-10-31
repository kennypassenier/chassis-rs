// The view of a key figure's trend: its parts, the reading (crosshair and chip), its state plate and busy card, and its drawing.
import { Controller } from '../controller.js';
import { drawSparkline } from '../kpi.js';
import { hostStatePlate } from '../state-plate.js';
import { openBusyCard } from '../busy-card.js';
import { chartState } from './state.js';
import { DATA } from './api.js';
import { dataInMarkup, h, s } from './dom.js';
import { valueFormat } from './attach.js';
import { trendAxisRow, trendWords } from './spark.js';
import { indexAt, pointsOf } from './selection.js';
import { CHART_RETRY_EVENT } from './constants.js';
/** @typedef {import('./api.js').ChartContext} ChartContext */
/** @typedef {import('./group.js').ChartGroup} ChartGroup */
/** @typedef {import('./words.js').ChartData} ChartData */
/** @typedef {import('./words.js').ChartPoint} ChartPoint */
/** What trendChart() hands its controller. @typedef {{ group: ChartGroup, locale: string, ctx: ChartContext }} TrendSettings */

export class TrendView extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        const { group, locale, ctx } = /** @type {TrendSettings} */ (/** @type {unknown} */ (options));
        this.group = group;
        this.ctx = ctx;
        this.doc = host.ownerDocument;
        /** @type {ChartData | null} */
        this.data = DATA.get(host) ?? dataInMarkup(host);
        /** @type {ChartPoint[]} */
        this.pts = [];
        this.fmt = valueFormat(locale, ctx, () => this.data ?? { series: [] });
        /** The moment being read, kept across a live update; null while nothing is read. @type {number | null} */
        this.at = null;
        /** @type {number | null} */
        this.index = null;
        /** The busy card over the plot while it loads [kyu-plates-1019]. @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** The state plate in the plot's place while it is empty or failed. @type {HTMLElement | null} */
        this.plate = null;
        /** Set while the busy card leaves: the data is drawn once it has gone. */
        this.leaving = false;
        this.first = true;
        /** The tile's link, followed by a click that was not a drag; found when the trend is wired. @type {HTMLElement | null} */
        this.link = null;
        const { doc } = this;
        this.svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (s(doc, 'svg', { class: 'kp-kpi__spark' })));
        this.cross = h(doc, 'span', { class: 'kp-kpi__chart-cross' });
        this.cross.hidden = true;
        this.chip = h(doc, 'span', { class: 'kp-kpi__chart-chip', 'aria-hidden': 'true' });
        this.chip.hidden = true;
        this.plot = h(doc, 'span', { class: 'kp-kpi__chart-plot', role: 'application' }, this.svg, this.cross, this.chip);
        this.keys = h(doc, 'span', { class: 'kp-sr-only', id: `kp-trend-keys-${(chartState.clipIds += 1)}` }, ctx.strings.trendKeys);
        this.plot.setAttribute('aria-describedby', this.keys.id);
        this.axis = trendAxisRow(host);
        this.live = h(doc, 'span', { class: 'kp-sr-only', 'aria-live': 'polite' });
        /** Everything the trend adds to its host, in order. */
        this.parts = [this.plot, ...(this.axis ? [this.axis.row] : []), this.keys, this.live];
    }

    loading() {
        return this.data == null || this.host.hasAttribute('data-kp-chart-loading');
    }

    /** @returns {'loading' | 'error' | 'empty' | 'ready'} */
    kind() {
        const { data } = this;
        if (this.loading()) return 'loading';
        if (data?.error) return 'error';
        return (data?.series[0] ? pointsOf(data.series[0]).length : 0) === 0 ? 'empty' : 'ready';
    }

    /** Stop reading: the crosshair and the chip go, and the axis row shows its ends again. */
    hide() {
        const { axis } = this;
        this.at = null;
        this.index = null;
        this.cross.hidden = true;
        this.chip.hidden = true;
        if (axis) {
            axis.read.hidden = true;
            axis.from.hidden = false;
            axis.to.hidden = false;
        }
    }

    /**
     * Read point `k`: the crosshair, and the chip with its moment and value over the line, inside the trend.
     * @param {number} k
     * @param {boolean} [announce] say it to a screen reader (keys only)
     */
    show(k, announce = false) {
        const { pts, plot, cross, ctx } = this;
        if (pts.length < 2) return;
        const i = Math.max(0, Math.min(pts.length - 1, k));
        const [ms, value] = pts[i];
        this.at = ms;
        this.index = i;
        const width = plot.clientWidth;
        const x = (i / (pts.length - 1)) * width;
        const moment = ctx.time(ms, 'full', {});
        cross.style.insetInlineStart = `${x}px`;
        cross.hidden = false;
        this.placeChip(moment, this.fmt(value, 'spark'), x, width);
        if (announce) this.live.textContent = `${moment} · ${this.fmt(value, 'readout')}`;
    }

    /**
     * The chip over the line, kept inside the trend; the value under the moment when the two do not fit on one line, and in the
     * axis row when even that does not fit.
     * @param {string} moment @param {string} shown @param {number} x @param {number} width
     */
    placeChip(moment, shown, x, width) {
        const { chip, axis, doc } = this;
        const words = () => [h(doc, 'span', { class: 'kp-kpi__chart-at' }, moment), h(doc, 'span', { class: 'kp-kpi__chart-value' }, shown)];
        chip.replaceChildren(...words());
        chip.hidden = false;
        chip.removeAttribute('data-kp-stacked');
        let chipWidth = chip.offsetWidth;
        if (chipWidth > width) {
            chip.setAttribute('data-kp-stacked', '');
            chipWidth = chip.offsetWidth;
        }
        const toAxis = chipWidth > width && axis != null;
        if (!toAxis) chip.style.insetInlineStart = `${Math.max(0, Math.min(width - chipWidth, x - chipWidth / 2))}px`;
        chip.hidden = toAxis;
        if (axis) {
            axis.read.replaceChildren(...(toAxis ? words() : []));
            axis.read.hidden = !toAxis;
            axis.from.hidden = toAxis;
            axis.to.hidden = toAxis;
        }
    }

    /** The state plate, or nothing: the plot and the axis give way to it while it stands. @param {'empty' | 'error' | null} k */
    setPlate(k) {
        const { data, ctx, host } = this;
        this.plate?.remove();
        this.plate = null;
        this.plot.hidden = k !== null;
        if (this.axis) this.axis.row.hidden = k !== null;
        if (k === null) return;
        const plate = hostStatePlate(host, {
            kind: k,
            title: k === 'error' ? (data?.error ?? ctx.strings.trendFailed) : ctx.strings.empty,
            ...(k === 'error' && data?.errorText ? { text: data.errorText } : {}),
            art: data?.art,
            retryEvent: CHART_RETRY_EVENT,
            retryLabel: ctx.strings.retry,
        });
        // The Retry goes with the state: the focus goes to the tile's link first, as a chart's Retry hands it to its plot. The plate
        // is removed with its listener.
        plate.addEventListener(
            'click',
            (event) => {
                if (event.target instanceof Element && event.target.closest('button')) this.link?.focus({ preventScroll: true });
            },
            true,
        );
        this.plate = plate;
        host.append(plate);
    }

    /** The busy card while loading: placed again, opened, or taken away once the data is in. @param {string} k */
    syncBusy(k) {
        if (k === 'loading') {
            if (this.busy && !this.leaving) this.busy.place();
            else if (!this.busy) this.busy = openBusyCard(this.host, { words: this.ctx.strings.loading, area: () => [this.plot], className: 'kp-kpi__busy', arrive: !this.first });
        } else if (this.busy && !this.leaving) {
            this.busy.remove();
            this.busy = null;
        }
        this.first = false;
    }

    draw() {
        const { host, plot, axis } = this;
        const series = this.data?.series[0];
        const k = this.kind();
        host.setAttribute('data-kp-state', k);
        this.setPlate(k === 'empty' || k === 'error' ? k : null);
        this.syncBusy(k);
        this.pts = k === 'ready' && series ? pointsOf(series) : [];
        const { pts } = this;
        plot.setAttribute('aria-label', this.data?.label ?? host.getAttribute('aria-label') ?? series?.label ?? '');
        drawSparkline(
            this.svg,
            pts.map((p) => p[1]),
        );
        if (axis) [axis.from.textContent, axis.to.textContent] = trendWords(pts, series, this.ctx);
        const usable = pts.length >= 2;
        if (usable) plot.tabIndex = 0;
        else plot.removeAttribute('tabindex');
        const tile = host.closest('.kp-kpi');
        if (this.loading()) tile?.setAttribute('aria-busy', 'true');
        else tile?.removeAttribute('aria-busy');
        if (!usable) this.hide();
        else if (this.at != null) this.show(indexAt(pts, this.at));
    }

    /** @param {ChartData} next */
    setData(next) {
        this.data = next;
        if (next.key != null) this.host.setAttribute('data-kp-key', next.key);
        if (this.busy && !this.leaving && this.kind() !== 'loading') {
            // The busy card leaves the theme's way first, and nothing is drawn under it on its way out.
            const card = this.busy;
            this.busy = null;
            this.leaving = true;
            void card.close().then(() => {
                this.leaving = false;
                if (!this.destroyed) this.draw();
            });
            return;
        }
        if (!this.leaving) this.draw();
    }
}
