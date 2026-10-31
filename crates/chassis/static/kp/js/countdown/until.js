// The `until` option: the moment it names, and the words that label it.

import { EPOCH_MS_DIGITS } from './constants.js';
import { wallParts, zonedMoment } from './zones.js';

/**
 * The moment an `until` option names, in epoch ms: "14:30" or "14:30:15" is the next such time on the clock of `timeZone`
 * (the device's when none; today when it is still ahead, else tomorrow), a date and time is that moment (read in `timeZone`
 * when it carries no offset of its own), a number of 10 digits or more is epoch ms.
 * @param {string | number | null | undefined} value
 * @param {number} nowMs
 * @param {string | null} [timeZone] an IANA zone name
 * @returns {number | null} null when the value names no moment
 */
export function parseUntil(value, nowMs, timeZone = null) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value ?? '').trim();
    if (text === '') return null;
    const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (clock) {
        const [h, m, sec] = [Number(clock[1]), Number(clock[2]), Number(clock[3] ?? 0)];
        if (h > 23 || m > 59 || sec > 59) return null;
        const now = wallParts(nowMs, timeZone);
        let at = zonedMoment(now.year, now.month, now.day, h, m, sec, timeZone);
        // Tomorrow, by the calendar of the zone (a day is not always 24 hours).
        if (at <= nowMs) {
            const next = new Date(Date.UTC(now.year, now.month - 1, now.day + 1));
            at = zonedMoment(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), h, m, sec, timeZone);
        }
        return at;
    }
    if (new RegExp(`^\\d{${EPOCH_MS_DIGITS},}$`).test(text)) return Number(text);
    const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(text);
    if (local && timeZone !== null) {
        const [y, mo, d, h, mi, sec] = local.slice(1).map((x) => Number(x ?? 0));
        return zonedMoment(y, mo, d, h, mi, sec, timeZone);
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A moment as the words after "until": "14:30" when it is today, else "20/10/2026 09:00", read on the clock of `zone`
 * (the zone the moment was given in; the device's when null).
 * @param {number} ms @param {number} nowMs @param {import('./constants.js').UntilZone} [zone]
 */
export function untilLabel(ms, nowMs, zone = null) {
    const at = wallParts(ms, zone);
    const today = wallParts(nowMs, zone);
    const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
    const clock = `${two(at.hour)}:${two(at.minute)}`;
    const sameDay = at.year === today.year && at.month === today.month && at.day === today.day;
    return sameDay ? clock : `${two(at.day)}/${two(at.month)}/${at.year} ${clock}`;
}
