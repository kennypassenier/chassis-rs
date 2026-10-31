// A spark inside an update: its numbers written, and its last point gliding to the new place.

import { SPARK, drawSparkline, sparkPaths } from '../kpi.js';

/** @typedef {import('../update.js').SparkWrite} SparkWrite */

/**
 * Write a spark's numbers. A spark that `attachSparklines()` watches is
 * redrawn from its `data-kp-spark`, so the attribute takes the numbers and
 * its own redraw runs first; one nobody watches is drawn here. Returns the
 * two paths before and after, for glideSpark().
 * @param {SVGSVGElement} svg
 * @param {readonly number[]} values
 * @returns {Promise<SparkWrite>}
 */
export async function writeSpark(svg, values) {
    const oldLine = svg.querySelector('[class$="-line"]');
    const parts = /(\S+)-line\b/.exec(oldLine?.getAttribute('class') ?? '')?.[1] ?? 'kp-kpi__spark';
    const from = { line: oldLine?.getAttribute('d') ?? '', area: svg.querySelector('[class$="-area"]')?.getAttribute('d') ?? '' };
    if (svg.matches(SPARK)) {
        svg.setAttribute('data-kp-spark', values.join(' '));
        // A mutation observer's callback was queued with the change: it runs before this.
        await Promise.resolve();
    }
    const to = sparkPaths(values);
    if (svg.querySelector(`.${CSS.escape(parts)}-line`)?.getAttribute('d') !== to.line) drawSparkline(svg, values, { parts });
    return { svg, parts, from, to };
}

/**
 * The last point glides to its new place on the theme's curve: the two paths
 * morph (the same commands, so they interpolate).
 * @param {SparkWrite} spark
 * @param {{ duration: number, ease: string }} timing
 * @returns {Animation[]}
 */
export function glideSpark({ svg, parts, from, to }, timing) {
    if (!from.line || !from.area || timing.duration <= 0) return [];
    const line = svg.querySelector(`.${CSS.escape(parts)}-line`);
    const area = svg.querySelector(`.${CSS.escape(parts)}-area`);
    const options = { duration: timing.duration, easing: timing.ease };
    /** @type {Animation[]} */
    const out = [];
    try {
        if (line) out.push(line.animate({ d: [`path("${from.line}")`, `path("${to.line}")`] }, options));
        if (area) out.push(area.animate({ d: [`path("${from.area}")`, `path("${to.area}")`] }, options));
    } catch {
        // An engine that cannot animate `d` shows the new line at once.
    }
    return out;
}
