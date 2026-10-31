// The transfer's pure arithmetic: the speed over a moving window, and the time left in coarse words.

import { humanDuration } from '../freshness.js';
import { getStrings } from '../strings.js';
import { DEFAULT_RATE_WINDOW_S, MS } from './values.js';

/** Below these many seconds the time left is exact, then to 5 s, then to the minute, then to five minutes. */
const EXACT_BELOW_S = 10;
const MINUTE_S = 60;
const HOUR_S = 3600;
const FIVE_S = 5;
const FIVE_MIN_S = 300;

/**
 * Moving-average speed in bytes per second over the last `windowS` seconds of samples; null with fewer than two.
 * @param {{ t: number, done: number }[]} samples oldest first
 * @param {number} windowS
 * @returns {number | null}
 */
export function transferRate(samples, windowS = DEFAULT_RATE_WINDOW_S) {
    const last = samples.at(-1);
    if (!last || samples.length < 2) return null;
    const from = last.t - windowS * MS;
    const inside = samples.filter((s) => s.t >= from);
    const first = inside.length >= 2 ? inside[0] : samples.at(-2);
    if (!first || last.t <= first.t) return null;
    return Math.max(0, (last.done - first.done) / ((last.t - first.t) / MS));
}

/**
 * The time left in human words, coarse so it does not shimmer: exact under 10 s, to 5 s under a minute, to the minute under
 * an hour.
 * @param {number} seconds
 * @returns {string}
 */
export function transferEta(seconds) {
    const s = getStrings();
    const n = Math.max(0, Math.round(seconds));
    const coarse =
        n < EXACT_BELOW_S ? n : n < MINUTE_S ? Math.round(n / FIVE_S) * FIVE_S : n < HOUR_S ? Math.round(n / MINUTE_S) * MINUTE_S : Math.round(n / FIVE_MIN_S) * FIVE_MIN_S;
    return humanDuration(coarse, s);
}
