// The full chart: one PlotChart per chart element, and how every chart's controller is started.
import { PlotChart } from './plot/controller.js';
/** @typedef {import('./group.js').ChartGroup} ChartGroup */
/** @typedef {import('./api.js').ChartContext} ChartContext */
/** @typedef {import('./api.js').ChartState} ChartState */

/**
 * The full chart: axes, sources, events, legend, tooltip, readout.
 * A chart whose wiring throws is taken away again and the error is thrown on, for attachCharts() to report.
 * @param {HTMLElement} host
 * @param {ChartGroup} group
 * @param {string} locale
 * @param {ChartContext} ctx
 * @returns {ChartState}
 */
export function plotChart(host, group, locale, ctx) {
    return startChart(new PlotChart(host, { group, locale, ctx }));
}
/**
 * Wire a chart's controller and hand back its state. A chart whose wiring throws is taken away again and the error is thrown on,
 * for attachCharts() to report.
 * @param {import('../controller.js').Controller & { state: ChartState }} chart
 * @returns {ChartState}
 */
export function startChart(chart) {
    try {
        chart.connect();
    } catch (error) {
        chart.destroy();
        throw error;
    }
    return chart.state;
}
