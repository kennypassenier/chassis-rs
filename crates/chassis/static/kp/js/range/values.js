// The range picker's selector, event, presets and its pure helpers: a preset's length, a moment's words, a typed time and the faults of a window.

import { CHART_TIME_ZONE, wallTime } from '../chart.js';

/** A range picker. */
export const RANGE = '[data-kp-range]';
/** Fired on the picker when the window changes by a person: `{ preset, start, end, label }`. */
export const RANGE_EVENT = 'kp-range-change';
/** The presets a picker offers when it does not say (`data-kp-range-presets`). */
export const RANGE_PRESETS = ['1h', '6h', '24h', '7d', '30d'];

/** The length in ms of the unit letters of a preset: minute, hour, day, week. */
export const UNIT = { m: 60000, h: 3600000, d: 86400000, w: 604800000 };
/** How far past "now" an end may lie before it counts as the future (a minute of clock drift). */
export const FUTURE_SLACK_MS = 60000;

/**
 * A preset's length in ms ("24h", "7d", "90m", "2w"); 0 when unreadable.
 * @param {string} key
 */
export function presetMs(key) {
    const m = /^(\d+)\s*([mhdw])$/.exec(key.trim().toLowerCase());
    return m ? Number(m[1]) * UNIT[/** @type {keyof typeof UNIT} */ (m[2])] : 0;
}

/** @param {number} n */
export const two = (n) => String(n).padStart(2, '0');

/**
 * A moment as rule 52 writes it, in a zone: "16/10/2026 14:05".
 * @param {number} ms @param {string} [timeZone]
 */
export function rangeMoment(ms, timeZone = CHART_TIME_ZONE) {
    const w = wallTime(ms, timeZone);
    return `${two(w.day)}/${two(w.month)}/${w.year} ${two(w.hour)}:${two(w.minute)}`;
}

/**
 * A time typed as "14:05", "1405", "14.05" or "9"; null when it is not a time of day.
 * @param {string} text
 * @returns {{ hour: number, minute: number } | null}
 */
export function parseTime(text) {
    const t = text.trim();
    const m = /^(\d{1,2})(?:[:.h ]?(\d{2}))?$/.exec(t);
    if (!m) return null;
    const hour = Number(m[1]);
    const minute = m[2] === undefined ? 0 : Number(m[2]);
    return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * What is wrong with a custom window, as dictionary keys; empty when it is right.
 * @param {number | null} start @param {number | null} end @param {{ now: number, future?: boolean, maxDays?: number }} rules
 * @returns {('order' | 'future' | 'span')[]}
 */
export function rangeFaults(start, end, { now, future = false, maxDays = 0 }) {
    /** @type {('order' | 'future' | 'span')[]} */
    const faults = [];
    if (start === null || end === null) return faults;
    if (end <= start) faults.push('order');
    if (!future && end > now + FUTURE_SLACK_MS) faults.push('future');
    if (maxDays > 0 && end - start > maxDays * UNIT.d) faults.push('span');
    return faults;
}
