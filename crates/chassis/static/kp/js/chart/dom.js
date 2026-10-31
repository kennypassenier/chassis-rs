// SVG and markup helpers every part of the chart uses.
import { ChartGroup } from './group.js';
import { CHARTS, GROUPS, LOOSE, chartInMilliseconds } from './api.js';
import { CHART_GROUP } from './constants.js';
/** @typedef {import('./words.js').ChartData} ChartData */
/** @typedef {import('./words.js').ChartDecorate} ChartDecorate */
/** @typedef {import('./words.js').ChartDecorateInfo} ChartDecorateInfo */

/** @param {Element | Document} el @returns {ChartGroup | null} */
export function groupOf(el) {
    if (el.nodeType === 9) return LOOSE.get(/** @type {Document} */ (el)) ?? null;
    const element = /** @type {Element} */ (el);
    const state = CHARTS.get(element);
    if (state) return state.group;
    const groupEl = element.closest(CHART_GROUP);
    if (groupEl) return GROUPS.get(groupEl) ?? null;
    return LOOSE.get(element.ownerDocument) ?? null;
}
/**
 * The group a zoom chip belongs to, as a key: `data-kp-chart-zoom-for`'s
 * element, else the group element around the chip, else the document.
 * @param {Element} chip
 * @returns {Element | Document | null}
 */
export function chipKey(chip) {
    const doc = chip.ownerDocument;
    const id = chip.getAttribute('data-kp-chart-zoom-for');
    if (id) return doc.getElementById(id);
    return chip.closest(CHART_GROUP) ?? doc;
}
/** The data in a chart's JSON child, if any. @param {Element} el @returns {ChartData | null} */
export function dataInMarkup(el) {
    const script = el.querySelector(':scope > script[type="application/json"][data-kp-chart-data]');
    if (!script) return null;
    try {
        return chartInMilliseconds(JSON.parse(script.textContent ?? ''), el.getAttribute('data-kp-chart-time-unit'));
    } catch {
        return null;
    }
}
const SVGNS = 'http://www.w3.org/2000/svg';
/**
 * An element with attributes and children.
 * @param {Document} doc
 * @param {string} tag
 * @param {Record<string, string | number | null | undefined>} [attrs]
 * @param {...(Node | string)} kids
 * @returns {HTMLElement}
 */
export function h(doc, tag, attrs = {}, ...kids) {
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
export function s(doc, tag, attrs = {}) {
    const el = /** @type {SVGElement} */ (doc.createElementNS(SVGNS, tag));
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
    return el;
}
/**
 * The axis labels are centred on their ticks, which puts half of the first and of the last one outside the drawing when a tick
 * stands near an edge. Those two are anchored to their tick instead (the first starts at it, the last ends at it), so no label
 * crosses the edge and the plot keeps its width. Needs the labels laid out; a hidden chart keeps them centred.
 * @param {readonly SVGTextElement[]} labels the axis labels, left to right, already in the document
 * @param {number} width the drawing's width
 * @param {number} [inset] the least room kept between a label and the edge
 */
export function keepEndsInside(labels, width, inset = 4) {
    if (labels.length === 0) return;
    pendingEnds.push({ labels, width, inset });
    if (pendingEnds.length > 1) return;
    // One measuring pass for every chart drawn in this task: the first getBBox lays the page out once, the others read that layout,
    // and the anchors are written after all the reads (a chart's own measuring used to lay out the writes of the chart before it).
    queueMicrotask(() => {
        const batch = pendingEnds.splice(0);
        /** @type {[SVGTextElement, string][]} */
        const fixes = [];
        for (const { labels: row, width: w, inset: gap } of batch) {
            const first = row[0];
            const last = row[row.length - 1];
            if (!first.isConnected) continue;
            try {
                const a = first.getBBox();
                if (a.width > 0 && a.x < gap) fixes.push([first, 'start']);
                const b = last.getBBox();
                if (b.width > 0 && b.x + b.width > w - gap) fixes.push([last, 'end']);
            } catch {
                // not laid out (display: none): nothing to measure, the labels stay centred
            }
        }
        for (const [label, anchor] of fixes) label.setAttribute('text-anchor', anchor);
    });
}
/** The axis rows waiting for keepEndsInside()'s measuring pass. @type {{ labels: readonly SVGTextElement[], width: number, inset: number }[]} */
const pendingEnds = [];
/**
 * Hand a control to the page's `decorate`, the info without its empty
 * fields. A throwing decorate is the page's fault and must not stop the
 * chart drawing.
 * @param {ChartDecorate | undefined} decorate
 * @param {HTMLElement} part
 * @param {ChartDecorateInfo} info
 */
export function decorateWith(decorate, part, info) {
    if (!decorate) return;
    /** @type {Record<string, unknown>} */
    const clean = {};
    for (const [k, v] of Object.entries(info)) if (v != null) clean[k] = v;
    try {
        decorate(part, /** @type {ChartDecorateInfo} */ (clean));
    } catch (error) {
        globalThis.reportError?.(error);
    }
}
