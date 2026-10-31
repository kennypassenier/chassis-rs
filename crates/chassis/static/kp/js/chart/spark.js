// The spark chart: a plot without axes (one SparkChart per element), and the axis row a trend shares with it.
import { trendChart } from './trend.js';
import { h } from './dom.js';
import { BLANK, trendAxis } from './time.js';
import { startChart } from './plot.js';
import { SparkChart } from './spark-control.js';
/** @typedef {import('./group.js').ChartGroup} ChartGroup */
/** @typedef {import('./api.js').ChartContext} ChartContext */
/** @typedef {import('./words.js').ChartPoint} ChartPoint */
/** @typedef {import('./words.js').ChartSeries} ChartSeries */
/** @typedef {import('./api.js').ChartState} ChartState */

/**
 * The spark variant: one source's last 24 hours as a tile's sparkline
 * (drawSparkline(), the KPI tile's own drawing), on the group's crosshair,
 * with its value at the crosshair (or now) beside its name.
 * @param {HTMLElement} host
 * @param {ChartGroup} group
 * @param {string} locale
 * @param {ChartContext} ctx
 * @returns {ChartState}
 */
export function sparkChart(host, group, locale, ctx) {
    if (host.dataset.kpSparkHead === 'none') return trendChart(host, group, locale, ctx);
    return startChart(new SparkChart(host, { group, locale, ctx }));
}
/**
 * The axis row under a trend, when the spark asks for one
 * (`data-kp-spark-axis="relative"`): where the line starts and where it ends.
 * @param {HTMLElement} host
 * @returns {{ row: HTMLElement, from: HTMLElement, to: HTMLElement, read: HTMLElement } | null}
 */
export function trendAxisRow(host) {
    if (host.dataset.kpSparkAxis !== 'relative') return null;
    const doc = host.ownerDocument;
    const from = h(doc, 'span', { class: 'kp-kpi__chart-from' }, BLANK);
    const to = h(doc, 'span', { class: 'kp-kpi__chart-to' }, BLANK);
    // The reading, here only when even a stacked chip is too wide for the trend.
    const read = h(doc, 'span', { class: 'kp-kpi__chart-read' });
    read.hidden = true;
    const row = h(doc, 'span', { class: 'kp-kpi__chart-axis', 'aria-hidden': 'true' }, from, to, read);
    return { row, from, to, read };
}
/**
 * trendAxis() for a spark's points, in its chart context.
 * @param {readonly ChartPoint[]} pts
 * @param {ChartSeries | undefined} series
 * @param {ChartContext} ctx
 */
export function trendWords(pts, series, ctx) {
    const step = series?.step ?? (pts.length > 1 ? pts[pts.length - 1][0] - pts[pts.length - 2][0] : undefined);
    const { now, today, yesterday } = ctx.strings;
    return trendAxis(pts, { now: ctx.now(), step, timeZone: ctx.timeZone, time: ctx.time, words: { now, today, yesterday } });
}
