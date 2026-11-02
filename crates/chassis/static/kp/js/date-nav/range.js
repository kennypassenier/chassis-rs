// The date navigation's arithmetic and words [ux-1101]: the range a mode shows around a day, one step before or after, and the
// label a person reads. Pure: days in, days and words out, every day a `YYYY-MM-DD` string on the calendar (no clock, no zone).

import { formatDayKey, isoOf, shiftDay, shiftMonth, weekday } from '../calendar/dates.js';
import { DAY_MS, DAYS_PER_WEEK, ISO_WEEK_THURSDAY } from './constants.js';

/** The middle of a seven-day range, the day whose ISO week names the range whichever day it starts on. */
const MID_WEEK = 3;
/** @typedef {import('./constants.js').DateNavMode} DateNavMode */
/** @typedef {import('./constants.js').DateNavRange} DateNavRange */

/** A mode as the page wrote it, `month` for anything else. @param {string | null | undefined} text @returns {DateNavMode} */
export const modeOf = (text) => (text === 'week' || text === 'day' ? text : 'month');

/** Whether a text is a day the navigation can stand on. @param {string | null | undefined} text */
export const isDay = (text) => typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));

/**
 * The range `mode` shows around `at`: its month, its week (from `firstDay`, 0 = Sunday) or the day itself.
 * @param {DateNavMode} mode @param {string} at @param {number} firstDay
 * @returns {DateNavRange}
 */
export function rangeOf(mode, at, firstDay) {
    if (mode === 'day') return { mode, at, start: at, end: at };
    if (mode === 'week') {
        const start = shiftDay(at, -weekday(at, firstDay));
        return { mode, at, start, end: shiftDay(start, DAYS_PER_WEEK - 1) };
    }
    const [y = 0, m = 1] = at.split('-').map(Number);
    const start = isoOf(y, m, 1);
    return { mode, at, start, end: shiftDay(shiftMonth(start, 1), -1) };
}

/**
 * The day one step away: a month, a week or a day, before (`-1`) or after (`1`).
 * A month step keeps the day of the month where it can (31 January + 1 month is 28 or 29 February).
 * @param {DateNavMode} mode @param {string} at @param {-1 | 1} direction
 */
export function stepFrom(mode, at, direction) {
    if (mode === 'month') return shiftMonth(at, direction);
    return shiftDay(at, direction * (mode === 'week' ? DAYS_PER_WEEK : 1));
}

/** The ISO week number of a day (weeks from Monday; week 1 holds the year's first Thursday). @param {string} iso */
export function isoWeek(iso) {
    const day = new Date(`${iso}T00:00:00Z`);
    const thursday = new Date(day.getTime() + (ISO_WEEK_THURSDAY - (day.getUTCDay() || DAYS_PER_WEEK)) * DAY_MS);
    const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
    return Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / DAYS_PER_WEEK);
}

/**
 * What the navigation says it shows: "November 2026", "Week 45 · 02/11 to 08/11/2026", "Monday 02/11/2026".
 * @param {DateNavRange} range
 * @param {{ months: string[], weekdays: string[] }} names the locale's month names (January first) and weekday names (Sunday first)
 * @param {(n: number, from: string, to: string) => string} weekWords the dictionary's week label
 */
export function labelOf(range, names, weekWords) {
    const [y = 0, m = 1] = range.at.split('-').map(Number);
    if (range.mode === 'month') return `${names.months[m - 1] ?? m} ${y}`;
    if (range.mode === 'day') return `${names.weekdays[new Date(`${range.at}T00:00:00Z`).getUTCDay()] ?? ''} ${formatDayKey(range.at)}`.trim();
    const from = formatDayKey(range.start).slice(0, 5);
    return weekWords(isoWeek(shiftDay(range.start, MID_WEEK)), from, formatDayKey(range.end));
}

/** Whether the range holds the day. @param {DateNavRange} range @param {string} day */
export const holds = (range, day) => range.start <= day && day <= range.end;
