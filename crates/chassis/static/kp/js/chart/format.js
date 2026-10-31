// Pure value formatting: nice maxima and number formats.
/** @typedef {import('./words.js').ChartData} ChartData */
/** @typedef {import('./words.js').ChartUnitKind} ChartUnitKind */
/** @typedef {import('./words.js').ChartValueWhere} ChartValueWhere */

/** Binary byte units, a step of 1024 apart. */
const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
/** @param {ChartUnitKind | undefined} kind */
const isBytes = (kind) => kind === 'bytes' || kind === 'bytes/s' || kind === 'rate';
/**
 * The top of the y axis: a round number just above the highest value. For
 * `percent` 10, 25, 50 or 100 (above 100 the round number, so nothing is
 * cut off); for `bytes` and `bytes/s` round in the binary unit the value is
 * printed in (2 GiB, not 1.86).
 * @param {number} v
 * @param {ChartUnitKind} [kind]
 * @returns {number}
 */
export function niceMax(v, kind) {
    if (kind === 'percent' && !(v > 100)) return v > 50 ? 100 : v > 25 ? 50 : v > 10 ? 25 : 10;
    if (isBytes(kind) && v >= 1024) {
        let unit = 1;
        for (let i = 1; i < BYTE_UNITS.length && v / unit >= 1024; i++) unit *= 1024;
        return niceMax(v / unit) * unit;
    }
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v * 1.05) return m * p;
    return 10 * p;
}
/** One number format per locale and digits. @type {Map<string, Intl.NumberFormat>} */
const NUMBERS = new Map();
/** @param {string} locale @param {number} min @param {number} max */
function numberFormat(locale, min, max) {
    const key = `${locale} ${min} ${max}`;
    let nf = NUMBERS.get(key);
    if (!nf) {
        nf = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max });
        NUMBERS.set(key, nf);
    }
    return nf;
}
/**
 * A value as a chart prints it, without a page's own `format`. With a
 * `unitKind`: `percent` one decimal under 10 (`7.5%`, `42%`, `0%`); `bytes`
 * in binary steps, a decimal under 100 of a unit (`512 B`, `1.5 GiB`,
 * `120 MiB`); `bytes/s` (or `rate`) the same per second (`3.2 MiB/s`);
 * `celsius` whole degrees (`54 °C`); `count` and `flag` exact and grouped
 * (`12,345`), on the axis only abbreviated (`12.3k`). The axis carries the
 * unit for a unit kind. Without one: `digits` (else by size) and `unit`
 * after it, not on the axis.
 * @param {number} v
 * @param {ChartValueWhere} [where]
 * @param {Pick<ChartData, 'unit' | 'unitKind' | 'digits'>} [data]
 * @param {string} [locale] the numbers' grouping and decimal sign; `en-GB` by default
 */
export function formatChartValue(v, where = 'tip', data = {}, locale = 'en-GB') {
    const kind = data.unitKind;
    /** @param {number} x @param {number} min @param {number} [max] */
    const n = (x, min, max = min) => numberFormat(locale, min, max).format(x);
    if (kind === 'percent') return `${n(v, v !== 0 && Math.abs(v) < 10 ? 1 : 0)}%`;
    if (isBytes(kind)) {
        let x = v;
        let i = 0;
        while (Math.abs(x) >= 1024 && i < BYTE_UNITS.length - 1) {
            x /= 1024;
            i++;
        }
        const text = `${n(x, Math.abs(x) >= 100 || i === 0 ? 0 : 1)} ${BYTE_UNITS[i]}`;
        return kind === 'bytes' ? text : `${text}/s`;
    }
    if (kind === 'celsius') return `${n(v, 0)} °C`;
    if (kind === 'count' || kind === 'flag') {
        const a = Math.abs(v);
        // Counters are exact (R-COUNT); only the axis, which has no room,
        // rounds a large one.
        if (where === 'axis') {
            if (a >= 1e7) return `${n(v / 1e6, 1)}M`;
            if (a >= 1e4) return `${n(v / 1e3, 1)}k`;
            if (a >= 100) return n(v, 0);
            return Number.isInteger(v) ? n(v, 0) : n(v, 2);
        }
        return n(v, 0, Number.isInteger(v) ? 0 : 2);
    }
    const digits = data.digits ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
    const text = n(v, data.digits ?? 0, digits);
    return where === 'axis' || !data.unit ? text : `${text} ${data.unit}`;
}
