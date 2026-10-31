// Pure selection rules: nearest point, hour change and next selection.
/** @typedef {import('./words.js').ChartPoint} ChartPoint */
/** @typedef {import('./words.js').ChartSeries} ChartSeries */

/**
 * The index of the point nearest to `t` (the points oldest first).
 * @param {readonly ChartPoint[]} points
 * @param {number} t
 */
export function indexAt(points, t) {
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (points[mid][0] < t) lo = mid;
        else hi = mid;
    }
    return Math.abs(points[hi][0] - t) < Math.abs(points[lo][0] - t) ? hi : lo;
}
/**
 * A source's change over the hour before point `i`: its value there minus
 * the value an hour of points earlier (or the first point).
 * @param {readonly ChartPoint[]} points
 * @param {number} i
 */
export function hourChange(points, i) {
    const step = points.length > 1 ? points[1][0] - points[0][0] || 3_600_000 : 3_600_000;
    const back = Math.max(0, i - Math.max(1, Math.round(3_600_000 / step)));
    return points[i][1] - points[back][1];
}
/**
 * The legend's selection after a click on source `i` of `n`: on or off,
 * several allowed; all on is the same as none (everything shown).
 * @param {ReadonlySet<number>} sel
 * @param {number} i
 * @param {number} n
 * @returns {Set<number>}
 */
export function toggleSource(sel, i, n) {
    const next = new Set(sel);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    if (next.size === n) next.clear();
    return next;
}
/**
 * The legend's selection after chartSelect(el, index, on): `null` shows
 * every source again; without `on` source `index` toggles, as a click does;
 * with `on` it is put on or off. Null when nothing changes (an index outside
 * `0..n-1`, or a source already as asked).
 * @param {ReadonlySet<number>} sel
 * @param {number | null} index
 * @param {number} n the number of sources
 * @param {boolean} [on]
 * @returns {Set<number> | null}
 */
export function nextSelection(sel, index, n, on) {
    if (index == null) return sel.size === 0 ? null : new Set();
    if (!Number.isInteger(index) || index < 0 || index >= n) return null;
    if (on !== undefined && on === sel.has(index)) return null;
    return toggleSource(sel, index, n);
}
/**
 * A series' points, whichever way it was given.
 * @param {ChartSeries} series
 * @returns {ChartPoint[]}
 */
export function pointsOf(series) {
    if (series.points) return series.points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const { start = 0, step = 60_000, values = [] } = series;
    /** @type {ChartPoint[]} */
    const out = [];
    values.forEach((v, at) => {
        if (Number.isFinite(v)) out.push([start + at * step, v]);
    });
    return out;
}
