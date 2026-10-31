// Pure calendar arithmetic on `YYYY-MM-DD` keys: the day a moment falls on, shifting days and months, and a month's 42 cells.

import { CHART_TIME_ZONE, wallTime } from '../chart.js';
import { DAYS_PER_WEEK, GRID_CELLS } from './constants.js';

/** Two digits. @param {number} n */
export const two = (n) => String(n).padStart(2, '0');

/** @param {number} y @param {number} m 1-12 @param {number} d */
export const isoOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/**
 * The day a moment falls on in `timeZone`, as `YYYY-MM-DD`: the wall clock of
 * that zone decides, so 22:30 UTC on 4 October is the 5th in Brussels.
 * @param {number} ms
 * @param {string} [timeZone]
 * @returns {string}
 */
export function dayKey(ms, timeZone = CHART_TIME_ZONE) {
    const w = wallTime(ms, timeZone);
    return `${String(w.year).padStart(4, '0')}-${two(w.month)}-${two(w.day)}`;
}

/** A date as a person reads it (rule 52): `2026-10-04` → `04/10/2026`. @param {string} iso */
export const formatDayKey = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * The day `days` after `iso` (before, when negative), on the calendar: no
 * clock is involved, so a change to summer time moves nothing.
 * @param {string} iso `YYYY-MM-DD`
 * @param {number} days
 * @returns {string}
 */
export function shiftDay(iso, days) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * The same day `months` later (earlier, when negative), clamped to that
 * month's last day: 31/01 plus a month is 28/02.
 * @param {string} iso `YYYY-MM-DD`
 * @param {number} months
 * @returns {string}
 */
export function shiftMonth(iso, months) {
    const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return isoOf(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(d, last));
}

/** Where `iso` falls in a week that starts on `firstDay`: 0 … 6. @param {string} iso @param {number} firstDay 0 = Sunday */
export const weekday = (iso, firstDay) => (new Date(`${iso}T00:00:00Z`).getUTCDay() - firstDay + DAYS_PER_WEEK) % DAYS_PER_WEEK;

/**
 * The 42 days a month's grid shows: six weeks from the first day of the week
 * on or before the month's first, so every month is six rows tall.
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} [firstDay] the week's first day, 0 (Sunday) to 6; Monday by default
 * @returns {string[]} `YYYY-MM-DD`, oldest first
 */
export function monthCells(year, month, firstDay = 1) {
    const first = isoOf(year, month, 1);
    const start = shiftDay(first, -weekday(first, firstDay));
    return Array.from({ length: GRID_CELLS }, (_, i) => shiftDay(start, i));
}
