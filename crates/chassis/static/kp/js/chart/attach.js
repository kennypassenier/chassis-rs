// Attaches the charts and trend charts of a page.
import { resolveLocale } from '../locale.js';
import { ChartGroup } from './group.js';
import { CHART, CHART_GROUP, CHART_TIME_ZONE, TREND_CHART } from './constants.js';
import { chartWords } from './words.js';
import { numericTime } from './time.js';
import { CHARTS, GROUPS, LOOSE, detachChart } from './api.js';
import { sparkChart } from './spark.js';
import { plotChart } from './plot.js';
import { dashOf } from './stats.js';
import { formatChartValue } from './format.js';
/** @typedef {import('./api.js').ChartContext} ChartContext */
/** @typedef {import('./words.js').ChartData} ChartData */
/** @typedef {import('./words.js').ChartOptions} ChartOptions */
/** @typedef {import('./words.js').ChartSeries} ChartSeries */
/** @typedef {import('./api.js').ChartState} ChartState */
/** @typedef {import('./words.js').ChartValueWhere} ChartValueWhere */

/** How many charts one call must attach before they are drawn only near the screen (ChartOptions.lazy), and how near. */
const LAZY_FROM = 12;
const LAZY_MARGIN = '200px 0px';

/**
 * Draw every `[data-kp-chart]` under `root` and wire it: the charts of one
 * `[data-kp-chart-group]` (or, outside any group, all the others on the
 * page) share their crosshair, zoom and range, also with charts an earlier
 * or a later call attached. A chart's data comes from its JSON child or from
 * setChartData(), before or after this runs.
 * Every time is printed as dd/mm/yyyy HH:mm (or a part of it) on a 24-hour
 * clock in `timeZone`, Europe/Brussels by default, whatever the page's
 * language (rule 52); `time` prints them another way.
 * @param {ParentNode} [root]
 * @param {ChartOptions} [options] `strings`: any of the dictionary's `chart…` words for these charts only;
 *   `locale`: the numbers, else the nearest `lang` above each group; `timeZone`: the zone of every printed time
 *   and of the time axis; `time`: prints every time itself (`(ms, style, ctx) => string`); `format`: prints
 *   values itself (`(v, where, chart) => string`); `decorate`: marks every control a chart builds
 * @returns {() => void} detach: these charts taken away (detachChart() each)
 */
export function attachCharts(root = document, options = {}) {
    return attachMatching(root, options, CHART);
}
/**
 * Draw only the key figures' trends under `root` (`TREND_CHART`), with the
 * options attachCharts() takes; for a page that wires its trends apart from
 * its other charts. attachCharts() draws them too.
 * @param {ParentNode} [root]
 * @param {ChartOptions} [options]
 * @returns {() => void} detach
 */
export function attachTrendCharts(root = document, options = {}) {
    return attachMatching(root, options, TREND_CHART);
}
/**
 * attachCharts() over the elements `selector` finds.
 * @param {ParentNode} root
 * @param {ChartOptions} options
 * @param {string} selector
 * @returns {() => void}
 */
function attachMatching(root, options, selector) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    if (!view) return () => {};
    const ctx = chartContext(options);
    /** @type {Set<ChartGroup>} */
    const touched = new Set();
    /** @type {ChartState[]} */
    const states = [];
    /** The plots this call attached; `lazy` counts them. */
    const hosts = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)]).filter((host) => !CHARTS.has(host));
    const { seen, resize } = watchesFor(view, hosts.length, options.lazy ?? LAZY_FROM);
    for (const host of hosts) {
        if (CHARTS.has(host)) continue;
        const groupEl = /** @type {HTMLElement | null} */ (host.closest(CHART_GROUP));
        const group = (groupEl ? GROUPS.get(groupEl) : LOOSE.get(doc)) ?? new ChartGroup(groupEl, doc, ctx);
        const locale = resolveLocale(options.locale, groupEl ?? host);
        const state = drawOne(host, group, locale, ctx);
        if (!state) continue;
        const hold = seen != null && state.view != null && host.getAttribute('data-kp-chart-lazy') !== 'off';
        if (hold) state.view?.(false);
        state.unobserve = () => {
            resize.unobserve(host);
            if (hold) seen?.unobserve(host);
        };
        CHARTS.set(host, state);
        group.charts.add(state);
        touched.add(group);
        states.push(state);
        resize.observe(host);
        if (hold) seen?.observe(host);
    }
    // The window of a range depends on every chart's newest point: draw once
    // all of a group are in, the charts already there included.
    for (const group of touched) {
        group.bindChips();
        for (const c of group.charts) c.draw();
    }

    return () => {
        for (const state of states) if (CHARTS.get(state.host) === state) detachChart(state.host);
        resize.disconnect();
        seen?.disconnect();
    };
}
/**
 * What one attachCharts() call gives its charts. Times are numeric in one zone (rule 52), not the page's language; a chart's numbers
 * are the locale given, else the nearest `lang` above its group (or above the chart, outside a group).
 * @param {ChartOptions} options
 * @returns {ChartContext}
 */
function chartContext(options) {
    const timeZone = options.timeZone ?? CHART_TIME_ZONE;
    return {
        strings: chartWords(options.strings),
        time: options.time ?? numericTime(timeZone),
        timeZone,
        format: options.format,
        decorate: options.decorate,
        now: options.now ?? (() => Date.now()),
    };
}
/**
 * The watches of one call's charts: their size, and (from `lazy` charts on) whether they are near the screen, a little before the
 * edge, so a chart is drawn as it comes near.
 * @param {Window & typeof globalThis} view
 * @param {number} count
 * @param {boolean | number} lazy
 */
function watchesFor(view, count, lazy) {
    const watching = lazy !== false && typeof view.IntersectionObserver === 'function' && count >= (lazy === true ? 1 : lazy);
    const seen = watching
        ? new view.IntersectionObserver(
              (entries) => {
                  for (const entry of entries) CHARTS.get(/** @type {HTMLElement} */ (entry.target))?.view?.(entry.isIntersecting);
              },
              { rootMargin: LAZY_MARGIN },
          )
        : null;
    const resize = new view.ResizeObserver((entries) => {
        for (const entry of entries) {
            const state = CHARTS.get(entry.target);
            if (state?.resize) state.resize();
            else state?.draw();
        }
    });
    return { seen, resize };
}
/**
 * One chart: a spark or a full plot. A chart whose wiring throws is reported (`reportError`, so it reaches the page's error handlers
 * and the console) and left out; the other charts still draw.
 * @param {HTMLElement} host
 * @param {ChartGroup} group
 * @param {string} locale
 * @param {ChartContext} ctx
 * @returns {ChartState | null}
 */
function drawOne(host, group, locale, ctx) {
    try {
        return host.dataset.kpChart === 'spark' ? sparkChart(host, group, locale, ctx) : plotChart(host, group, locale, ctx);
    } catch (error) {
        if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
        else console.error(error);
        return null;
    }
}
/**
 * The colour hooks of source `i` on an element: `data-kp-series` (1-5, its
 * `--chart-n`), `data-kp-dash` from the sixth on, or the series' own colour.
 * @param {Element} el
 * @param {ChartSeries} series
 * @param {number} i
 */
export function paintSeries(el, series, i) {
    el.setAttribute('data-kp-series', String((i % 5) + 1));
    const dash = dashOf(i);
    if (dash) el.setAttribute('data-kp-dash', String(dash));
    if (series.colour) /** @type {HTMLElement | SVGElement} */ (el).style.setProperty('--kp-chart-series', series.colour);
}
/**
 * A chart's value printer: the page's `format` first, else formatChartValue().
 * @param {string} locale
 * @param {ChartContext} ctx
 * @param {() => ChartData} current the chart's data now
 * @returns {(v: number, where: ChartValueWhere) => string}
 */
export function valueFormat(locale, ctx, current) {
    return (v, where) => {
        const data = current();
        const own = ctx.format?.(v, where, data);
        return typeof own === 'string' ? own : formatChartValue(v, where, data, locale);
    };
}
/**
 * A plot's height: its data's, else `--kp-chart-height` on the chart (px or
 * rem), else 168.
 * @param {HTMLElement} host
 * @param {ChartData} data
 */
export function chartHeight(host, data) {
    if (data.height != null) return data.height;
    const view = host.ownerDocument.defaultView;
    const raw = view?.getComputedStyle(host).getPropertyValue('--kp-chart-height').trim() ?? '';
    const m = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(raw);
    if (!view || !m) return 168;
    const n = Number(m[1]);
    return m[2] === 'rem' ? n * (parseFloat(view.getComputedStyle(host.ownerDocument.documentElement).fontSize) || 16) : n;
}
