// Pure figures: the uptime share, its percent and how many periods fit.
import { UPTIME_STATES } from './constants.js';
/** @typedef {import('./types.js').UptimeFigures} UptimeFigures */
/** @typedef {import('./types.js').UptimePeriod} UptimePeriod */

/**
 * The window's figures from its periods.
 * @param {readonly UptimePeriod[]} periods
 * @returns {UptimeFigures}
 */
export function uptimeFigures(periods) {
    const counts = { up: 0, degraded: 0, down: 0, none: 0 };
    let sum = 0;
    let incidents = 0;
    for (const period of periods) {
        const state = UPTIME_STATES.includes(period.state) ? period.state : 'none';
        counts[state] += 1;
        if (state === 'none') continue;
        const share =
            typeof period.uptime === 'number' && Number.isFinite(period.uptime) ? Math.min(1, Math.max(0, period.uptime)) : state === 'down' ? 0 : 1;
        sum += share;
        incidents += typeof period.incidents === 'number' && period.incidents >= 0 ? Math.floor(period.incidents) : state === 'up' ? 0 : 1;
    }
    const measured = counts.up + counts.degraded + counts.down;
    return { measured, share: measured === 0 ? null : sum / measured, incidents, counts };
}

/**
 * A share as a percentage with one decimal, cut rather than rounded, so a window with any time down never reads 100.
 * @param {number} share 0 to 1
 * @returns {string} "99.4", "99.0", "100", "0"
 */
export function uptimePercent(share) {
    if (share >= 1) return '100';
    if (share <= 0) return '0';
    // The small epsilon keeps a share like 0.994 (993.9999… thousandths in binary) from reading 99.3.
    return (Math.min(999, Math.floor(share * 1000 + 1e-9)) / 10).toFixed(1);
}

/**
 * How many of `count` cells fit in `width` px, each at least `min` px with `gap` px between.
 * @param {number} count @param {number} width @param {number} min @param {number} gap
 * @returns {number}
 */
export function uptimeFit(count, width, min, gap) {
    if (count <= 0) return 0;
    const fits = Math.floor((width + gap) / (Math.max(1, min) + gap));
    return Math.max(1, Math.min(count, fits));
}
