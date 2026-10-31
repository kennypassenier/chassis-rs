// Pure date helpers: the days and the range an availability grid spans.
import { getStrings } from '../strings.js';
/** @typedef {import('./types.js').AvailabilityColumn} AvailabilityColumn */

/**
 * Day columns in rule 52: `Sat 21/6`, with the long date under it.
 * @param {string} start an ISO date `2026-06-19`
 * @param {number} count
 * @param {string} [zone]
 * @returns {AvailabilityColumn[]}
 */
export function availabilityDays(start, count, zone = 'Europe/Brussels') {
    const first = new Date(`${start}T12:00:00Z`);
    const short = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    void zone;
    return Array.from({ length: count }, (_, i) => {
        const day = new Date(first.getTime() + i * 86400000);
        const key = day.toISOString().slice(0, 10);
        return { key, label: `${short.format(day)} ${day.getUTCDate()}/${day.getUTCMonth() + 1}`, sub: long.format(day) };
    });
}

/**
 * A proposed period as one column: `21 to 23 Jun`, with its length under it.
 * @param {string} start an ISO date @param {string} end an ISO date (the last day, inclusive)
 * @returns {AvailabilityColumn}
 */
export function availabilityRange(start, end) {
    const a = new Date(`${start}T12:00:00Z`);
    const b = new Date(`${end}T12:00:00Z`);
    const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
    const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    const same = a.getUTCMonth() === b.getUTCMonth();
    return {
        key: `${start}/${end}`,
        label: same
            ? `${a.getUTCDate()} to ${b.getUTCDate()} ${month.format(b)}`
            : `${a.getUTCDate()} ${month.format(a)} to ${b.getUTCDate()} ${month.format(b)}`,
        sub: getStrings().availabilityDaysLong(days),
    };
}
