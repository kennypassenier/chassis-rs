// Time zones for the `until` option: the readers of an IANA zone, wall-clock parts, a wall-clock time as a moment, and the offset a string carries.

import { MINUTE_MS, SECOND_MS } from './constants.js';

/** @type {Map<string, Intl.DateTimeFormat | null>} */
const ZONE_FORMATS = new Map();

/** The reader of one IANA zone, or null for a name Intl does not know. @param {string} zone */
function zoneFormat(zone) {
    if (!ZONE_FORMATS.has(zone)) {
        try {
            ZONE_FORMATS.set(
                zone,
                new Intl.DateTimeFormat('en-GB', {
                    timeZone: zone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hourCycle: 'h23',
                }),
            );
        } catch {
            ZONE_FORMATS.set(zone, null);
        }
    }
    return ZONE_FORMATS.get(zone) ?? null;
}

/**
 * The IANA zone a timer is given in: `attribute` (`data-kp-countdown-timezone`, `data-kp-timer-disc-timezone`) on it or an
 * ancestor; null (the device) when none or unknown.
 * @param {Element} el @param {string} attribute
 */
export function timerZone(el, attribute) {
    const name = el.closest(`[${attribute}]`)?.getAttribute(attribute)?.trim() ?? '';
    return name !== '' && zoneFormat(name) !== null ? name : null;
}

/**
 * The wall-clock parts of `ms` in a zone.
 * @param {number} ms @param {import('./constants.js').UntilZone} zone
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }}
 */
export function wallParts(ms, zone) {
    if (typeof zone === 'string') {
        const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
        for (const part of zoneFormat(zone)?.formatToParts(ms) ?? []) if (part.type in out) out[/** @type {keyof typeof out} */ (part.type)] = Number(part.value);
        out.hour %= 24;
        return out;
    }
    const at = typeof zone === 'number' ? new Date(ms + zone * MINUTE_MS) : new Date(ms);
    return typeof zone === 'number'
        ? { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate(), hour: at.getUTCHours(), minute: at.getUTCMinutes(), second: at.getUTCSeconds() }
        : { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(), hour: at.getHours(), minute: at.getMinutes(), second: at.getSeconds() };
}

/**
 * The moment a wall-clock time names in a zone (the earlier one when the clock runs it twice; the next valid one when the
 * clock skips it).
 * @param {number} year @param {number} month @param {number} day @param {number} hour @param {number} minute @param {number} second
 * @param {import('./constants.js').UntilZone} zone
 */
export function zonedMoment(year, month, day, hour, minute, second, zone) {
    if (zone === null) return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
    const wall = Date.UTC(year, month - 1, day, hour, minute, second);
    if (typeof zone === 'number') return wall - zone * MINUTE_MS;
    const offsetAt = (/** @type {number} */ t) => {
        const w = wallParts(t, zone);
        return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(t / SECOND_MS) * SECOND_MS;
    };
    const first = wall - offsetAt(wall);
    return wall - offsetAt(first);
}

/** The fixed offset, in minutes, a date and time string carries ("Z", "+02:00"); null when it carries none. @param {string} text */
export function untilOffset(text) {
    const t = text.trim();
    if (/^\d{1,2}:\d{2}/.test(t) || !/^\d{4}-\d{2}-\d{2}[T ]/.test(t)) return null;
    if (/[zZ]$/.test(t)) return 0;
    const m = /([+-])(\d{2}):?(\d{2})$/.exec(t.slice(10));
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}

/**
 * The zone an `until` value is given in: the offset it carries, else the timer's zone, else the device.
 * @param {string | number | null | undefined} value @param {string | null} [timeZone]
 * @returns {import('./constants.js').UntilZone}
 */
export function untilZone(value, timeZone = null) {
    const offset = typeof value === 'string' ? untilOffset(value) : null;
    return offset ?? timeZone;
}
