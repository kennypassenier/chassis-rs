// The column count of a strip: how many columns n tiles take at a width, and putting a strip on that count.

import { FALLBACK_FONT_PX, LABEL_SLACK_PX, STRIP_DEFAULTS, TILE_LABEL } from './values.js';

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
export function kpiColumns(n, width, { allowed = STRIP_DEFAULTS.allowed, minTilePx = STRIP_DEFAULTS.minTilePx, gapPx = STRIP_DEFAULTS.gapPx } = {}) {
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
    if (m[2] === 'rem') return n * parseFloat(view?.getComputedStyle(el.ownerDocument.documentElement).fontSize || String(FALLBACK_FONT_PX));
    if (m[2] === 'em') return n * parseFloat(view?.getComputedStyle(el).fontSize || String(FALLBACK_FONT_PX));
    return n;
}

/**
 * Every label in the strip fits its tile: the label's text (and a toggle's hint beside it) ends inside the tile's own padding box
 * edge. The label's own box is no measure: in a tile whose grid track is `min-content` (a toggle with a hint) the track grows to the
 * label, so the label always "fits" its own box and runs under the next tile [hlcomp-1019 kpi-fit; homelab 78].
 * @param {HTMLElement} strip
 */
function labelsFit(strip) {
    return [...strip.querySelectorAll(TILE_LABEL)].every((label) => {
        const tile = /** @type {HTMLElement} */ (label.parentElement);
        const style = getComputedStyle(tile);
        const box = tile.getBoundingClientRect();
        const rtl = style.direction === 'rtl';
        const edge = rtl
            ? box.left + tile.clientLeft + (Number.parseFloat(style.paddingLeft) || 0)
            : box.right - tile.clientLeft - (Number.parseFloat(style.paddingRight) || 0);
        const ends = (/** @type {HTMLElement} */ el) => {
            const r = el.getBoundingClientRect();
            const extent = Math.max(el.scrollWidth, r.width);
            return rtl ? r.right - extent : r.left + extent;
        };
        const reaches = /** @type {HTMLElement[]} */ ([label, ...tile.querySelectorAll(':scope > .kp-kpi__hint')]).map((el) => ends(el));
        return reaches.every((at) => (rtl ? at >= edge - LABEL_SLACK_PX : at <= edge + LABEL_SLACK_PX));
    });
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
    const allowed = strip.getAttribute('data-kp-kpis-columns') || STRIP_DEFAULTS.allowed;
    const gapPx = parseFloat(style.columnGap) || 0;
    let minTilePx = lengthPx(strip, style.getPropertyValue('--kp-kpi-min'), STRIP_DEFAULTS.minTilePx);
    for (let last = Infinity; ;) {
        const { columns, spanLast } = kpiColumns(n, inner, { allowed, minTilePx, gapPx });
        strip.style.setProperty('--kp-kpis-columns', String(columns));
        strip.toggleAttribute('data-kp-kpis-span-last', spanLast);
        if (columns <= 1 || columns >= last || labelsFit(strip)) return;
        last = columns;
        minTilePx = (inner - (columns - 1) * gapPx) / columns + 1;
    }
}
