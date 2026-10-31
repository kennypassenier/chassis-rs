// One drawing of a full chart: on its frame, the sources, the medians and runs, the event marks, the edge counts, the brush and the
// crosshair. `build()` draws them in the order the plot always did; the chart then puts the picture in the page.
import { s } from '../dom.js';
import { paintSeries } from '../attach.js';
import { chartMedian, chartRuns } from '../stats.js';
import { indexAt } from '../selection.js';
import { PlotFrame } from './frame.js';
/** @typedef {import('../words.js').ChartSeries} ChartSeries */
/** @typedef {import('./base.js').PlotMedian} PlotMedian */
/** @typedef {import('./base.js').PlotGeometry} PlotGeometry */

/** The marks' measures, in SVG pixels unless named otherwise. */
const MARKS = Object.freeze({
    /** A column's share of the room its neighbours leave, its narrowest and widest, and the slots a lone column divides the plot in. */
    columnShare: 0.76,
    columnMin: 1.5,
    columnMax: 48,
    columnSlots: 12,
    /** A lone reading's dot, a run's ring, and a snapped dot (hot and not). */
    dot: 3.5,
    ring: 4.25,
    snapHot: 4.5,
    /** The median's words: their rise above the line, their drop below it when there is no room above, the room kept under the top, their inset from the end. */
    labelRise: 6,
    labelDrop: 14,
    labelRoom: 8,
    labelInset: 4,
    /** An event mark's rise above the plot, its hit circle and its dot. */
    markRise: 9,
    markHit: 10,
    markDot: 5,
    /** The edge counts' inset from the plot's ends and their rise above it. */
    edgeInset: 2,
    edgeRise: 5,
});

export class PlotDrawing extends PlotFrame {
    /** @param {ConstructorParameters<typeof PlotFrame>} args */
    constructor(...args) {
        super(...args);
        /** The most readings any source has, and whether that is too few for a trend. */
        this.have = Math.max(0, ...this.chart.points.map((p) => p.length));
        this.few = this.opt.minPoints > 0 && this.have < this.opt.minPoints;
        /** The median of each shown source in this drawing. @type {PlotMedian[]} */
        this.medians = [];
    }

    /** Draw everything, in order. */
    build() {
        this.grid();
        this.timeAxis();
        this.svg.append(this.g);
        this.thresholdLines();
        this.eventLines();
        this.sources();
        if (this.opt.median && !this.stacked && !this.few) this.medianLines();
        this.marks();
        this.edges();
        this.brushRect();
        this.crosshair();
    }

    /** Where this drawing put things, for the pointer and the tooltip. @returns {PlotGeometry} */
    geometry() {
        const { P, W, from, to, svg } = this;
        return { x: (t) => this.x(t), inv: (px) => from + ((px - P.l) / (W - P.l - P.r)) * (to - from), W, P, from, to, svg };
    }

    /**
     * The sources on view. Too few readings for a trend: no line, no area and no dot is drawn, only the empty plot and the sentence
     * (Kenny, 2026-10-18 17:45: a faint line still showed through the "3 of 7 days" plate).
     */
    sources() {
        const { chart } = this;
        /** The stacked sources' running total per reading. */
        const base = (chart.points[0] ?? []).map(() => 0);
        chart.data.series.forEach((series, si) => {
            if (!this.vis.includes(si) || this.few) return;
            const pts = chart.points[si].map((p, k) => [this.x(p[0]), this.y(this.stacked ? (base[k] ?? 0) + p[1] : p[1])]);
            if (pts.length === 0) return;
            const sg = this.seriesGroup(series, si);
            if (series.shape === 'columns') this.columns(sg, pts, base);
            else this.line(sg, pts, base, si);
            if (this.stacked) chart.points[si].forEach((p, k) => (base[k] = (base[k] ?? 0) + p[1]));
            this.g.append(sg);
            // A lone reading's dot outside the clip, so one at the window's edge (the newest) shows whole.
            if (series.shape !== 'columns' && pts.length === 1 && this.inR(chart.points[si][0])) this.svg.append(this.loneDot(series, si, pts[0]));
        });
    }

    /** A source's group, painted and marked hot or dim. @param {ChartSeries} series @param {number} si */
    seriesGroup(series, si) {
        const sg = s(this.doc, 'g', { class: 'kp-chart__series' });
        paintSeries(sg, series, si);
        if (this.chart.hot != null) sg.setAttribute('data-kp-state', this.chart.hot === si ? 'hot' : 'dim');
        return sg;
    }

    /**
     * A histogram: one column per reading, `columnShare` of the room its neighbours leave, stood on the baseline (or on the columns
     * below it when stacked) [wish-1120, homelab 104].
     * @param {Element} sg @param {number[][]} pts @param {number[]} base
     */
    columns(sg, pts, base) {
        const { P, W } = this;
        const gap = pts.length > 1 ? Math.min(...pts.slice(1).map((p, k) => p[0] - pts[k][0])) : (W - P.l - P.r) / MARKS.columnSlots;
        const width = Math.max(MARKS.columnMin, Math.min(MARKS.columnMax, gap * MARKS.columnShare));
        pts.forEach((p, k) => {
            const bottom = this.y(this.stacked ? (base[k] ?? 0) : 0);
            sg.append(
                s(this.doc, 'rect', {
                    class: 'kp-chart__column',
                    x: (p[0] - width / 2).toFixed(1),
                    y: Math.min(p[1], bottom).toFixed(1),
                    width: width.toFixed(1),
                    height: Math.max(0, bottom - p[1]).toFixed(1),
                }),
            );
        });
    }

    /** A source's line, over its stacked or lone area. @param {Element} sg @param {number[][]} pts @param {number[]} base @param {number} si */
    line(sg, pts, base, si) {
        const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
        if (this.stacked) {
            const back = this.chart.points[si]
                .map((p, k) => [this.x(p[0]), this.y(base[k] ?? 0)])
                .reverse()
                .map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`)
                .join('');
            sg.append(s(this.doc, 'path', { class: 'kp-chart__area kp-chart__area--stacked', d: `${d}${back}Z` }));
        } else if (this.vis.length <= 2) {
            const last = pts[pts.length - 1];
            const area = this.vis.length === 1 ? 'kp-chart__area kp-chart__area--alone' : 'kp-chart__area';
            sg.append(s(this.doc, 'path', { class: area, d: `${d}L${last[0]},${this.y(0)}L${pts[0][0]},${this.y(0)}Z` }));
        }
        sg.append(s(this.doc, 'path', { class: 'kp-chart__line', d }));
    }

    /** @param {ChartSeries} series @param {number} si @param {number[]} at */
    loneDot(series, si, at) {
        const dot = this.seriesGroup(series, si);
        dot.append(s(this.doc, 'circle', { class: 'kp-chart__point', cx: at[0], cy: at[1], r: MARKS.dot }));
        return dot;
    }

    /** The median of each shown source and, when asked, the runs of six or more on one side of it. */
    medianLines() {
        const { chart, P, W } = this;
        for (const si of this.vis) {
            const m = chartMedian(chart.points[si].filter((p) => this.inR(p)).map((p) => p[1]));
            if (m != null) this.medians.push({ si, label: chart.data.series[si].label || chart.label(), v: m });
        }
        for (const m of this.medians) {
            const sg = s(this.doc, 'g', { class: 'kp-chart__series kp-chart__median-series' });
            paintSeries(sg, chart.data.series[m.si], m.si);
            sg.append(s(this.doc, 'line', { class: 'kp-chart__median', x1: P.l, x2: W - P.r, y1: this.y(m.v), y2: this.y(m.v) }));
            this.g.append(sg);
            if (this.opt.runs) this.runs(m);
        }
        if (this.medians.length === 1) this.medianLabel(this.medians[0]);
    }

    /** One ring is built, the rest are copies of it: a typical-level chart marks hundreds. @param {PlotMedian} m */
    runs(m) {
        const inside = this.chart.points[m.si].filter((p) => this.inR(p));
        const marked = chartRuns(
            inside.map((p) => p[1]),
            m.v,
        );
        const proto = s(this.doc, 'g', { class: 'kp-chart__series kp-chart__run-series' });
        paintSeries(proto, this.chart.data.series[m.si], m.si);
        proto.append(s(this.doc, 'circle', { class: 'kp-chart__run', cx: 0, cy: 0, r: MARKS.ring }));
        const rings = this.doc.createDocumentFragment();
        for (const i of marked) {
            const ring = /** @type {SVGGElement} */ (proto.cloneNode(true));
            const circle = /** @type {SVGCircleElement} */ (ring.firstChild);
            circle.setAttribute('cx', String(this.x(inside[i][0])));
            circle.setAttribute('cy', String(this.y(inside[i][1])));
            rings.append(ring);
        }
        this.g.append(rings);
    }

    /** The one median's words at the plot's end, above its line or below it when there is no room. @param {PlotMedian} m */
    medianLabel(m) {
        const { P, W } = this;
        const up = this.y(m.v) - MARKS.labelRise < P.t + MARKS.labelRoom;
        const y = up ? this.y(m.v) + MARKS.labelDrop : this.y(m.v) - MARKS.labelRise;
        const text = s(this.doc, 'text', { class: 'kp-chart__median-label', x: W - P.r - MARKS.labelInset, y, 'text-anchor': 'end' });
        text.textContent = `${this.chart.medianWords(this.opt)} ${this.chart.fmt(m.v, 'tip')}`;
        this.svg.append(text);
    }

    /** A mark above the plot per event in the window, named in its title. */
    marks() {
        const { chart, doc, from, to, P } = this;
        const { strings, time } = chart;
        for (const ev of this.events) {
            const at = Math.min(to, Math.max(from, ev.at));
            const mark = s(doc, 'g', { class: 'kp-chart__mark', 'data-kp-tone': chart.toneOf(ev), 'data-at': at });
            mark.append(s(doc, 'circle', { class: 'kp-chart__mark-hit', cx: this.x(at), cy: P.t - MARKS.markRise, r: MARKS.markHit }));
            mark.append(s(doc, 'circle', { class: 'kp-chart__mark-dot', cx: this.x(at), cy: P.t - MARKS.markRise, r: MARKS.markDot }));
            const title = s(doc, 'title');
            title.textContent =
                ev.until != null && ev.until > ev.at
                    ? strings.markBand(ev.label, time(ev.at, 'full', {}), time(ev.until, 'full', {}))
                    : strings.mark(ev.label, time(ev.at, 'full', {}));
            mark.append(title);
            this.svg.append(mark);
        }
    }

    /** Events past the window: an arrow at that edge with their count. */
    edges() {
        const { doc, P, W } = this;
        const { strings } = this.chart;
        for (const [count, side] of /** @type {const} */ ([
            [this.beforeCount, 'start'],
            [this.afterCount, 'end'],
        ])) {
            if (count === 0) continue;
            const edge = s(doc, 'g', { class: 'kp-chart__edge', 'data-kp-side': side });
            const x = side === 'start' ? P.l + MARKS.edgeInset : W - P.r - MARKS.edgeInset;
            const text = s(doc, 'text', { class: 'kp-chart__edge-text', x, y: P.t - MARKS.edgeRise, 'text-anchor': side === 'start' ? 'start' : 'end' });
            text.textContent = side === 'start' ? `◂ ${count}` : `${count} ▸`;
            const title = s(doc, 'title');
            title.textContent = side === 'start' ? strings.edgeBefore(count) : strings.edgeAfter(count);
            edge.append(title, text);
            this.svg.append(edge);
        }
    }

    /** The span a drag is choosing. */
    brushRect() {
        const { brush } = this.chart;
        if (!brush) return;
        const { P, H } = this;
        const rect = { class: 'kp-chart__brush', x: Math.min(brush.x0, brush.x1), y: P.t, width: Math.abs(brush.x1 - brush.x0), height: H - P.t - P.b };
        this.svg.append(s(this.doc, 'rect', rect));
    }

    /** The crosshair at the pin or the cursor, with a dot where it meets each source. */
    crosshair() {
        const { chart, from, to, P, H } = this;
        const t = chart.pinned ?? chart.cursor;
        if (t == null || t < from || t > to) return;
        const pinned = chart.pinned != null ? 'kp-chart__crosshair kp-chart__crosshair--pinned' : 'kp-chart__crosshair';
        this.svg.append(s(this.doc, 'line', { class: pinned, x1: this.x(t), x2: this.x(t), y1: P.t, y2: H - P.b }));
        const acc = (chart.points[0] ?? []).map(() => 0);
        chart.data.series.forEach((series, si) => {
            const pts = chart.points[si];
            if (!this.vis.includes(si) || pts.length === 0) return;
            const k = indexAt(pts, t);
            const v = pts[k][1] + (this.stacked ? (acc[k] ?? 0) : 0);
            if (this.stacked) pts.forEach((p, j) => (acc[j] += p[1]));
            const r = chart.hot === si ? MARKS.snapHot : MARKS.dot;
            const dot = s(this.doc, 'circle', { class: 'kp-chart__snap', cx: this.x(pts[k][0]), cy: this.y(v), r });
            paintSeries(dot, series, si);
            this.svg.append(dot);
        });
    }
}
