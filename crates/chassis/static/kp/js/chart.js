// The one time chart every page draws, so its controls mean the same
// everywhere [scope-143]:
//
//   legend   hover / focus singles a source out (the others fade); a click
//            keeps it on or off, one or several, no modifier keys; Show all
//            and Esc reset
//   plot     a crosshair on every chart of the group, and a tooltip beside it
//            with each visible source's value, the time, the change over the
//            hour before (▲/▼ and the amount) and the events within reach; a
//            click pins the tooltip (✕ or Esc releases it)
//   drag     zooms every chart of the group to that span, with a "Zoomed ·
//            Reset" chip; a double-click or Esc resets
//   keys     ←/→ move the crosshair (Shift: ten points), Home/End, Enter
//            pins, Esc steps back: releases → shows all → resets the zoom
//   events   markers above the plot; hover shows the event, a click pins it
//            with its link
//   ranges   `[data-kp-chart-range]` buttons set the group's window
//   spark    `data-kp-chart="spark"`: the 24 h line of a tile, drawn by
//            drawSparkline() (js/kpi.js), on the group's crosshair
//
// Under the lines a soft area while one or two sources are on; with three or
// more, the lines alone. Colours are the theme's `--chart-1..5` in order; from
// the sixth source on they come round again with a dashed line, so no two
// sources look alike.
//
//   <div class="kp-chart-group" data-kp-chart-group data-kp-chart-span="24h">
//       <div class="kp-chart-group__bar">
//           <div class="kp-chart-ranges" role="group" aria-label="Time range">
//               <button type="button" class="kp-button kp-button--sm" data-kp-chart-range="1h">1 h</button>
//               <button type="button" class="kp-button kp-button--sm" data-kp-chart-range="24h">24 h</button>
//           </div>
//           <span class="kp-chart-zoom" data-kp-chart-zoom hidden></span>
//       </div>
//       <figure class="kp-chart" data-kp-chart aria-label="Pressure">
//           <figcaption class="kp-chart__title">Pressure, bar</figcaption>
//           <script type="application/json" data-kp-chart-data>{ "unit": "bar", "series": [ … ] }</script>
//       </figure>
//   </div>
//
// The data comes from the page: a JSON child as above, or setChartData(el,
// data) before or after attachCharts(root). The words are the dictionary's
// (`chart…` in js/strings.js). Nothing runs on import; attachCharts(root)
// returns a detach.

import { resolveLocale } from './locale.js';
import { getStrings } from './strings.js';
import { drawSparkline } from './kpi.js';

/** A chart: `data-kp-chart` (a plot) or `data-kp-chart="spark"`. */
export const CHART = '[data-kp-chart]';
/** Charts that share one crosshair, one zoom and one range. */
export const CHART_GROUP = '[data-kp-chart-group]';
/** Fired on a chart, bubbling, when its sources on change: `detail.on`, indexes (none = all shown). */
export const CHART_SELECT_EVENT = 'kp-chart-select';
/** Fired on a group, bubbling, when its zoom changes: `detail` `{ from, to }` or null. */
export const CHART_ZOOM_EVENT = 'kp-chart-zoom';
/** Fired on a group, bubbling, when a range button is pressed, before the charts redraw: `detail` `{ range, span }`. */
export const CHART_RANGE_EVENT = 'kp-chart-range';

/**
 * @typedef {[number, number]} ChartPoint time (ms since the epoch), value
 * @typedef {object} ChartSeries
 * @property {string} label
 * @property {ChartPoint[]} [points] oldest first
 * @property {number} [start] with `step` and `values`: evenly spaced points, compact in JSON
 * @property {number} [step] ms
 * @property {number[]} [values]
 * @property {string} [colour] the consumer's own colour (`var(--…)`) instead of the next `--chart-n`
 * @property {number} [total] shown in the legend while no time is under the crosshair
 * @typedef {object} ChartEvent
 * @property {number} at ms since the epoch
 * @property {string} label
 * @property {'critical' | 'warning' | 'info'} [tone]
 * @property {string} [href] offered once the event is pinned
 * @typedef {object} ChartData
 * @property {string} [label] the chart's name; else the element's `aria-label`
 * @property {string} [unit] printed after a value ("bar", "m³/h")
 * @property {number} [digits] fraction digits of a value; else by its size
 * @property {ChartSeries[]} series
 * @property {ChartEvent[]} [events]
 * @property {number} [from] the window, when the group's range should not set it
 * @property {number} [to]
 * @property {number} [yMax] the top of the axis; else a round number above the highest value
 * @property {number} [threshold] a dashed line (an alarm level)
 * @property {boolean} [stacked] sources on top of each other, as areas
 * @property {number} [height] px, 168 by default
 * @typedef {{ from: number, to: number }} ChartWindow
 * @typedef {ReturnType<typeof chartWords>} ChartStrings
 * @typedef {import('./strings.js').Strings} Strings
 */

/**
 * The words a chart says, from the dictionary (`chart…` in js/strings.js),
 * with the caller's own on top: `attachCharts(root, { strings })` takes any
 * of the dictionary's keys.
 * @param {Partial<Strings>} [overrides]
 */
export function chartWords(overrides) {
    const s = { ...getStrings(), ...overrides };
    return {
        plot: s.chartPlot,
        spark: s.chartSpark,
        sources: s.chartSources,
        source: s.chartSource,
        showAll: s.chartShowAll,
        showAllTitle: s.chartShowAllTitle,
        hintPointer: s.chartHintPointer,
        hintTouch: s.chartHintTouch,
        pinned: s.chartPinned,
        release: s.chartRelease,
        change: s.chartChange,
        open: s.chartOpen,
        mark: s.chartMark,
        zoomed: s.chartZoomed,
        reset: s.chartReset,
        resetTitle: s.chartResetTitle,
        up: s.chartUp,
        down: s.chartDown,
        same: s.chartSame,
        now: s.chartNow,
    };
}

/**
 * The dash of the `i`-th source's line: none for the first five (each its
 * own `--chart-n`), one of three dashes when the colours come round again.
 * @param {number} i
 * @returns {0 | 1 | 2 | 3} 0 = solid
 */
export const dashOf = (i) => /** @type {0 | 1 | 2 | 3} */ (i < 5 ? 0 : (Math.floor(i / 5 - 1) % 3) + 1);

/**
 * "1h", "24h", "7d", "15m" in ms; anything else null.
 * @param {string | null | undefined} text
 * @returns {number | null}
 */
export function parseSpan(text) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(m|h|d)\s*$/.exec(text ?? '');
    if (!m) return null;
    return Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[/** @type {'m' | 'h' | 'd'} */ (m[2])];
}

/**
 * The top of the y axis: a round number just above the highest value.
 * @param {number} v
 */
export function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v * 1.05) return m * p;
    return 10 * p;
}

/**
 * The index of the point nearest to `t` (the points oldest first).
 * @param {readonly ChartPoint[]} points
 * @param {number} t
 */
export function indexAt(points, t) {
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (points[mid][0] < t) lo = mid;
        else hi = mid;
    }
    return Math.abs(points[hi][0] - t) < Math.abs(points[lo][0] - t) ? hi : lo;
}

/**
 * A source's change over the hour before point `i`: its value there minus
 * the value an hour of points earlier (or the first point).
 * @param {readonly ChartPoint[]} points
 * @param {number} i
 */
export function hourChange(points, i) {
    const step = points.length > 1 ? points[1][0] - points[0][0] || 3_600_000 : 3_600_000;
    const back = Math.max(0, i - Math.max(1, Math.round(3_600_000 / step)));
    return points[i][1] - points[back][1];
}

/**
 * The legend's selection after a click on source `i` of `n`: on or off,
 * several allowed; all on is the same as none (everything shown).
 * @param {ReadonlySet<number>} sel
 * @param {number} i
 * @param {number} n
 * @returns {Set<number>}
 */
export function toggleSource(sel, i, n) {
    const next = new Set(sel);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    if (next.size === n) next.clear();
    return next;
}

/**
 * A series' points, whichever way it was given.
 * @param {ChartSeries} series
 * @returns {ChartPoint[]}
 */
export function pointsOf(series) {
    if (series.points) return series.points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const { start = 0, step = 60_000, values = [] } = series;
    /** @type {ChartPoint[]} */
    const out = [];
    values.forEach((v, at) => {
        if (Number.isFinite(v)) out.push([start + at * step, v]);
    });
    return out;
}

/** The data a page gave a chart before or after it was attached. @type {WeakMap<Element, ChartData>} */
const DATA = new WeakMap();
/** The chart drawn in an element. @type {WeakMap<Element, ChartState>} */
const CHARTS = new WeakMap();

/**
 * @typedef {object} ChartState
 * @property {HTMLElement} host
 * @property {boolean} spark
 * @property {() => void} draw
 * @property {(t: number | null, own: boolean) => void} cursorAt
 * @property {(data: ChartData) => void} setData
 * @property {() => number | null} lastTime
 * @property {() => void} destroy
 */

/**
 * Give a chart its sources and events (the page's own data). Before the chart
 * is attached the data waits for it; a `<script type="application/json"
 * data-kp-chart-data>` child is the markup way to do the same.
 * @param {Element} el the `[data-kp-chart]` element
 * @param {ChartData} data
 */
export function setChartData(el, data) {
    DATA.set(el, data);
    CHARTS.get(el)?.setData(data);
}

/** The data in a chart's JSON child, if any. @param {Element} el @returns {ChartData | null} */
function dataInMarkup(el) {
    const script = el.querySelector(':scope > script[type="application/json"][data-kp-chart-data]');
    if (!script) return null;
    try {
        return JSON.parse(script.textContent ?? '');
    } catch {
        return null;
    }
}

const SVGNS = 'http://www.w3.org/2000/svg';
let clipIds = 0;

/**
 * An element with attributes and children.
 * @param {Document} doc
 * @param {string} tag
 * @param {Record<string, string | number | null | undefined>} [attrs]
 * @param {...(Node | string)} kids
 * @returns {HTMLElement}
 */
function h(doc, tag, attrs = {}, ...kids) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
    el.append(...kids);
    return el;
}

/**
 * An SVG element with attributes.
 * @param {Document} doc
 * @param {string} tag
 * @param {Record<string, string | number | null | undefined>} [attrs]
 * @returns {SVGElement}
 */
function s(doc, tag, attrs = {}) {
    const el = /** @type {SVGElement} */ (doc.createElementNS(SVGNS, tag));
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
    return el;
}

/** Charts that share one crosshair, one zoom and one range. */
class ChartGroup {
    /**
     * @param {HTMLElement | null} el the `[data-kp-chart-group]`, or none
     * @param {ChartStrings} strings
     * @param {(t: number, style: 'clock' | 'day' | 'full') => string} time
     * @param {string} locale
     */
    constructor(el, strings, time, locale) {
        this.el = el;
        this.strings = strings;
        this.time = time;
        this.locale = locale;
        /** @type {Set<ChartState>} */
        this.charts = new Set();
        /** @type {ChartWindow | null} */
        this.zoom = null;
        this.span = parseSpan(el?.dataset.kpChartSpan);
        /** @type {(() => void)[]} */
        this.stops = [];
        this.chip = /** @type {HTMLElement | null} */ (el?.querySelector('[data-kp-chart-zoom]') ?? null);
        this.chipText = null;
        if (el && this.chip) this.buildChip(el.ownerDocument);
        if (el) this.wireRanges();
    }

    /** @param {Document} doc */
    buildChip(doc) {
        const chip = /** @type {HTMLElement} */ (this.chip);
        const text = h(doc, 'span');
        const reset = h(doc, 'button', { type: 'button', class: 'kp-chart-zoom__reset', title: this.strings.resetTitle }, this.strings.reset);
        reset.addEventListener('click', () => this.setZoom(null));
        chip.classList.add('kp-chart-zoom');
        chip.setAttribute('role', 'status');
        chip.replaceChildren(text, reset);
        chip.hidden = true;
        this.chipText = text;
        this.stops.push(() => chip.replaceChildren());
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
        for (const b of buttons) b.addEventListener('click', onClick);
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
        if (this.chip && this.chipText) {
            this.chip.hidden = zoom == null;
            if (zoom) this.chipText.textContent = this.strings.zoomed(this.time(zoom.from, 'clock'), this.time(zoom.to, 'clock'));
        }
        this.el?.dispatchEvent(new CustomEvent(CHART_ZOOM_EVENT, { bubbles: true, detail: zoom }));
    }

    /** @param {number | null} t @param {ChartState | null} owner */
    cursor(t, owner) {
        for (const c of this.charts) c.cursorAt(t, c === owner);
    }

    stop() {
        for (const f of this.stops) f();
    }
}

/**
 * Draw every `[data-kp-chart]` under `root` and wire it: the charts of one
 * `[data-kp-chart-group]` (or, outside any group, all the others under
 * `root`) share their crosshair, zoom and range. A chart's data comes from
 * its JSON child or from setChartData(), before or after this runs.
 * @param {ParentNode} [root]
 * @param {{ strings?: Partial<Strings>, locale?: string }} [options] `strings`: any of the dictionary's `chart…` words for these charts only;
 *   `locale`: the clock and the numbers, else the nearest `lang` above each group
 * @returns {() => void} detach: listeners off, the drawn parts removed
 */
export function attachCharts(root = document, options = {}) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    if (!view) return () => {};
    const strings = chartWords(options.strings);
    // A group's clock and numbers are the locale given, else the nearest
    // `lang` above the group (or above the chart, outside a group).
    /** @type {Map<string, (t: number, style: 'clock' | 'day' | 'full') => string>} */
    const clocks = new Map();
    /** @param {string} locale */
    const clockIn = (locale) => {
        let time = clocks.get(locale);
        if (!time) {
            const formats = {
                clock: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
                day: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }),
                full: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            };
            time = (t, style) => formats[style].format(t);
            clocks.set(locale, time);
        }
        return time;
    };

    /** @type {Map<Element | null, ChartGroup>} */
    const groups = new Map();
    /** @type {ChartState[]} */
    const states = [];
    for (const host of /** @type {HTMLElement[]} */ ([...root.querySelectorAll(CHART)])) {
        if (CHARTS.has(host)) continue;
        const groupEl = /** @type {HTMLElement | null} */ (host.closest(CHART_GROUP));
        let group = groups.get(groupEl);
        if (!group) {
            const locale = resolveLocale(options.locale, groupEl ?? host);
            group = new ChartGroup(groupEl, strings, clockIn(locale), locale);
            groups.set(groupEl, group);
        }
        const state = host.dataset.kpChart === 'spark' ? sparkChart(host, group, group.locale) : plotChart(host, group, group.locale);
        CHARTS.set(host, state);
        group.charts.add(state);
        states.push(state);
    }
    // The window of a range depends on every chart's newest point: draw once
    // all of a group are in.
    for (const state of states) state.draw();

    // Esc anywhere outside a chart (and outside a dialog) resets the zoom.
    /** @param {KeyboardEvent} e */
    const onEsc = (e) => {
        if (e.key !== 'Escape') return;
        const target = /** @type {Element | null} */ (e.target instanceof Element ? e.target : null);
        if (target?.closest('.kp-chart__plot, dialog')) return;
        for (const group of groups.values()) if (group.zoom) group.setZoom(null);
    };
    doc.addEventListener('keydown', onEsc);
    const resize = new view.ResizeObserver((entries) => {
        for (const entry of entries) CHARTS.get(entry.target)?.draw();
    });
    for (const state of states) resize.observe(state.host);

    return () => {
        doc.removeEventListener('keydown', onEsc);
        resize.disconnect();
        for (const state of states) {
            state.destroy();
            CHARTS.delete(state.host);
        }
        for (const group of groups.values()) group.stop();
    };
}

/**
 * A value in its unit, as the tooltip, the legend and the readout print it.
 * @param {string} locale
 * @param {ChartData} data
 */
function valueFormat(locale, data) {
    /** @type {Map<number, Intl.NumberFormat>} */
    const cache = new Map();
    /** @param {number} v @param {boolean} [bare] without the unit */
    return (v, bare = false) => {
        const digits = data.digits ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
        let nf = cache.get(digits);
        if (!nf) {
            nf = new Intl.NumberFormat(locale, { minimumFractionDigits: data.digits ?? 0, maximumFractionDigits: digits });
            cache.set(digits, nf);
        }
        return bare || !data.unit ? nf.format(v) : `${nf.format(v)} ${data.unit}`;
    };
}

/**
 * The colour hooks of source `i` on an element: `data-kp-series` (1-5, its
 * `--chart-n`), `data-kp-dash` from the sixth on, or the series' own colour.
 * @param {Element} el
 * @param {ChartSeries} series
 * @param {number} i
 */
function paintSeries(el, series, i) {
    el.setAttribute('data-kp-series', String((i % 5) + 1));
    const dash = dashOf(i);
    if (dash) el.setAttribute('data-kp-dash', String(dash));
    if (series.colour) /** @type {HTMLElement | SVGElement} */ (el).style.setProperty('--kp-chart-series', series.colour);
}

/**
 * The full chart: axes, sources, events, legend, tooltip, readout.
 * @param {HTMLElement} host
 * @param {ChartGroup} group
 * @param {string} locale
 * @returns {ChartState}
 */
function plotChart(host, group, locale) {
    const doc = host.ownerDocument;
    const { strings, time } = group;
    /** @type {ChartData} */
    let data = DATA.get(host) ?? dataInMarkup(host) ?? { series: [] };
    /** @type {ChartPoint[][]} */
    let points = [];
    let fmt = valueFormat(locale, data);
    /** @type {Set<number>} */
    let sel = new Set();
    /** @type {number | null} */
    let hot = null;
    /** @type {number | null} */
    let pinned = null;
    /** @type {number | null} */
    let cursor = null;
    /** @type {{ x0: number, x1: number } | null} */
    let brush = null;
    const clip = `kp-chart-clip-${++clipIds}`;
    const label = () => data.label ?? host.getAttribute('aria-label') ?? '';

    host.classList.add('kp-chart');
    const plot = h(doc, 'div', { class: 'kp-chart__plot', tabindex: '0', role: 'application' });
    const tip = h(doc, 'div', { class: 'kp-chart__tip' });
    tip.hidden = true;
    const readout = h(doc, 'p', { class: 'kp-chart__readout kp-sr-only', 'aria-live': 'polite' });
    const legend = h(doc, 'div', { class: 'kp-chart__legend', role: 'group' });
    const showAll = h(doc, 'button', { type: 'button', class: 'kp-chart__show-all', title: strings.showAllTitle }, strings.showAll);
    showAll.hidden = true;
    const hint = h(
        doc,
        'p',
        { class: 'kp-chart__hint' },
        h(doc, 'span', { 'data-kp-when': 'pointer' }, strings.hintPointer),
        h(doc, 'span', { 'data-kp-when': 'touch' }, strings.hintTouch),
    );
    const parts = [plot, tip, readout, legend, hint];
    host.append(...parts);

    /** @type {{ button: HTMLElement, value: HTMLElement }[]} */
    let items = [];
    /** @type {null | { x: (t: number) => number, inv: (px: number) => number, W: number, P: { l: number, r: number, t: number, b: number }, from: number, to: number, svg: SVGSVGElement }} */
    let geo = null;

    const visible = () => points.map((_, i) => i).filter((i) => sel.size === 0 || sel.has(i));
    /** @returns {ChartWindow | null} */
    const range = () => {
        if (group.zoom) return group.zoom;
        const first = Math.min(...points.map((p) => p[0]?.[0] ?? Infinity));
        const to = data.to ?? group.end() ?? Math.max(...points.map((p) => p[p.length - 1]?.[0] ?? -Infinity));
        const from = data.from ?? (group.span != null ? to - group.span : first);
        return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null;
    };
    /** @param {Set<number>} next */
    const setSel = (next) => {
        sel = next;
        host.dispatchEvent(new CustomEvent(CHART_SELECT_EVENT, { bubbles: true, detail: { on: [...sel].sort((a, b) => a - b) } }));
    };

    function buildLegend() {
        legend.setAttribute('aria-label', strings.sources(label()));
        plot.setAttribute('aria-label', strings.plot(label()));
        items = data.series.map((series, i) => {
            const swatch = h(doc, 'i', { class: 'kp-chart__swatch', 'aria-hidden': 'true' });
            const value = h(doc, 'b', { class: 'kp-chart__value' });
            const button = h(
                doc,
                'button',
                { type: 'button', class: 'kp-chart__source', title: strings.source(series.label) },
                swatch,
                h(doc, 'span', {}, series.label),
                value,
            );
            paintSeries(button, series, i);
            const isolate = (/** @type {number | null} */ v) => () => {
                hot = v;
                draw();
            };
            button.addEventListener('pointerenter', isolate(i));
            button.addEventListener('pointerleave', isolate(null));
            button.addEventListener('focus', isolate(i));
            button.addEventListener('blur', isolate(null));
            button.addEventListener('click', () => {
                setSel(toggleSource(sel, i, data.series.length));
                draw();
            });
            return { button, value };
        });
        legend.replaceChildren(...items.map((it) => it.button), showAll);
        const many = data.series.length > 1;
        legend.hidden = !many;
        hint.hidden = !many;
    }
    showAll.addEventListener('click', () => {
        setSel(new Set());
        draw();
    });
    legend.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || sel.size === 0) return;
        e.stopPropagation();
        setSel(new Set());
        draw();
    });

    function draw() {
        const win = range();
        if (!win || points.length === 0) {
            plot.replaceChildren();
            geo = null;
            tip.hidden = true;
            return;
        }
        const { from, to } = win;
        const W = Math.max(240, plot.clientWidth);
        const H = data.height ?? 168;
        const vis = visible();
        const stacked = data.stacked ?? false;
        const inR = (/** @type {ChartPoint} */ p) => p[0] >= from && p[0] <= to;
        let hi = data.yMax ?? 0;
        if (data.yMax == null) {
            if (stacked) {
                (points[0] ?? []).forEach((p, k) => {
                    if (inR(p))
                        hi = Math.max(
                            hi,
                            vis.reduce((sum, si) => sum + (points[si][k]?.[1] ?? 0), 0),
                        );
                });
            } else for (const si of vis) for (const p of points[si]) if (inR(p)) hi = Math.max(hi, p[1]);
            if (data.threshold != null) hi = Math.max(hi, data.threshold * 1.08);
            hi = niceMax(hi);
        }
        const ticksY = [0, hi / 2, hi].map((v) => fmt(v, true));
        const P = { l: Math.max(30, Math.max(...ticksY.map((t) => t.length)) * 7 + 12), r: 10, t: 18, b: 22 };
        const x = (/** @type {number} */ t) => P.l + ((t - from) / (to - from)) * (W - P.l - P.r);
        const y = (/** @type {number} */ v) => H - P.b - (v / hi) * (H - P.t - P.b);
        const svg = /** @type {SVGSVGElement} */ (s(doc, 'svg', { viewBox: `0 0 ${W} ${H}`, height: H, 'aria-hidden': 'true' }));
        const defs = s(doc, 'defs');
        const cp = s(doc, 'clipPath', { id: clip });
        cp.append(s(doc, 'rect', { x: P.l, y: 0, width: W - P.l - P.r, height: H }));
        defs.append(cp);
        svg.append(defs);
        [0, hi / 2, hi].forEach((v, k) => {
            svg.append(s(doc, 'line', { class: 'kp-chart__grid', x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }));
            const tick = s(doc, 'text', { class: 'kp-chart__tick', x: P.l - 6, y: y(v) + 4, 'text-anchor': 'end' });
            tick.textContent = ticksY[k];
            svg.append(tick);
        });
        // Time ticks on round local times: 15 or 30 min, one, three or six
        // hours, or a day (the dashboard's tiers, with 30 min and 3 h added
        // so a zoomed span keeps more than one tick).
        const span = to - from;
        const HOUR = 3_600_000;
        const stepT =
            span <= 2 * HOUR
                ? HOUR / 4
                : span <= 4 * HOUR
                  ? HOUR / 2
                  : span <= 8 * HOUR
                    ? HOUR
                    : span <= 16 * HOUR
                      ? 3 * HOUR
                      : span <= 28.8 * HOUR
                        ? 6 * HOUR
                        : 24 * HOUR;
        const most = Math.max(2, Math.floor((W - P.l - P.r) / 70));
        let every = 1;
        while (span / (stepT * every) > most) every++;
        const stride = stepT * every;
        const offset = new Date(from).getTimezoneOffset() * 60_000;
        for (let t = Math.ceil((from - offset) / stride) * stride + offset; t <= to; t += stride) {
            const tick = s(doc, 'text', { class: 'kp-chart__tick', x: x(t), y: H - 6, 'text-anchor': 'middle' });
            tick.textContent = time(t, stepT >= 86_400_000 ? 'day' : 'clock');
            svg.append(tick);
        }
        const g = s(doc, 'g', { 'clip-path': `url(#${clip})` });
        svg.append(g);
        if (data.threshold != null)
            g.append(s(doc, 'line', { class: 'kp-chart__threshold', x1: P.l, x2: W - P.r, y1: y(data.threshold), y2: y(data.threshold) }));
        const events = (data.events ?? []).filter((ev) => ev.at >= from && ev.at <= to);
        for (const ev of events) g.append(s(doc, 'line', { class: 'kp-chart__event-line', x1: x(ev.at), x2: x(ev.at), y1: P.t - 4, y2: H - P.b }));
        const base = (points[0] ?? []).map(() => 0);
        const fill = vis.length <= 2 && !stacked;
        data.series.forEach((series, si) => {
            if (!vis.includes(si)) return;
            const pts = points[si].map((p, k) => [x(p[0]), y(stacked ? (base[k] ?? 0) + p[1] : p[1])]);
            if (pts.length === 0) return;
            const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
            const sg = s(doc, 'g', { class: 'kp-chart__series' });
            paintSeries(sg, series, si);
            if (hot != null) sg.setAttribute('data-kp-state', hot === si ? 'hot' : 'dim');
            if (stacked) {
                const back = points[si]
                    .map((p, k) => [x(p[0]), y(base[k] ?? 0)])
                    .reverse()
                    .map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`)
                    .join('');
                sg.append(s(doc, 'path', { class: 'kp-chart__area kp-chart__area--stacked', d: `${d}${back}Z` }));
                points[si].forEach((p, k) => (base[k] = (base[k] ?? 0) + p[1]));
            } else if (fill) {
                const last = pts[pts.length - 1];
                sg.append(
                    s(doc, 'path', {
                        class: vis.length === 1 ? 'kp-chart__area kp-chart__area--alone' : 'kp-chart__area',
                        d: `${d}L${last[0]},${y(0)}L${pts[0][0]},${y(0)}Z`,
                    }),
                );
            }
            if (pts.length === 1) sg.append(s(doc, 'circle', { class: 'kp-chart__point', cx: pts[0][0], cy: pts[0][1], r: 3.5 }));
            sg.append(s(doc, 'path', { class: 'kp-chart__line', d }));
            g.append(sg);
        });
        for (const ev of events) {
            const mark = s(doc, 'g', { class: 'kp-chart__mark', 'data-kp-tone': ev.tone ?? 'info', 'data-at': ev.at });
            mark.append(s(doc, 'circle', { class: 'kp-chart__mark-hit', cx: x(ev.at), cy: P.t - 9, r: 10 }));
            mark.append(s(doc, 'circle', { class: 'kp-chart__mark-dot', cx: x(ev.at), cy: P.t - 9, r: 5 }));
            const title = s(doc, 'title');
            title.textContent = strings.mark(ev.label, time(ev.at, 'full'));
            mark.append(title);
            svg.append(mark);
        }
        if (brush) {
            svg.append(
                s(doc, 'rect', {
                    class: 'kp-chart__brush',
                    x: Math.min(brush.x0, brush.x1),
                    y: P.t,
                    width: Math.abs(brush.x1 - brush.x0),
                    height: H - P.t - P.b,
                }),
            );
        }
        const t = pinned ?? cursor;
        if (t != null && t >= from && t <= to) {
            svg.append(
                s(doc, 'line', {
                    class: pinned != null ? 'kp-chart__crosshair kp-chart__crosshair--pinned' : 'kp-chart__crosshair',
                    x1: x(t),
                    x2: x(t),
                    y1: P.t,
                    y2: H - P.b,
                }),
            );
            const acc = (points[0] ?? []).map(() => 0);
            data.series.forEach((series, si) => {
                if (!vis.includes(si) || points[si].length === 0) return;
                const k = indexAt(points[si], t);
                const v = points[si][k][1] + (stacked ? (acc[k] ?? 0) : 0);
                if (stacked) points[si].forEach((p, j) => (acc[j] += p[1]));
                const dot = s(doc, 'circle', { class: 'kp-chart__snap', cx: x(points[si][k][0]), cy: y(v), r: hot === si ? 4.5 : 3.5 });
                paintSeries(dot, series, si);
                svg.append(dot);
            });
        }
        plot.replaceChildren(svg);
        geo = { x, inv: (px) => from + ((px - P.l) / (W - P.l - P.r)) * (to - from), W, P, from, to, svg };
        paintLegend();
        paintTip();
    }

    function paintLegend() {
        const t = pinned ?? cursor;
        data.series.forEach((series, si) => {
            const it = items[si];
            if (!it) return;
            const on = sel.size === 0 || sel.has(si);
            const pts = points[si];
            const v = pts.length === 0 ? null : t != null ? pts[indexAt(pts, t)][1] : pts[pts.length - 1][1];
            it.button.setAttribute('aria-pressed', String(sel.has(si)));
            it.button.toggleAttribute('data-kp-off', !on);
            it.value.textContent = series.total != null && t == null ? series.total.toLocaleString(locale) : v == null ? '' : fmt(v);
        });
        showAll.hidden = sel.size === 0;
    }

    /** What is under the crosshair at `t`, for the tooltip and the readout. @param {number} t */
    const rowsAt = (t) =>
        visible()
            .filter((si) => points[si].length > 0)
            .map((si) => {
                const k = indexAt(points[si], t);
                return { si, label: data.series[si].label || label(), v: points[si][k][1], d: hourChange(points[si], k) };
            })
            .sort((a, b) => b.v - a.v);
    /** The events within reach of `t`: a thirtieth of the window. @param {number} t */
    const eventsNear = (t) => {
        if (!geo) return [];
        const reach = (geo.to - geo.from) / 30;
        return (data.events ?? []).filter((ev) => Math.abs(ev.at - t) < reach);
    };
    /** @param {number} d */
    const change = (d) => (d === 0 ? '±0' : `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}`);

    function paintTip() {
        const t = pinned ?? cursor;
        if (t == null || !geo || t < geo.from || t > geo.to) {
            tip.hidden = true;
            return;
        }
        const head = h(doc, 'p', { class: 'kp-chart__tip-head' }, h(doc, 'b', {}, time(Math.round(t / 60_000) * 60_000, 'full')));
        if (pinned != null) {
            const release = h(
                doc,
                'button',
                { type: 'button', class: 'kp-chart__release', 'aria-label': strings.release, title: strings.release },
                '✕',
            );
            release.addEventListener('click', () => {
                pinned = null;
                draw();
                plot.focus();
            });
            head.append(h(doc, 'span', { class: 'kp-chart__pin' }, strings.pinned, release));
        }
        const rows = rowsAt(t).map((r) => {
            const swatch = h(doc, 'i', { class: 'kp-chart__swatch', 'aria-hidden': 'true' });
            paintSeries(swatch, data.series[r.si], r.si);
            const row = h(
                doc,
                'div',
                { class: 'kp-chart__tip-row' },
                swatch,
                h(doc, 'span', {}, r.label),
                h(doc, 'span', { class: 'kp-chart__num' }, fmt(r.v)),
                h(
                    doc,
                    'span',
                    { class: 'kp-chart__num kp-chart__delta', 'data-kp-direction': r.d > 0 ? 'up' : r.d < 0 ? 'down' : null },
                    change(r.d),
                ),
            );
            if (hot === r.si) row.setAttribute('data-kp-state', 'hot');
            return row;
        });
        const near = eventsNear(t).map((ev) => {
            const line = h(
                doc,
                'p',
                { class: 'kp-chart__tip-event' },
                h(doc, 'i', { class: 'kp-chart__dot', 'data-kp-tone': ev.tone ?? 'info', 'aria-hidden': 'true' }),
                `${time(ev.at, 'clock')} ${ev.label}`,
            );
            if (pinned != null && ev.href) line.append(h(doc, 'a', { href: ev.href }, strings.open));
            return line;
        });
        tip.replaceChildren(head, ...rows, h(doc, 'p', { class: 'kp-chart__tip-foot' }, strings.change), ...near);
        tip.hidden = false;
        tip.toggleAttribute('data-kp-pinned', pinned != null);
        // Beside the crosshair, on whichever side has room; docked, in the
        // corner away from it.
        const px = geo.x(t);
        const w = tip.offsetWidth || 240;
        tip.style.setProperty('--kp-chart-tip-x', `${px + 14 + w > geo.W ? Math.max(0, px - w - 14) : px + 14}px`);
        tip.setAttribute('data-kp-side', px > geo.W / 2 ? 'start' : 'end');
    }

    /** Say what is under the crosshair (keys and pins only: a pointer would talk too much). */
    function announce() {
        const t = pinned ?? cursor;
        if (t == null) return;
        const said = rowsAt(t).map(
            (r) => `${r.label} ${fmt(r.v)}, ${r.d > 0 ? strings.up : r.d < 0 ? strings.down : strings.same}${r.d ? ` ${fmt(Math.abs(r.d))}` : ''}`,
        );
        const near = eventsNear(t).map((ev) => `${ev.label} ${time(ev.at, 'clock')}`);
        readout.textContent = [`${time(t, 'full')}${pinned != null ? ` (${strings.pinned})` : ''}`, ...said, ...near].join('; ');
    }

    /** @param {PointerEvent} e */
    const timeAt = (e) => {
        if (!geo) return null;
        return geo.inv(e.clientX - geo.svg.getBoundingClientRect().left);
    };
    plot.addEventListener('pointerdown', (e) => {
        if (!geo || e.button !== 0) return;
        const mark = /** @type {Element} */ (e.target).closest?.('.kp-chart__mark');
        if (mark) {
            pinned = Number(mark.getAttribute('data-at'));
            group.cursor(pinned, state);
            announce();
            return;
        }
        const left = e.clientX - geo.svg.getBoundingClientRect().left;
        brush = { x0: left, x1: left };
        plot.setPointerCapture?.(e.pointerId);
    });
    plot.addEventListener('pointermove', (e) => {
        if (!geo) return;
        if (brush) {
            brush.x1 = Math.max(geo.P.l, Math.min(geo.W - geo.P.r, e.clientX - geo.svg.getBoundingClientRect().left));
            draw();
            return;
        }
        // Over a marker the crosshair snaps to its event.
        const mark = /** @type {Element} */ (e.target).closest?.('.kp-chart__mark');
        const t = mark ? Number(mark.getAttribute('data-at')) : timeAt(e);
        if (t == null || t < geo.from || t > geo.to) return;
        group.cursor(t, state);
    });
    plot.addEventListener('pointerup', (e) => {
        if (!brush || !geo) return;
        const b = brush;
        brush = null;
        if (Math.abs(b.x1 - b.x0) > 6) {
            pinned = null;
            group.setZoom({ from: geo.inv(Math.min(b.x0, b.x1)), to: geo.inv(Math.max(b.x0, b.x1)) });
        } else {
            const t = timeAt(e);
            if (t == null) return;
            pinned = pinned != null && Math.abs(geo.x(pinned) - geo.x(t)) < 4 ? null : t;
            draw();
            announce();
        }
    });
    plot.addEventListener('pointercancel', () => {
        brush = null;
        draw();
    });
    plot.addEventListener('pointerleave', () => {
        if (!brush) group.cursor(null, state);
    });
    plot.addEventListener('dblclick', () => group.setZoom(null));
    plot.addEventListener('keydown', (e) => {
        const si = visible().find((i) => points[i].length > 0);
        const pts = si == null ? null : points[si];
        if (!pts) return;
        let k = indexAt(pts, pinned ?? cursor ?? pts[pts.length - 1][0]);
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') k -= step;
        else if (e.key === 'ArrowRight') k += step;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = pts.length - 1;
        else if (e.key === 'Enter') {
            e.preventDefault();
            // Nothing under the crosshair yet: pin the newest point.
            const at = cursor ?? pts[k][0];
            pinned = pinned != null ? null : at;
            group.cursor(at, state);
            announce();
            return;
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            if (pinned != null) pinned = null;
            else if (sel.size) setSel(new Set());
            else if (group.zoom) group.setZoom(null);
            draw();
            return;
        } else return;
        e.preventDefault();
        // Within the window on view (a zoom keeps the crosshair inside it).
        const win = range();
        k = Math.max(0, Math.min(pts.length - 1, k));
        if (win) {
            while (k > 0 && pts[k][0] > win.to) k--;
            while (k < pts.length - 1 && pts[k][0] < win.from) k++;
        }
        const t = pts[k][0];
        if (pinned != null) pinned = t;
        group.cursor(t, state);
        announce();
    });
    plot.addEventListener('focus', () => {
        if (cursor != null || !plot.matches(':focus-visible')) return;
        const win = range();
        if (win) group.cursor(win.to, state);
        announce();
    });
    plot.addEventListener('blur', (e) => {
        // Into the pinned tooltip (its ✕, an event's link) the reading stays.
        if (pinned == null && !tip.contains(/** @type {Node | null} */ (e.relatedTarget))) group.cursor(null, state);
    });

    /** @param {ChartData} next */
    const setData = (next) => {
        const sameSources = next.series.length === data.series.length && next.series.every((sr, i) => sr.label === data.series[i].label);
        data = next;
        points = data.series.map(pointsOf);
        fmt = valueFormat(locale, data);
        if (!sameSources) {
            sel = new Set();
            hot = null;
            buildLegend();
        } else {
            legend.setAttribute('aria-label', strings.sources(label()));
            plot.setAttribute('aria-label', strings.plot(label()));
        }
        if (group.charts.size) for (const c of group.charts) c.draw();
    };
    points = data.series.map(pointsOf);
    buildLegend();

    /** @type {ChartState} */
    const state = {
        host,
        spark: false,
        draw,
        setData,
        cursorAt: (t, own) => {
            cursor = t;
            if (!own && t == null) hot = null;
            draw();
            // Another chart's crosshair moves this one's, but only the chart
            // under the pointer shows its tooltip (or a pinned one stays).
            if (!own) tip.hidden = pinned == null || tip.hidden;
        },
        lastTime: () => {
            const last = points.map((p) => p[p.length - 1]?.[0] ?? -Infinity);
            const max = Math.max(-Infinity, ...last);
            return Number.isFinite(max) ? max : null;
        },
        destroy: () => {
            group.charts.delete(state);
            for (const part of parts) part.remove();
            host.classList.remove('kp-chart');
        },
    };
    return state;
}

/**
 * The spark variant: one source's last 24 hours as a tile's sparkline
 * (drawSparkline(), the KPI tile's own drawing), on the group's crosshair,
 * with its value at the crosshair (or now) beside its name.
 * @param {HTMLElement} host
 * @param {ChartGroup} group
 * @param {string} locale
 * @returns {ChartState}
 */
function sparkChart(host, group, locale) {
    const doc = host.ownerDocument;
    const { strings, time } = group;
    /** @type {ChartData} */
    let data = DATA.get(host) ?? dataInMarkup(host) ?? { series: [] };
    /** @type {ChartPoint[]} */
    let pts = [];
    let fmt = valueFormat(locale, data);
    /** @type {number | null} */
    let cursor = null;
    const label = () => data.label ?? data.series[0]?.label ?? host.getAttribute('aria-label') ?? '';

    host.classList.add('kp-chart', 'kp-chart--spark');
    const name = h(doc, 'span', { class: 'kp-chart__spark-label' });
    const value = h(doc, 'b', { class: 'kp-chart__spark-value kp-chart__num' });
    const head = h(doc, 'p', { class: 'kp-chart__spark-head' }, name, value);
    const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (s(doc, 'svg', { class: 'kp-chart__spark' })));
    const plot = h(doc, 'div', { class: 'kp-chart__plot kp-chart__spark-plot', tabindex: '0', role: 'application' });
    plot.append(svg);
    const readout = h(doc, 'p', { class: 'kp-chart__readout kp-sr-only', 'aria-live': 'polite' });
    const parts = [head, plot, readout];
    host.append(...parts);

    function draw() {
        const series = data.series[0];
        name.textContent = label();
        plot.setAttribute('aria-label', strings.spark(label()));
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
        const first = pts[0][0];
        const last = pts[pts.length - 1][0];
        const on = cursor != null && cursor >= first && cursor <= last;
        if (on) {
            const k = indexAt(pts, /** @type {number} */ (cursor));
            const cx = (k / (pts.length - 1)) * 100;
            svg.append(s(doc, 'line', { class: 'kp-chart__crosshair', x1: cx, x2: cx, y1: 0, y2: 28, 'vector-effect': 'non-scaling-stroke' }));
            value.textContent = `${time(pts[k][0], 'clock')} · ${fmt(pts[k][1])}`;
        } else value.textContent = `${strings.now} · ${fmt(pts[pts.length - 1][1])}`;
    }

    /** @param {number} t */
    const say = (t) => {
        const k = indexAt(pts, t);
        readout.textContent = `${label()}: ${time(pts[k][0], 'full')}, ${fmt(pts[k][1])}`;
    };
    plot.addEventListener('pointermove', (e) => {
        if (pts.length < 2) return;
        const r = svg.getBoundingClientRect();
        const k = Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * (pts.length - 1));
        group.cursor(pts[Math.max(0, Math.min(pts.length - 1, k))][0], state);
    });
    plot.addEventListener('pointerleave', () => group.cursor(null, state));
    plot.addEventListener('keydown', (e) => {
        if (pts.length < 2) return;
        let k = cursor == null ? pts.length - 1 : indexAt(pts, cursor);
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') k -= step;
        else if (e.key === 'ArrowRight') k += step;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = pts.length - 1;
        else if (e.key === 'Escape') {
            if (cursor == null) return;
            e.stopPropagation();
            group.cursor(null, state);
            return;
        } else return;
        e.preventDefault();
        k = Math.max(0, Math.min(pts.length - 1, k));
        group.cursor(pts[k][0], state);
        say(pts[k][0]);
    });
    plot.addEventListener('blur', () => group.cursor(null, state));

    /** @param {ChartData} next */
    const setData = (next) => {
        data = next;
        pts = data.series[0] ? pointsOf(data.series[0]) : [];
        fmt = valueFormat(locale, data);
        draw();
    };
    pts = data.series[0] ? pointsOf(data.series[0]) : [];

    /** @type {ChartState} */
    const state = {
        host,
        spark: true,
        draw,
        setData,
        cursorAt: (t) => {
            cursor = t;
            draw();
        },
        lastTime: () => pts[pts.length - 1]?.[0] ?? null,
        destroy: () => {
            group.charts.delete(state);
            for (const part of parts) part.remove();
            host.classList.remove('kp-chart', 'kp-chart--spark');
        },
    };
    return state;
}
