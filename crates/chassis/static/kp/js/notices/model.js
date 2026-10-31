// The notices as data: reading a time, ordering the list and taking the panel's newest per severity.

import { NOTICE_SEVERITIES, PANEL_MAX } from './events.js';

/** @typedef {import('../notices.js').Notice} Notice */

/**
 * A time given as ISO or epoch ms, as epoch ms; null when there is none or it does not parse.
 * @param {number | string | null | undefined} v
 * @returns {number | null}
 */
export const toMs = (v) => {
    if (v === null || v === undefined) return null;
    const ms = typeof v === 'number' ? v : Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
};

/**
 * The notices in display order: worst first then newest (`severity`), or newest first (`time`).
 * @param {Notice[]} items
 * @param {'severity' | 'time'} by
 */
export function orderNotices(items, by) {
    const rank = (/** @type {Notice} */ n) => NOTICE_SEVERITIES.indexOf(n.severity);
    return [...items].sort((a, b) => (by === 'severity' && rank(a) !== rank(b) ? rank(a) - rank(b) : b.since - a.since));
}

/**
 * The panel's share of an ordered list: the newest `max` of each severity.
 * @param {Notice[]} ordered
 * @param {string | null} given the `data-kp-panel-max` attribute
 */
export function panelSlice(ordered, given) {
    const max = Math.max(1, Number(given ?? PANEL_MAX) || PANEL_MAX);
    const taken = { critical: 0, warning: 0, info: 0 };
    return ordered.filter((n) => (taken[n.severity] += 1) <= max);
}
