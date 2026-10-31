// The sparkline: its two paths from the numbers, its drawing into an SVG, and the watch that redraws it when its numbers change.

import { ScopeWatch } from './scope.js';
import { SPARK, SPARK_BOX, SVG_NS } from './values.js';

/**
 * A sparkline's two paths in a `width` × `height` box: the line, and the
 * area under it. Fewer than two finite numbers draw nothing; a flat series
 * is drawn through the middle.
 * @param {readonly number[]} values oldest first
 * @param {{ width?: number, height?: number }} [box]
 * @returns {{ line: string, area: string }}
 */
export function sparkPaths(values, { width = SPARK_BOX.width, height = SPARK_BOX.height } = {}) {
    const points = values.filter((v) => Number.isFinite(v));
    if (points.length < 2) return { line: '', area: '' };
    const low = Math.min(...points);
    const high = Math.max(...points);
    const pad = SPARK_BOX.pad;
    const y = (/** @type {number} */ v) => (high === low ? height / 2 : pad + (1 - (v - low) / (high - low)) * (height - 2 * pad));
    const x = (/** @type {number} */ at) => (at / (points.length - 1)) * width;
    const line = points.map((v, at) => `${at === 0 ? 'M' : 'L'}${x(at).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    return { line, area: `${line} L${width},${height} L0,${height} Z` };
}

/**
 * Draw one sparkline into `svg` from `values`. `parts` names its two paths'
 * classes (`<parts>-area`, `<parts>-line`): a KPI tile's by default, the
 * time chart's spark variant passes its own (js/chart.js).
 * @param {SVGSVGElement} svg
 * @param {readonly number[]} values
 * @param {{ parts?: string }} [options]
 */
export function drawSparkline(svg, values, { parts = 'kp-kpi__spark' } = {}) {
    const { line, area } = sparkPaths(values);
    svg.setAttribute('viewBox', `0 0 ${SPARK_BOX.width} ${SPARK_BOX.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    if (!svg.hasAttribute('role')) svg.setAttribute('aria-hidden', 'true');
    const areaPath = svg.ownerDocument.createElementNS(SVG_NS, 'path');
    areaPath.setAttribute('class', `${parts}-area`);
    areaPath.setAttribute('d', area);
    const linePath = svg.ownerDocument.createElementNS(SVG_NS, 'path');
    linePath.setAttribute('class', `${parts}-line`);
    linePath.setAttribute('d', line);
    svg.replaceChildren(areaPath, linePath);
}

/** @param {string | null} text @returns {number[]} */
export const numbersIn = (text) =>
    (text ?? '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);

/** One attach call of attachSparklines(): draws every sparkline under the scope and redraws one whenever its numbers change. */
export class SparklineWatch extends ScopeWatch {
    connect() {
        for (const svg of this.scope.querySelectorAll(SPARK))
            drawSparkline(/** @type {SVGSVGElement} */ (svg), numbersIn(svg.getAttribute('data-kp-spark')));
        const view = this.view;
        if (!view) return;
        this.observe(
            new view.MutationObserver((records) => {
                for (const record of records) {
                    const svg = /** @type {Element} */ (record.target);
                    if (svg.matches(SPARK)) drawSparkline(/** @type {SVGSVGElement} */ (svg), numbersIn(svg.getAttribute('data-kp-spark')));
                }
            }),
        ).observe(this.scope instanceof Document ? this.scope.documentElement : /** @type {Node} */ (this.scope), {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-kp-spark'],
        });
    }
}
