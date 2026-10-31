// SparkChart: one spark chart, wired: a source's sparkline on the group's crosshair, with its value at the crosshair beside its name.
import { Controller } from '../controller.js';
import { drawSparkline } from '../kpi.js';
import { DATA } from './api.js';
import { dataInMarkup, decorateWith, h, s } from './dom.js';
import { paintSeries, valueFormat } from './attach.js';
import { indexAt, pointsOf } from './selection.js';
import { trendAxisRow, trendWords } from './spark.js';
/** @typedef {import('./api.js').ChartContext} ChartContext */
/** @typedef {import('./api.js').ChartState} ChartState */
/** @typedef {import('./group.js').ChartGroup} ChartGroup */
/** @typedef {import('./words.js').ChartData} ChartData */
/** @typedef {import('./words.js').ChartPoint} ChartPoint */
/** What sparkChart() hands its controller. @typedef {{ group: ChartGroup, locale: string, ctx: ChartContext }} SparkSettings */

/** The box drawSparkline() draws in (js/kpi.js): the crosshair runs across its width and over its height. */
const SPARK_WIDTH = 100;
const SPARK_HEIGHT = 28;
/** The readings Shift+arrow skips. */
const KEY_BIG_STEP = 10;

export class SparkChart extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        const { group, locale, ctx } = /** @type {SparkSettings} */ (/** @type {unknown} */ (options));
        this.group = group;
        this.ctx = ctx;
        this.doc = host.ownerDocument;
        /** @type {ChartData} */
        this.data = DATA.get(host) ?? dataInMarkup(host) ?? { series: [] };
        /** @type {ChartPoint[]} */
        this.pts = [];
        this.fmt = valueFormat(locale, ctx, () => this.data);
        /** @type {number | null} */
        this.cursor = null;
        const { doc } = this;
        this.name = h(doc, 'span', { class: 'kp-chart__spark-label' });
        this.value = h(doc, 'b', { class: 'kp-chart__spark-value kp-chart__num' });
        this.svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (s(doc, 'svg', { class: 'kp-chart__spark' })));
        this.plot = h(doc, 'div', { class: 'kp-chart__plot kp-chart__spark-plot', tabindex: '0', role: 'application' });
        this.plot.append(this.svg);
        this.readout = h(doc, 'p', { class: 'kp-chart__readout kp-sr-only', 'aria-live': 'polite' });
        this.axis = trendAxisRow(host);
        const head = h(doc, 'p', { class: 'kp-chart__spark-head' }, this.name, this.value);
        /** Everything the chart adds to its host, in order. */
        this.parts = [head, this.plot, ...(this.axis ? [this.axis.row] : []), this.readout];
        /** What attachCharts() keeps for this chart and its group holds. @type {ChartState} */
        this.state = this.makeState();
    }

    connect() {
        const { host, group, data, plot } = this;
        host.classList.add('kp-chart', 'kp-chart--spark');
        host.append(...this.parts);
        // Registered first, so it runs last: the parts and the classes go after the group's owner.
        this.own(() => {
            for (const part of this.parts) part.remove();
            host.classList.remove('kp-chart', 'kp-chart--spark');
        });
        if (data.key != null) host.setAttribute('data-kp-key', data.key);
        decorateWith(this.ctx.decorate, plot, { kind: 'plot', host, key: data.key ?? host.getAttribute('data-kp-key') ?? undefined });
        const leave = () => {
            if (group.owner === this.state) group.cursor(null, this.state);
        };
        this.listen(plot, 'pointermove', (e) => this.onMove(/** @type {PointerEvent} */ (e)));
        this.listen(plot, 'pointerleave', leave);
        this.listen(plot, 'keydown', (e) => this.onKey(/** @type {KeyboardEvent} */ (e)));
        this.listen(plot, 'blur', leave);
        this.own(() => {
            if (group.owner === this.state) group.owner = null;
        });
        this.pts = data.series[0] ? pointsOf(data.series[0]) : [];
    }

    label() {
        return this.data.label ?? this.data.series[0]?.label ?? this.host.getAttribute('aria-label') ?? '';
    }

    draw() {
        const { pts, svg, value, axis, cursor, ctx } = this;
        const series = this.data.series[0];
        this.name.textContent = this.label();
        if (axis) [axis.from.textContent, axis.to.textContent] = trendWords(pts, series, ctx);
        this.plot.setAttribute('aria-label', ctx.strings.spark(this.label()));
        if (!series || pts.length < 2) {
            svg.replaceChildren();
            value.textContent = '';
            return;
        }
        drawSparkline(
            svg,
            pts.map((p) => p[1]),
            { parts: 'kp-chart__spark' },
        );
        paintSeries(svg, series, 0);
        const on = cursor != null && cursor >= pts[0][0] && cursor <= pts[pts.length - 1][0];
        if (!on) {
            value.textContent = `${ctx.strings.now} · ${this.fmt(pts[pts.length - 1][1], 'spark')}`;
            return;
        }
        const k = indexAt(pts, /** @type {number} */ (cursor));
        const cx = (k / (pts.length - 1)) * SPARK_WIDTH;
        svg.append(s(this.doc, 'line', { class: 'kp-chart__crosshair', x1: cx, x2: cx, y1: 0, y2: SPARK_HEIGHT, 'vector-effect': 'non-scaling-stroke' }));
        value.textContent = `${ctx.time(pts[k][0], 'clock', {})} · ${this.fmt(pts[k][1], 'spark')}`;
    }

    /** @param {number} t */
    say(t) {
        const k = indexAt(this.pts, t);
        this.readout.textContent = `${this.label()}: ${this.ctx.time(this.pts[k][0], 'full', {})}, ${this.fmt(this.pts[k][1], 'readout')}`;
    }

    /** @param {PointerEvent} e */
    onMove(e) {
        const { pts } = this;
        if (pts.length < 2) return;
        const r = this.svg.getBoundingClientRect();
        const k = Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * (pts.length - 1));
        this.group.cursor(pts[Math.max(0, Math.min(pts.length - 1, k))][0], this.state);
    }

    /** Arrows, Home and End walk the readings on the group's crosshair; Escape lets go of it. @param {KeyboardEvent} e */
    onKey(e) {
        const { pts, cursor, group } = this;
        if (pts.length < 2) return;
        let k = cursor == null ? pts.length - 1 : indexAt(pts, cursor);
        const step = e.shiftKey ? KEY_BIG_STEP : 1;
        if (e.key === 'ArrowLeft') k -= step;
        else if (e.key === 'ArrowRight') k += step;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = pts.length - 1;
        else if (e.key === 'Escape') {
            if (cursor == null) return;
            e.stopPropagation();
            group.cursor(null, this.state);
            return;
        } else return;
        e.preventDefault();
        k = Math.max(0, Math.min(pts.length - 1, k));
        group.cursor(pts[k][0], this.state);
        this.say(pts[k][0]);
    }

    /** @param {ChartData} next */
    setData(next) {
        this.data = next;
        if (next.key != null) this.host.setAttribute('data-kp-key', next.key);
        this.pts = next.series[0] ? pointsOf(next.series[0]) : [];
        this.draw();
    }

    /** @returns {ChartState} */
    makeState() {
        return {
            host: this.host,
            spark: true,
            group: this.group,
            draw: () => this.draw(),
            setData: (next) => this.setData(next),
            select: () => false,
            cursorAt: (t) => {
                this.cursor = t;
                this.draw();
            },
            lastTime: () => this.pts[this.pts.length - 1]?.[0] ?? null,
            destroy: () => this.destroy(),
            unobserve: () => {},
        };
    }
}
