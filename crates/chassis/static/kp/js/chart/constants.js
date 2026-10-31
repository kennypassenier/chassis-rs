// The attribute, event names and defaults of the chart.

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
/** Fired on a chart, bubbling, when the Retry of a failed chart (`{ error }` in its data) is pressed: the page reads again and draws again. */
export const CHART_RETRY_EVENT = 'kp-chart-retry';
/** The zone a chart prints its times in and aligns its time axis to, unless attachCharts() is given another (rule 52). */
export const CHART_TIME_ZONE = 'Europe/Brussels';
/** A key figure's 24-hour trend: the spark variant without its head line. */
export const TREND_CHART = '[data-kp-chart="spark"][data-kp-spark-head="none"]';
