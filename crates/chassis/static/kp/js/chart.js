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
//   notes    annotations [kpadopt5-people; homelab's `mk-annkey`, Life's run
//            charts]: an event with `until` is a band (a maintenance window),
//            an event's `kind` maps to a tone through `kinds`, a key above the
//            plot names the kinds present and each item switches its kind on
//            and off (`data-kp-chart-annotation-key`, on while events exist,
//            `off` hides it), events outside the window show as an arrow with
//            their count at the edge; `data-kp-chart-median` draws each shown
//            source's median line with its value (`data-kp-chart-median-label`
//            words it), `data-kp-chart-runs="mark"` marks the points of every
//            run of six or more on one side of it, and `data-kp-chart-min-points
//            ="7"` shows "3 of 7 readings needed before a trend means
//            something" (`data-kp-chart-min-unit` names them) over the faint,
//            empty plot (no line and no dot), until there are enough; with
//            `onePointNote` a single reading is the one-reading state below
//            instead (its dot and its words), the sentence starts at two
//   spark    `data-kp-chart="spark"`: the 24 h line of a tile, drawn by
//            drawSparkline() (js/kpi.js), on the group's crosshair
//   trend    the spark variant in a key figure (`.kp-kpi--trend`):
//            `data-kp-spark-head="none"` leaves out the name and value
//            line and reads a point in a chip over the line instead, on
//            the trend's own crosshair; `data-kp-spark-axis="relative"`
//            puts the axis under it (`14:40 yesterday` … `now`, see
//            trendAxis()); a click that was not a drag follows the
//            tile's `.kp-kpi__link`
//
// Under the lines a soft area while one or two sources are on; with three or
// more, the lines alone. Colours are the theme's `--chart-1..5` in order; from
// the sixth source on they come round again with a dashed line, so no two
// sources look alike.
//
// Every date and time a chart prints is dd/mm/yyyy HH:mm on a 24-hour clock
// in Europe/Brussels (rule 52), whatever the reader's zone and language:
// `attachCharts(root, { timeZone })` picks another zone, `{ time }` prints
// times its own way. The time axis lands on round wall-clock times in that
// zone, so a six-hour tick reads 00:00, 06:00, 12:00, 18:00 across a summer
// time change too.
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
// returns a detach, and detachChart(el) takes one chart away.
//
// A group is its element's across attachCharts() calls: a chart attached
// later joins the crosshair, the zoom and the range already there (charts
// outside any group element share one group per document). A zoom chip may
// sit anywhere on the page: `data-kp-chart-zoom-for="<group id>"`, else the
// group around it, else the document's. chartSelect() and chartZoom() drive
// a chart from the page (a table that presses a source, a page that resets
// its zoom); `decorate` marks every control a chart builds, each time it
// builds it.
//
// Every state has its look at the chart's final height: `data-kp-chart-
// loading` (the plot pulses, the legend row is kept for
// `data-kp-chart-sources="N"`), no readings (the `chartEmpty` words), an
// error (`{ error }` in the data), one reading (a dot, and with
// `onePointNote` the `chartOnePoint` words, which then win over
// `minPoints`).
//
// `unitKind` prints values the dashboard's way: `bytes` and `bytes/s` in
// binary steps (`1.5 GiB`, `3.2 MiB/s`), `percent` (`7.5%`, an axis of 10,
// 25, 50 or 100, above 100 when a value is), `celsius`, `count` and `flag`
// (exact, `12,345`, except on the axis, `12.3k`). For a unit kind the axis
// ticks carry the unit.

export {
    CHART,
    CHART_GROUP,
    CHART_SELECT_EVENT,
    CHART_ZOOM_EVENT,
    CHART_RANGE_EVENT,
    CHART_RETRY_EVENT,
    CHART_TIME_ZONE,
    TREND_CHART,
} from './chart/constants.js';
export { chartWords } from './chart/words.js';
export { dashOf, parseSpan, chartMedian, chartRuns } from './chart/stats.js';
export { niceMax, formatChartValue } from './chart/format.js';
export { indexAt, hourChange, toggleSource, nextSelection, pointsOf } from './chart/selection.js';
export { wallTime, zonedTime, numericTime, trendAxis, tickStride, timeTicks } from './chart/time.js';
export { CHART_TIME_UNITS, chartInMilliseconds, setChartData, setTrendData, chartSelect, chartZoom, detachChart } from './chart/api.js';
export { attachCharts, attachTrendCharts } from './chart/attach.js';

/** @typedef {import('./chart/words.js').ChartPoint} ChartPoint */
/** @typedef {import('./chart/words.js').ChartSeries} ChartSeries */
/** @typedef {import('./chart/words.js').ChartEvent} ChartEvent */
/** @typedef {import('./chart/words.js').ChartUnitKind} ChartUnitKind */
/** @typedef {import('./chart/words.js').ChartValueWhere} ChartValueWhere */
/** @typedef {import('./chart/words.js').ChartValueFormat} ChartValueFormat */
/** @typedef {import('./chart/words.js').ChartPartKind} ChartPartKind */
/** @typedef {import('./chart/words.js').ChartDecorateInfo} ChartDecorateInfo */
/** @typedef {import('./chart/words.js').ChartDecorate} ChartDecorate */
/** @typedef {import('./chart/words.js').ChartData} ChartData */
/** @typedef {import('./chart/words.js').ChartWindow} ChartWindow */
/** @typedef {import('./chart/words.js').ChartTimeStyle} ChartTimeStyle */
/** @typedef {import('./chart/words.js').ChartTimeContext} ChartTimeContext */
/** @typedef {import('./chart/words.js').ChartTimeFormat} ChartTimeFormat */
/** @typedef {import('./chart/words.js').ChartOptions} ChartOptions */
/** @typedef {import('./chart/words.js').ChartStrings} ChartStrings */
/** @typedef {import('./chart/words.js').Strings} Strings */
/** @typedef {import('./chart/api.js').ChartState} ChartState */
/** @typedef {import('./chart/api.js').ChartContext} ChartContext */
/** @typedef {import('./chart/api.js').ChartTimeUnit} ChartTimeUnit */
/** @typedef {import('./chart/api.js').TrendData} TrendData */
