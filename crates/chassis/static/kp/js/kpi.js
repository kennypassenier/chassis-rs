// Key figures: the KPI tile's sparkline and its filter toggle [scope-143].
//
// `.kp-kpis` is a strip of `.kp-kpi` tiles (css/components.css); this module
// adds the two behaviours a tile can have:
//
//   attachSparklines(root)   every `svg[data-kp-spark="12 14 13 …"]` drawn
//                            from its numbers, and drawn again when they
//                            change: a line over a soft area
//   attachKpiToggles(root)   a `button.kp-kpi--toggle` flips `aria-pressed`
//                            and fires `kp-kpi-toggle`; the page filters
//
// drawSparkline() is also what the time chart's spark variant draws with
// (js/chart.js), so a tile and a chart's 24-hour line look alike. Nothing
// runs on import; each attach function returns a detach.

/** An inline SVG drawn from the numbers in its attribute. */
export const SPARK = 'svg[data-kp-spark]';

/**
 * A sparkline's two paths in a `width` × `height` box: the line, and the
 * area under it. Fewer than two finite numbers draw nothing; a flat series
 * is drawn through the middle.
 * @param {readonly number[]} values oldest first
 * @param {{ width?: number, height?: number }} [box]
 * @returns {{ line: string, area: string }}
 */
export function sparkPaths(values, { width = 100, height = 28 } = {}) {
    const points = values.filter((v) => Number.isFinite(v));
    if (points.length < 2) return { line: '', area: '' };
    const low = Math.min(...points);
    const high = Math.max(...points);
    const pad = 1.5;
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
    const ns = 'http://www.w3.org/2000/svg';
    const { line, area } = sparkPaths(values);
    svg.setAttribute('viewBox', '0 0 100 28');
    svg.setAttribute('preserveAspectRatio', 'none');
    if (!svg.hasAttribute('role')) svg.setAttribute('aria-hidden', 'true');
    const areaPath = svg.ownerDocument.createElementNS(ns, 'path');
    areaPath.setAttribute('class', `${parts}-area`);
    areaPath.setAttribute('d', area);
    const linePath = svg.ownerDocument.createElementNS(ns, 'path');
    linePath.setAttribute('class', `${parts}-line`);
    linePath.setAttribute('d', line);
    svg.replaceChildren(areaPath, linePath);
}

/** @param {string | null} text @returns {number[]} */
const numbersIn = (text) =>
    (text ?? '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);

/**
 * Draw every `svg[data-kp-spark="12 14 13 …"]` under `root`, and redraw one
 * whenever its numbers change.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachSparklines(root = document) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    for (const svg of root.querySelectorAll(SPARK)) drawSparkline(/** @type {SVGSVGElement} */ (svg), numbersIn(svg.getAttribute('data-kp-spark')));
    if (!view) return () => {};
    const watch = new view.MutationObserver((records) => {
        for (const record of records) {
            const svg = /** @type {Element} */ (record.target);
            if (svg.matches(SPARK)) drawSparkline(/** @type {SVGSVGElement} */ (svg), numbersIn(svg.getAttribute('data-kp-spark')));
        }
    });
    watch.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-kp-spark'],
    });
    return () => watch.disconnect();
}

/* ---------------------------------------------------------- KPI toggles */

/** A KPI tile that turns a filter on this page on or off. */
export const KPI_TOGGLE = 'button.kp-kpi--toggle';

/** Fired on the tile, bubbling, after it was pressed: `detail.pressed`. */
export const KPI_TOGGLE_EVENT = 'kp-kpi-toggle';

/** The clicks a toggle has already answered. @type {WeakSet<Event>} */
const FLIPPED = new WeakSet();

/**
 * Wire every KPI toggle under `root`: a click flips `aria-pressed` and fires
 * `kp-kpi-toggle`; the page does the filtering. A tile marked
 * `data-kp-kpi-owned` is left to the page (a framework that keeps the
 * pressed state itself).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachKpiToggles(root = document) {
    /** @param {Event} event */
    const onClick = (event) => {
        const tile = /** @type {Element | null} */ (event.target instanceof Element ? event.target.closest(KPI_TOGGLE) : null);
        if (!tile || tile.hasAttribute('data-kp-kpi-owned')) return;
        // A tile under two attached roots (the document, and a part of it
        // attached again later) flips once per click.
        if (FLIPPED.has(event)) return;
        FLIPPED.add(event);
        const pressed = tile.getAttribute('aria-pressed') !== 'true';
        tile.setAttribute('aria-pressed', String(pressed));
        tile.dispatchEvent(new CustomEvent(KPI_TOGGLE_EVENT, { bubbles: true, detail: { pressed } }));
    };
    for (const tile of root.querySelectorAll(KPI_TOGGLE)) if (!tile.hasAttribute('aria-pressed')) tile.setAttribute('aria-pressed', 'false');
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
}
