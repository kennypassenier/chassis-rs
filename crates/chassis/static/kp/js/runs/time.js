// Pure: a run's distance from now in words, how far a zone runs ahead of UTC, a run as rule 52 writes it, and the clock turning.

import { getStrings } from '../strings.js';
import { dayNames } from '../weekdays.js';
import { humanDuration } from '../freshness.js';
import { CHART_TIME_ZONE, wallTime } from '../chart.js';
import { DAY_S, MINUTE_MS, MINUTE_S, NOW_S } from './values.js';

/** @param {number} n */
const two = (n) => String(n).padStart(2, '0');

/**
 * A moment's distance from now in the coarsest honest words: "in 35 min", "in 3 h 20 min", "in 2 days". Pure.
 * @param {number} ms the moment
 * @param {number} now
 * @param {import('../strings.js').Strings} [strings]
 */
export function runsRelative(ms, now, strings = getStrings()) {
    const seconds = Math.round((ms - now) / 1000);
    if (seconds < NOW_S) return strings.runsNow;
    if (seconds < MINUTE_S) return strings.runsIn(strings.agoSeconds(seconds));
    if (seconds >= DAY_S) return strings.runsIn(strings.agoDays(Math.floor(seconds / DAY_S)));
    return strings.runsIn(humanDuration(seconds, strings));
}

/**
 * How far a zone's wall clock runs ahead of UTC at a moment, in minutes. Pure.
 * @param {number} ms @param {string} zone
 */
export function zoneOffset(ms, zone = CHART_TIME_ZONE) {
    const w = wallTime(ms, zone);
    return (Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(ms / MINUTE_MS) * MINUTE_MS) / MINUTE_MS;
}

/**
 * A run as rule 52 writes it with its weekday: "Mon 20/10/2026 03:00". Pure.
 * @param {number} ms @param {string} [zone] @param {string} [locale]
 */
export function runMoment(ms, zone = CHART_TIME_ZONE, locale) {
    const w = wallTime(ms, zone);
    const day = dayNames('short', locale)[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()] ?? '';
    return `${day} ${two(w.day)}/${two(w.month)}/${w.year} ${two(w.hour)}:${two(w.minute)}`;
}

/**
 * The hours the clock was turned between two runs: positive when it went forward. 0 when it was not. Pure.
 * @param {number} before @param {number} after @param {string} [zone]
 */
export function clockShift(before, after, zone = CHART_TIME_ZONE) {
    return (zoneOffset(after, zone) - zoneOffset(before, zone)) / MINUTE_S;
}
