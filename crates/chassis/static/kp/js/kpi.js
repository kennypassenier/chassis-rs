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

import { getStrings } from './strings.js';

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

/* ---------------------------------------------------------------- meter */

/** A used-of-total bar: anywhere, or at the bottom of a key figure. */
export const METER = '.kp-meter, .kp-kpi__meter';

/**
 * What a meter draws for a share and a mark: the fill (0 to 1), whether the
 * share runs past the end, the mark's place (0 to 1, null without one) and
 * whether it lies past the end, and the `aria-valuenow` (0 to 100). A share
 * or a mark below 0 counts as 0; one that is not a number is not measured.
 * @param {number | null | undefined} value 0..∞ (1 is full)
 * @param {number | null | undefined} [mark] 0..∞
 * @returns {{ measured: boolean, fill: number, over: boolean, mark: number | null, markOver: boolean, now: number | null }}
 */
export function meterParts(value, mark = null) {
    const measured = value != null && Number.isFinite(value);
    const v = measured ? Math.max(0, /** @type {number} */ (value)) : 0;
    const marked = mark != null && Number.isFinite(mark);
    const m = marked ? Math.max(0, /** @type {number} */ (mark)) : 0;
    return {
        measured,
        fill: Math.min(1, v),
        over: v > 1,
        mark: marked ? Math.min(1, m) : null,
        markOver: marked && m > 1,
        now: measured ? Math.min(100, Math.round(v * 100)) : null,
    };
}

/**
 * The words a meter is read by: the real share, never clamped
 * (`130% booked for tonight`), and the mark's share with its label, as
 * `62% full; 80% the target level`. No number reads `meterNotMeasured`.
 * @param {number | null | undefined} value 0..∞ (1 is full)
 * @param {number | null | undefined} [mark] 0..∞
 * @param {{ unit?: string, label?: string, markLabel?: string }} [words] `label` is `meterUsed` unless given
 * @returns {string}
 */
export function meterText(value, mark = null, { unit = '%', label, markLabel = '' } = {}) {
    const strings = getStrings();
    if (value == null || !Number.isFinite(value)) return strings.meterNotMeasured;
    const share = (/** @type {number} */ v) => `${Math.round(v * 100)}${unit}`;
    let text = `${share(value)} ${label ?? strings.meterUsed}`.trim();
    if (mark != null && Number.isFinite(mark)) text += `; ${share(mark)} ${markLabel}`.trimEnd();
    return text;
}

/**
 * @typedef {object} Meter
 * @property {number | null} [value] the share, 0 up (1 is full; above 1 the bar is full and says so); null is not measured
 * @property {number | null} [mark] a tick at this share (a target, a limit, what is booked), 0 up; null is none
 * @property {'warning' | 'destructive' | null} [tone] the fill's colour; a tone on the tile around it does the same
 * @property {string} [label] what the share is, in the words a screen reader hears ("full"); `meterUsed` unless given
 * @property {string} [markLabel] what the mark is ("the target level")
 * @property {boolean} [loading] the track pulses at its height, with no fill and no mark
 */

/**
 * Write a `.kp-meter`'s share, mark, tone and ARIA in one call: `--kp-value`
 * and `--kp-mark`, `role="meter"` with `aria-valuenow` (0 to 100) and an
 * `aria-valuetext` that names the real share (meterText()). Above 1 the
 * fill is full and the meter carries `data-kp-over`; a mark above 1 sits at
 * the end with a ▸ and carries it too. The mark is a `.kp-meter__mark`
 * child, made the first time a meter has one.
 * @param {HTMLElement} el
 * @param {Meter} meter
 */
export function setMeter(el, { value = null, mark = null, tone = null, label, markLabel = '', loading = false }) {
    const parts = meterParts(loading ? null : value, loading ? null : mark);
    el.setAttribute('role', 'meter');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    el.toggleAttribute('data-kp-loading', loading);
    if (loading) el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');
    el.style.setProperty('--kp-value', parts.measured ? String(Math.max(0, /** @type {number} */ (value))) : '0');
    el.toggleAttribute('data-kp-over', parts.over);
    if (parts.now != null) el.setAttribute('aria-valuenow', String(parts.now));
    else el.removeAttribute('aria-valuenow');
    el.setAttribute('aria-valuetext', loading ? getStrings().meterMeasuring : meterText(value, mark, { label, markLabel }));
    if (tone) el.setAttribute('data-kp-tone', tone);
    else el.removeAttribute('data-kp-tone');
    let tick = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-meter__mark'));
    const marked = parts.mark != null;
    if (marked && !tick) {
        tick = el.ownerDocument.createElement('span');
        tick.className = 'kp-meter__mark';
        tick.setAttribute('aria-hidden', 'true');
        el.append(tick);
    }
    if (tick) tick.hidden = !marked;
    if (marked && tick) {
        el.style.setProperty('--kp-mark', String(Math.max(0, /** @type {number} */ (mark))));
        tick.toggleAttribute('data-kp-over', parts.markOver);
    } else el.style.removeProperty('--kp-mark');
}

/* ----------------------------------------------------------- KPI strips */

/** A strip whose column count comes from a list of allowed counts. */
export const KPI_STRIP = '.kp-kpis[data-kp-kpis-columns]';

/**
 * How many columns a strip of `n` tiles takes at `width`: the first allowed
 * count whose tiles are at least `minTilePx` wide; then, if that leaves one
 * tile alone on the last row, the next smaller allowed count (two or more)
 * that does not; failing that the count stays and the last tile spans its
 * row. `all` in the list is `n`.
 * @param {number} n
 * @param {number} width the strip's inner width, px
 * @param {{ allowed?: (number | 'all')[] | string, minTilePx?: number, gapPx?: number }} [options]
 * @returns {{ columns: number, spanLast: boolean }}
 */
export function kpiColumns(n, width, { allowed = 'all 3 2 1', minTilePx = 144, gapPx = 16 } = {}) {
    if (n <= 1) return { columns: 1, spanLast: false };
    const list = (typeof allowed === 'string' ? allowed.trim().split(/\s+/) : allowed)
        .map((c) => (c === 'all' ? n : Number(c)))
        .filter((c) => Number.isInteger(c) && c >= 1 && c <= n)
        .filter((c, at, all) => all.indexOf(c) === at);
    if (!list.length) list.push(1);
    const fits = (/** @type {number} */ c) => (width - (c - 1) * gapPx) / c >= minTilePx;
    const first = list.findIndex(fits);
    const at = first < 0 ? list.length - 1 : first;
    const columns = list[at];
    if (columns > 1 && n % columns === 1) {
        const better = list.slice(at + 1).find((c) => c >= 2 && c < columns && n % c !== 1);
        if (better) return { columns: better, spanLast: false };
        return { columns, spanLast: true };
    }
    return { columns, spanLast: false };
}

/** A length in a custom property ("10rem", "160px") in pixels. @param {Element} el @param {string} text @param {number} fallback */
function lengthPx(el, text, fallback) {
    const m = /^\s*(-?[\d.]+)\s*(px|rem|em)?\s*$/.exec(text);
    if (!m) return fallback;
    const n = Number(m[1]);
    const view = el.ownerDocument.defaultView;
    if (m[2] === 'rem') return n * parseFloat(view?.getComputedStyle(el.ownerDocument.documentElement).fontSize || '16');
    if (m[2] === 'em') return n * parseFloat(view?.getComputedStyle(el).fontSize || '16');
    return n;
}

/** A tile's label in a strip with columns: one line, never wrapped and never cut [fix-99, fix-101]. */
const TILE_LABEL = ':scope > .kp-kpi:not([hidden]) > .kp-kpi__label';

/** Every label in the strip fits its tile. @param {HTMLElement} strip */
function labelsFit(strip) {
    return [...strip.querySelectorAll(TILE_LABEL)].every((label) => label.scrollWidth <= label.clientWidth + 0.5);
}

/**
 * Put one strip on its column count now: kpiColumns() over its shown
 * tiles, its inner width (or `width`), `--kp-kpi-min` (9rem) and its column
 * gap; writes `--kp-kpis-columns` and `data-kp-kpis-span-last`. A tile's
 * label is one line and never cut, so while one does not fit its tile the
 * strip takes its next smaller allowed count: the tile grows to its label,
 * and every tile in the row with it [fix-99]. The count thus respects the
 * widest label as well as `--kp-kpi-min`, at desk width and in a phone
 * pane alike [fix-101].
 * @param {HTMLElement} strip
 * @param {number} [width] px; else measured
 */
export function fitKpiStrip(strip, width) {
    const view = strip.ownerDocument.defaultView;
    if (!view) return;
    const style = view.getComputedStyle(strip);
    const inner = width ?? strip.clientWidth - parseFloat(style.paddingInlineStart || '0') - parseFloat(style.paddingInlineEnd || '0');
    if (!(inner > 0)) return;
    const n = [...strip.children].filter((tile) => !(/** @type {HTMLElement} */ (tile).hidden)).length;
    const allowed = strip.getAttribute('data-kp-kpis-columns') || 'all 3 2 1';
    const gapPx = parseFloat(style.columnGap) || 0;
    let minTilePx = lengthPx(strip, style.getPropertyValue('--kp-kpi-min'), 144);
    for (let last = Infinity; ;) {
        const { columns, spanLast } = kpiColumns(n, inner, { allowed, minTilePx, gapPx });
        strip.style.setProperty('--kp-kpis-columns', String(columns));
        strip.toggleAttribute('data-kp-kpis-span-last', spanLast);
        if (columns <= 1 || columns >= last || labelsFit(strip)) return;
        last = columns;
        minTilePx = (inner - (columns - 1) * gapPx) / columns + 1;
    }
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
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    if (!view) return () => {};
    /** @type {Set<HTMLElement>} */
    const watched = new Set();
    const sizes = new view.ResizeObserver((entries) => {
        for (const entry of entries) {
            const size = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
            fitKpiStrip(/** @type {HTMLElement} */ (entry.target), size);
        }
    });
    const scan = () => {
        for (const strip of /** @type {HTMLElement[]} */ ([...root.querySelectorAll(KPI_STRIP)])) {
            if (!watched.has(strip)) {
                watched.add(strip);
                sizes.observe(strip);
            }
            fitKpiStrip(strip);
        }
    };
    scan();
    const changes = new view.MutationObserver(scan);
    changes.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
        subtree: true,
        childList: true,
        attributes: true,
        // A theme's type changes how wide a label is [fix-99, fix-101].
        attributeFilter: ['hidden', 'data-kp-kpis-columns', 'data-theme'],
    });
    doc.fonts?.addEventListener('loadingdone', scan);
    return () => {
        sizes.disconnect();
        changes.disconnect();
        doc.fonts?.removeEventListener('loadingdone', scan);
    };
}
