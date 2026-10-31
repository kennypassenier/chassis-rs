// Pure time text: a length read from "25m" or "1:30:00", and the digits of a time left.

import { getStrings } from '../strings.js';
import { DAY_HOURS, DAY_S, HOUR_S, MINUTE_S, ROUND_EPSILON, SECOND_MS } from './constants.js';

/**
 * A length in seconds from "90", "25m", "1h30m", "45s", "25:00" or "1:30:00".
 * @param {string | number | null | undefined} value
 * @returns {number} seconds, 0 when unreadable
 */
export function parseDuration(value) {
    if (typeof value === 'number') return Math.max(0, Math.round(value));
    const text = String(value ?? '')
        .trim()
        .toLowerCase();
    if (text === '') return 0;
    if (/^\d+(:\d{1,2}){1,2}$/.test(text)) {
        return text.split(':').reduce((sum, part) => sum * MINUTE_S + Number(part), 0);
    }
    if (/^\d+$/.test(text)) return Number(text);
    let total = 0;
    let matched = false;
    for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(h|m|s)/g)) {
        matched = true;
        total += Number(m[1]) * (m[2] === 'h' ? HOUR_S : m[2] === 'm' ? MINUTE_S : 1);
    }
    return matched ? Math.round(total) : 0;
}

/**
 * The digits of a time left, rounded up to the second: "25:00", "0:08", "1:02:03".
 * @param {number} ms the time left
 * @param {boolean} hours whether the timer shows hours (it holds an hour or more)
 * @param {boolean} [days] whether 24 hours or more is written with a days unit ("6 d 22 h"); off, it reads "167:59:59"
 */
export function formatCountdown(ms, hours, days = false) {
    const total = Math.max(0, Math.ceil(ms / SECOND_MS - ROUND_EPSILON));
    // Past 24 hours a length is read in days, "6 d 22 h"; under 24 hours nothing changes [wish-1120, homelab 124].
    // Rounded up to the hour, as the digits are rounded up to the second: 6 d 21 h 59 min 59 s reads 6 d 22 h.
    if (days && total >= DAY_S) {
        const hoursUp = Math.ceil(total / HOUR_S);
        return getStrings().countdownDays(Math.floor(hoursUp / DAY_HOURS), hoursUp % DAY_HOURS);
    }
    const h = Math.floor(total / HOUR_S);
    const m = Math.floor((total % HOUR_S) / MINUTE_S);
    const s = total % MINUTE_S;
    const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return hours ? `${h}:${two(m)}:${two(s)}` : `${two(Math.floor(total / MINUTE_S))}:${two(s)}`;
}
