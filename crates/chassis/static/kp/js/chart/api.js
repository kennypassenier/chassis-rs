// The functions a page calls to fill, select, zoom and detach a chart.
import { ChartGroup } from './group.js';
import { groupOf } from './dom.js';
/** @typedef {import('./words.js').ChartData} ChartData */
/** @typedef {import('./words.js').ChartDecorate} ChartDecorate */
/** @typedef {import('./words.js').ChartPoint} ChartPoint */
/** @typedef {import('./words.js').ChartStrings} ChartStrings */
/** @typedef {import('./words.js').ChartTimeFormat} ChartTimeFormat */
/** @typedef {import('./words.js').ChartUnitKind} ChartUnitKind */
/** @typedef {import('./words.js').ChartValueFormat} ChartValueFormat */
/** @typedef {import('./words.js').ChartWindow} ChartWindow */

/** The data a page gave a chart before or after it was attached. @type {WeakMap<Element, ChartData>} */
export const DATA = new WeakMap();
/** The chart drawn in an element. @type {WeakMap<Element, ChartState>} */
export const CHARTS = new WeakMap();
/** Every group by its element, whichever attachCharts() call made it. @type {WeakMap<Element, ChartGroup>} */
export const GROUPS = new WeakMap();
/** The group of the charts outside any group element, one per document. @type {WeakMap<Document, ChartGroup>} */
export const LOOSE = new WeakMap();
/** The group a zoom chip was given to. @type {WeakMap<Element, ChartGroup>} */
export const CHIPS = new WeakMap();
/** A document's live groups and its one Esc listener. @type {WeakMap<Document, { groups: Set<ChartGroup>, onEsc: (e: KeyboardEvent) => void }>} */
export const PAGES = new WeakMap();
/**
 * @typedef {object} ChartState
 * @property {HTMLElement} host
 * @property {boolean} spark
 * @property {ChartGroup} group
 * @property {() => void} draw
 * @property {(inView: boolean) => void} [view] set by attachCharts() under `lazy`: whether the plot is (nearly) on screen; it draws
 *   what it held back as it comes into view
 * @property {() => void} [resize] draws again when the box the plot was drawn in changed (the resize watch's call; a draw that would be the same is skipped)
 * @property {() => boolean} [stale] whether the last drawing of a plot no longer fits the group's window (a neighbour's new data moved it)
 * @property {(t: number | null, own: boolean) => void} cursorAt
 * @property {(data: ChartData) => void} setData
 * @property {(i: number | null, on?: boolean) => boolean} select
 * @property {() => number | null} lastTime
 * @property {() => void} destroy
 * @property {() => void} unobserve set by attachCharts(): its resize watch off
 *
 * @typedef {object} ChartContext what one attachCharts() call gives its charts
 * @property {ChartStrings} strings
 * @property {ChartTimeFormat} time
 * @property {string} timeZone
 * @property {ChartValueFormat | undefined} format
 * @property {ChartDecorate | undefined} decorate
 * @property {() => number} now
 */

/** @typedef {'ms' | 's' | 'min' | 'h' | 'd' | 'w'} ChartTimeUnit */
/** Milliseconds in one of each time unit a chart's data can be given in. @type {Record<ChartTimeUnit, number>} */
export const CHART_TIME_UNITS = { ms: 1, s: 1000, min: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
/**
 * The data with every time in milliseconds: a copy, the page's own object is left alone. Data already in `ms` (or in no known unit) comes back as it is.
 * @param {ChartData} data
 * @param {string | null} [attribute] the element's `data-kp-chart-time-unit`
 * @returns {ChartData}
 */
export function chartInMilliseconds(data, attribute) {
    const named = data.timeUnit ?? attribute;
    const factor = named && Object.hasOwn(CHART_TIME_UNITS, named) ? CHART_TIME_UNITS[/** @type {ChartTimeUnit} */ (named)] : 1;
    if (factor === 1) return data;
    const ms = (/** @type {number | undefined} */ t) => (typeof t === 'number' ? Math.round(t * factor) : t);
    /** @type {ChartData} */
    const out = { ...data, timeUnit: 'ms' };
    if (data.from !== undefined) out.from = ms(data.from);
    if (data.to !== undefined) out.to = ms(data.to);
    out.series = (data.series ?? []).map((series) => ({
        ...series,
        ...(series.points ? { points: series.points.map((p) => /** @type {ChartPoint} */ ([ms(p[0]), p[1]])) } : {}),
        ...(series.start !== undefined ? { start: ms(series.start) } : {}),
        ...(series.step !== undefined ? { step: ms(series.step) } : {}),
    }));
    if (data.events)
        out.events = data.events.map((ev) => ({
            ...ev,
            at: /** @type {number} */ (ms(ev.at)),
            ...(ev.until !== undefined ? { until: ms(ev.until) } : {}),
        }));
    return out;
}
/**
 * Give a chart its sources and events (the page's own data). Before the chart
 * is attached the data waits for it; a `<script type="application/json"
 * data-kp-chart-data>` child is the markup way to do the same. Data ends a
 * `data-kp-chart-loading` the element carries. Called again (a live
 * update), the chart keeps its crosshair, pin, zoom, selection and focus;
 * only new sources reset the selection (with a `kp-chart-select` of `[]`).
 * @param {Element} el the `[data-kp-chart]` element
 * @param {ChartData} data
 */
export function setChartData(el, data) {
    data = chartInMilliseconds(data, el.getAttribute('data-kp-chart-time-unit'));
    DATA.set(el, data);
    el.removeAttribute('data-kp-chart-loading');
    CHARTS.get(el)?.setData(data);
}
/**
 * @typedef {object} TrendData a key figure's trend, the short way
 * @property {ChartPoint[]} [points] `[[ms, value]…]`, oldest first
 * @property {string} [error] why the trend could not be read: the tile's trend is the failed plate (its heading) with a Retry
 *   that fires `kp-chart-retry` on the figure, bubbling [kyu-plates-1019]
 * @property {string} [text] one sentence under `error` (else the package's own), or under the empty plate
 * @property {Node | string | null} [art] a picture over the heading of the empty and failed plates
 * @property {number} [step] the points' spacing, ms (the axis says `now` while the last is at most two steps old)
 * @property {ChartTimeUnit} [timeUnit] the unit of the points' times and `step`: `ms` (default), `s`, `min`, `h`, `d` or `w` [wish-1120]
 * @property {string} [unit]
 * @property {ChartUnitKind} [unitKind]
 * @property {number} [digits]
 */

/**
 * Give a key figure's trend its points: setChartData() with one source, the
 * short way. `null` is loading: the trend stays empty at its final height
 * and the tile around it is `aria-busy` until data comes. An empty
 * `points` is the empty plate over the trend's place; `{ error }` is the failed plate with a Retry (`kp-chart-retry`); loading is the
 * theme's busy card over the trend [kyu-plates-1019].
 * @param {Element} figure the `[data-kp-chart="spark"]` element
 * @param {TrendData | null} data
 */
export function setTrendData(figure, data) {
    if (data == null) {
        figure.setAttribute('data-kp-chart-loading', '');
        CHARTS.get(figure)?.draw();
        return;
    }
    const { points = [], step, unit, unitKind, digits, error, text, art, timeUnit } = data;
    setChartData(figure, {
        ...(timeUnit ? { timeUnit } : {}),
        unit,
        unitKind,
        digits,
        ...(error ? { error } : {}),
        ...(text ? { errorText: text } : {}),
        ...(art ? { art } : {}),
        series: [{ label: figure.getAttribute('aria-label') ?? '', points, step }],
    });
}
/**
 * Press legend source `index` of a chart, the way a click does: on or off
 * (a toggle without `on`, else on when `on` is true and off when false), or
 * with `null` every source shown again. Fires `kp-chart-select` when the
 * selection changes. For a page that drives the chart from elsewhere (a
 * table whose row presses its source).
 * @param {Element} el the `[data-kp-chart]` element
 * @param {number | null} index
 * @param {boolean} [on]
 * @returns {boolean} whether the selection changed
 */
export function chartSelect(el, index, on) {
    return CHARTS.get(el)?.select(index, on) ?? false;
}
/**
 * Zoom a group to `zoom` (ms), or with `null` show its whole range again,
 * the way a drag and Reset do; fires `kp-chart-zoom`. `el` is a chart, a
 * group element (or anything inside one), or the document (its charts
 * outside any group).
 * @param {Element | Document} el
 * @param {ChartWindow | null} zoom
 * @returns {boolean} whether a group was found
 */
export function chartZoom(el, zoom) {
    const group = groupOf(el);
    if (!group) return false;
    group.setZoom(zoom && zoom.to > zoom.from ? { from: zoom.from, to: zoom.to } : null);
    return true;
}
/**
 * Take one chart away: its drawn parts, its place in its group and its
 * resize watch. The rest of its group draws on; a group left with no chart
 * lets go of its range buttons and zoom chips. The page's data stays, so
 * attaching again draws it.
 * @param {Element} el the `[data-kp-chart]` element
 * @returns {boolean} whether a chart was attached there
 */
export function detachChart(el) {
    const state = CHARTS.get(el);
    if (!state) return false;
    CHARTS.delete(el);
    state.unobserve();
    state.destroy();
    const { group } = state;
    group.charts.delete(state);
    if (group.charts.size === 0) group.stop();
    // The newest point of the group may have gone with it.
    else for (const c of group.charts) c.draw();
    return true;
}
