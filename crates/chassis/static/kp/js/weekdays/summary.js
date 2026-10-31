// Pure: the picked days in words: "Mon and Thu", "Every weekday", "On the 1st and 15th".

import { getStrings } from '../strings.js';
import { dayNames } from './names.js';
import { SETS, WEEK } from './values.js';

/**
 * "Mon and Thu", "Mon, Wed and Fri": a list in words.
 * @param {readonly string[]} items
 * @param {string} [and]
 */
export function joinWords(items, and = getStrings().weekdaysAnd) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

/**
 * The picked days in words, in the order a week reads from `firstDay`. Pure.
 * @param {readonly number[]} days 0 to 6
 * @param {{ firstDay?: number, names?: readonly string[] }} [options] `names` are Sunday first
 * @returns {string}
 */
export function weekdaySummary(days, { firstDay = 1, names = dayNames('short') } = {}) {
    const s = getStrings();
    const on = new Set(days);
    if (on.size === 0) return s.weekdaysNone;
    const same = (/** @type {readonly number[]} */ set) => set.length === on.size && set.every((d) => on.has(d));
    if (same(SETS.every)) return s.weekdaysEvery;
    if (same(SETS.weekdays)) return s.weekdaysWeekdays;
    if (same(SETS.weekend)) return s.weekdaysWeekend;
    const ordered = SETS.every.map((i) => (i + firstDay) % WEEK).filter((d) => on.has(d));
    return joinWords(ordered.map((d) => names[d] ?? ''));
}

/**
 * The picked days of a month in words: "On the 1st and 15th", "On the last day".
 * @param {readonly (number | 'last')[]} days
 * @returns {string}
 */
export function monthSummary(days) {
    const s = getStrings();
    if (days.length === 0) return s.weekdaysNone;
    const numbers = days.filter((d) => d !== 'last').sort((a, b) => Number(a) - Number(b));
    const parts = numbers.map((d) => s.weekdaysOrdinal(Number(d)));
    if (days.includes('last')) parts.push(s.weekdaysLastDay);
    return s.weekdaysOnThe(joinWords(parts));
}
