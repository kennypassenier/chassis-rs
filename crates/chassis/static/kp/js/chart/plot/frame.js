// The frame of one drawing of a full chart: its scales, the grid, the time axis, the thresholds and the events' bands.
import { s } from '../dom.js';
import { niceMax } from '../format.js';
import { timeTicks } from '../time.js';
/** @typedef {import('./draw.js').PlotDraw} PlotDraw */
/** @typedef {import('../words.js').ChartEvent} ChartEvent */
/** @typedef {import('../words.js').ChartPoint} ChartPoint */
/** @typedef {import('../words.js').ChartWindow} ChartWindow */

/** The measures of a drawing, in SVG pixels unless named otherwise. */
export const LAYOUT = Object.freeze({
    /** The narrowest a plot is drawn. */
    minWidth: 240,
    /** The room above the highest threshold, as a factor. */
    headroom: 1.08,
    /** The left padding: at least this, else the longest value tick's characters at `charWidth` plus `tickRoom`. */
    padLeft: 30,
    charWidth: 7,
    tickRoom: 12,
    padRight: 10,
    padTop: 18,
    padBottom: 22,
    /** A value tick's gap from the plot, its drop below its line, and the time ticks' distance from the bottom. */
    tickGap: 6,
    tickDrop: 4,
    axisLift: 6,
    /** The least room between two time ticks. */
    tickSpacing: 70,
    /** How far a band and an event line reach above the plot, and how far a bracket's ends reach into it. */
    bandRise: 4,
    bracketDrop: 8,
    /** The size of a hatch pattern's tile. */
    hatch: 6,
});

export class PlotFrame {
    /**
     * @param {PlotDraw} chart
     * @param {ChartWindow} win
     * @param {number} H the plot's height
     */
    constructor(chart, win, H) {
        const { data, doc } = chart;
        this.chart = chart;
        this.doc = doc;
        this.from = win.from;
        this.to = win.to;
        this.H = H;
        this.W = Math.max(LAYOUT.minWidth, chart.ui.plot.clientWidth);
        this.vis = chart.visible();
        this.stacked = data.stacked ?? false;
        const thresholds = Array.isArray(data.threshold) ? data.threshold : data.threshold != null ? [data.threshold] : [];
        this.thresholds = thresholds.filter(Number.isFinite);
        this.hi = this.top();
        this.ticksY = [0, this.hi / 2, this.hi].map((v) => chart.fmt(v, 'axis'));
        const longest = Math.max(...this.ticksY.map((t) => t.length));
        this.P = { l: Math.max(LAYOUT.padLeft, longest * LAYOUT.charWidth + LAYOUT.tickRoom), r: LAYOUT.padRight, t: LAYOUT.padTop, b: LAYOUT.padBottom };
        this.svg = /** @type {SVGSVGElement} */ (s(doc, 'svg', { viewBox: `0 0 ${this.W} ${H}`, height: H, 'aria-hidden': 'true' }));
        this.defs = s(doc, 'defs');
        this.g = s(doc, 'g', { 'clip-path': `url(#${chart.clip})` });
        this.opt = chart.option();
        /** The hatch patterns this drawing needs, one per tone. @type {Set<string>} */
        this.hatches = new Set();
        /** The time ticks, kept inside the plot's ends once it is in the page. @type {SVGTextElement[]} */
        this.axisLabels = [];
        /** The events in the window, and how many lie before and after it. @type {ChartEvent[]} */
        this.events = [];
        this.beforeCount = 0;
        this.afterCount = 0;
    }

    /** @param {number} t */
    x(t) {
        const { P } = this;
        return P.l + ((t - this.from) / (this.to - this.from)) * (this.W - P.l - P.r);
    }

    /** @param {number} v */
    y(v) {
        const { P, H } = this;
        return H - P.b - (v / this.hi) * (H - P.t - P.b);
    }

    /** @param {ChartPoint} p */
    inR(p) {
        return p[0] >= this.from && p[0] <= this.to;
    }

    /** The top of the value axis: the data's `yMax`, else a round value over every reading and threshold on view. */
    top() {
        const { data, points } = this.chart;
        let hi = data.yMax ?? 0;
        if (data.yMax != null) return hi;
        if (this.stacked) {
            (points[0] ?? []).forEach((p, k) => {
                if (this.inR(p)) hi = Math.max(hi, this.vis.reduce((sum, si) => sum + (points[si][k]?.[1] ?? 0), 0));
            });
        } else for (const si of this.vis) for (const p of points[si]) if (this.inR(p)) hi = Math.max(hi, p[1]);
        for (const level of this.thresholds) hi = Math.max(hi, level * LAYOUT.headroom);
        return niceMax(hi, data.unitKind);
    }

    /** The clip, the value grid and its ticks. */
    grid() {
        const { doc, svg, defs, P, W, H } = this;
        const cp = s(doc, 'clipPath', { id: this.chart.clip });
        cp.append(s(doc, 'rect', { x: P.l, y: 0, width: W - P.l - P.r, height: H }));
        defs.append(cp);
        svg.append(defs);
        [0, this.hi / 2, this.hi].forEach((v, k) => {
            svg.append(s(doc, 'line', { class: 'kp-chart__grid', x1: P.l, x2: W - P.r, y1: this.y(v), y2: this.y(v) }));
            const tick = s(doc, 'text', { class: 'kp-chart__tick', x: P.l - LAYOUT.tickGap, y: this.y(v) + LAYOUT.tickDrop, 'text-anchor': 'end' });
            tick.textContent = this.ticksY[k];
            svg.append(tick);
        });
    }

    /**
     * Time ticks on round wall-clock times in the group's zone: 15 or 30 min, one, two, three, six or twelve hours, or days (the
     * dashboard's tiers, with 30 min and 3 h added so a zoomed span keeps more than one tick), at least `tickSpacing` apart.
     */
    timeAxis() {
        const { chart, from, to, P, W, H } = this;
        const most = Math.max(2, Math.floor((W - P.l - P.r) / LAYOUT.tickSpacing));
        const axisKey = `${from} ${to} ${most} ${chart.ctx.timeZone}`;
        if (axisKey !== chart.axisMemo.key) chart.axisMemo = { key: axisKey, axis: timeTicks(from, to, most, chart.ctx.timeZone) };
        const { axis } = chart.axisMemo;
        for (const t of axis.ticks) {
            const tick = /** @type {SVGTextElement} */ (s(this.doc, 'text', { class: 'kp-chart__tick', x: this.x(t), y: H - LAYOUT.axisLift, 'text-anchor': 'middle' }));
            tick.textContent = chart.time(t, 'tick', { stride: axis.stride });
            this.svg.append(tick);
            this.axisLabels.push(tick);
        }
    }

    thresholdLines() {
        const { P, W } = this;
        this.thresholds.forEach((level, k) =>
            this.g.append(
                s(this.doc, 'line', {
                    class: k === 0 ? 'kp-chart__threshold' : 'kp-chart__threshold kp-chart__threshold--more',
                    x1: P.l,
                    x2: W - P.r,
                    y1: this.y(level),
                    y2: this.y(level),
                }),
            ),
        );
    }

    /** The events: a band (an event with `until`) is in the window while any of it is; the rest count at the edge. */
    eventLines() {
        const { from, to, P, H } = this;
        const pool = this.chart.shownEvents();
        this.events = pool.filter((ev) => ev.at <= to && (ev.until ?? ev.at) >= from);
        this.beforeCount = pool.filter((ev) => (ev.until ?? ev.at) < from).length;
        this.afterCount = pool.filter((ev) => ev.at > to).length;
        for (const ev of this.events) {
            if (ev.until != null && ev.until > ev.at) this.g.append(this.band(ev, ev.until));
            else this.g.append(s(this.doc, 'line', { class: 'kp-chart__event-line', x1: this.x(ev.at), x2: this.x(ev.at), y1: P.t - LAYOUT.bandRise, y2: H - P.b }));
        }
    }

    /** One band, drawn as the chart's `band` option says: a bracket along the top, a tint or a hatch. @param {ChartEvent} ev @param {number} until */
    band(ev, until) {
        const { doc, from, to, P, H } = this;
        const x0 = this.x(Math.max(ev.at, from));
        const x1 = this.x(Math.min(until, to));
        const tone = this.chart.toneOf(ev);
        const band = s(doc, 'g', { class: 'kp-chart__band', 'data-kp-tone': tone, 'data-kp-band': this.opt.band });
        const top = P.t - LAYOUT.bandRise;
        // A bracket is only a bar between two short ticks along the top, nothing across the readings.
        const foot = this.opt.band === 'bracket' ? P.t + LAYOUT.bracketDrop : H - P.b;
        if (this.opt.band === 'bracket') band.append(s(doc, 'line', { class: 'kp-chart__band-bar', x1: x0, x2: x1, y1: top, y2: top }));
        else band.append(this.bandFill(tone, x0, x1));
        if (ev.at >= from) band.append(s(doc, 'line', { class: 'kp-chart__band-edge', x1: x0, x2: x0, y1: top, y2: foot }));
        if (until <= to) band.append(s(doc, 'line', { class: 'kp-chart__band-edge', x1: x1, x2: x1, y1: top, y2: foot }));
        return band;
    }

    /** A band's fill: the tone's tint, or its hatch. @param {string} tone @param {number} x0 @param {number} x1 */
    bandFill(tone, x0, x1) {
        const { P, H } = this;
        const rect = s(this.doc, 'rect', {
            class: 'kp-chart__band-fill',
            x: x0,
            y: P.t - LAYOUT.bandRise,
            width: Math.max(1, x1 - x0),
            height: H - P.b - P.t + LAYOUT.bandRise,
        });
        if (this.opt.band === 'hatch') rect.setAttribute('fill', `url(#${this.hatchFor(tone)})`);
        return rect;
    }

    /** The hatch pattern of a tone, made once per drawing. @param {string} tone */
    hatchFor(tone) {
        const id = `${this.chart.clip}-hatch-${tone}`;
        if (this.hatches.has(id)) return id;
        this.hatches.add(id);
        const size = LAYOUT.hatch;
        const pattern = s(this.doc, 'pattern', { id, width: size, height: size, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)', 'data-kp-tone': tone });
        pattern.append(s(this.doc, 'line', { class: 'kp-chart__hatch', x1: 0, y1: 0, x2: 0, y2: size }));
        this.defs.append(pattern);
        return id;
    }
}
