// Pure statistics over a series: spans, median and runs.

/**
 * The dash of the `i`-th source's line: none for the first five (each its
 * own `--chart-n`), one of three dashes when the colours come round again.
 * @param {number} i
 * @returns {0 | 1 | 2 | 3} 0 = solid
 */
export const dashOf = (i) => /** @type {0 | 1 | 2 | 3} */ (i < 5 ? 0 : (Math.floor(i / 5 - 1) % 3) + 1);
/**
 * "1h", "24h", "7d", "15m" in ms; anything else null.
 * @param {string | null | undefined} text
 * @returns {number | null}
 */
export function parseSpan(text) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(m|h|d)\s*$/.exec(text ?? '');
    if (!m) return null;
    return Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[/** @type {'m' | 'h' | 'd'} */ (m[2])];
}
/**
 * The median of a list of numbers (the mean of the two in the middle when
 * their count is even), or null for none [kpadopt5-people].
 * @param {readonly number[]} values
 * @returns {number | null}
 */
export function chartMedian(values) {
    const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/**
 * The places of the points that belong to a run: six or more in a row on one
 * side of the median (the run-chart rule). A point exactly on the median
 * neither breaks a run nor counts in it.
 * @param {readonly number[]} values oldest first
 * @param {number} median
 * @param {number} [least] the run's least length, 6
 * @returns {Set<number>} indexes into `values`
 */
export function chartRuns(values, median, least = 6) {
    /** @type {Set<number>} */
    const marked = new Set();
    /** @type {number[]} */
    let run = [];
    let side = 0;
    const close = () => {
        if (run.length >= least) for (const i of run) marked.add(i);
        run = [];
    };
    values.forEach((v, i) => {
        const now = Math.sign(v - median);
        if (now === 0) return;
        if (now !== side) {
            close();
            side = now;
        }
        run.push(i);
    });
    close();
    return marked;
}
