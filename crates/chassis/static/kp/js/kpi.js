// Key figures: the KPI tile's sparkline and its filter toggle, the meter
// with a mark, and the strip's column count [scope-143].
//
// `.kp-kpis` is a strip of `.kp-kpi` tiles (css/components.css); this module
// adds what a tile and a strip can do:
//
//   attachSparklines(root)   every `svg[data-kp-spark="12 14 13 …"]` drawn
//                            from its numbers, and drawn again when they
//                            change: a line over a soft area
//   attachKpiToggles(root)   a `button.kp-kpi--toggle` flips `aria-pressed`
//                            and fires `kp-kpi-toggle`; the page filters
//   setMeter(el, meter)      a `.kp-meter` (or `.kp-kpi__meter`): its share,
//                            its mark, its tone and its ARIA in one call
//   attachKpiStrips(root)    every `.kp-kpis[data-kp-kpis-columns="all 3 2 1"]`
//                            on an allowed column count by its own width,
//                            with no tile left alone on the last row
//
// drawSparkline() is also what the time chart's spark variant draws with
// (js/chart.js), so a tile and a chart's 24-hour line look alike; the
// spark variant is also a key figure's 24-hour trend
// (`.kp-kpi--trend`, `data-kp-spark-head="none"`). Nothing runs on import;
// each attach function returns a detach.
//
// The sparklines, the toggles and the strips of a scope are each one watch controller (js/kpi/spark.js, toggle.js, strips.js, on js/controller.js, built
// by js/kpi/scope.js); the pure column, path and meter helpers are columns.js, spark.js and meter.js, and the parts are listed in js/README.md.

import { attachScope } from './kpi/scope.js';
import { SparklineWatch } from './kpi/spark.js';
import { KpiToggles } from './kpi/toggle.js';
import { KpiStrips } from './kpi/strips.js';

export { SPARK, KPI_TOGGLE, KPI_TOGGLE_EVENT, METER, KPI_STRIP } from './kpi/values.js';
export { sparkPaths, drawSparkline } from './kpi/spark.js';
export { meterParts, meterText, setMeter } from './kpi/meter.js';
export { kpiColumns, fitKpiStrip } from './kpi/columns.js';

/**
 * @typedef {object} Meter
 * @property {number | null} [value] the share, 0 up (1 is full; above 1 the bar is full and says so); null is not measured
 * @property {number | null} [mark] a tick at this share (a target, a limit, what is booked), 0 up; null is none
 * @property {'success' | 'neutral' | 'warning' | 'destructive' | null} [tone] the fill's colour (`success` good, `neutral` quiet); a tone on the tile around it does the same
 * @property {string} [label] what the share is, in the words a screen reader hears ("full"); `meterUsed` unless given
 * @property {string} [markLabel] what the mark is ("the target level")
 * @property {boolean} [loading] the track pulses at its height, with no fill and no mark
 */

/**
 * Draw every `svg[data-kp-spark="12 14 13 …"]` under `root`, and redraw one
 * whenever its numbers change.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachSparklines(root = document) {
    return attachScope(SparklineWatch, root);
}

/**
 * Wire every KPI toggle under `root`: a click flips `aria-pressed` and fires
 * `kp-kpi-toggle`; the page does the filtering. A tile marked
 * `data-kp-kpi-owned` is left to the page (a framework that keeps the
 * pressed state itself).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachKpiToggles(root = document) {
    return attachScope(KpiToggles, root);
}

/**
 * Keep every `.kp-kpis[data-kp-kpis-columns="all 3 2 1"]` under `root` on an
 * allowed column count, by the strip's own width (not the window's), with no
 * tile alone on a row; and again when tiles come, go or hide, and for a
 * strip added later. Before this runs a strip keeps the package's auto-fit.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachKpiStrips(root = document) {
    return attachScope(KpiStrips, root);
}
