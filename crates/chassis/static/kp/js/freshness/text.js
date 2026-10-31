// Pure: a span of seconds in words, a line's words, a moment as a person reads it, and the moment an element carries.

import { getStrings } from '../strings.js';
import { FRESHNESS_TIME_ZONE, MS_PER_SECOND, SECONDS } from './values.js';

/** @typedef {import('../freshness.js').Strings} Strings */

/**
 * A span of seconds in the units a person reads best: seconds under a
 * minute, minutes and seconds under an hour, hours and minutes under a day,
 * days and hours beyond; a zero second part is left out ("2 min"). With
 * `units: 'days'` a span of a day or more is whole days only ("97 days").
 * @param {number} seconds
 * @param {Strings} [strings]
 * @param {'days' | undefined} [units]
 * @returns {string}
 */
export function humanDuration(seconds, strings = getStrings(), units = undefined) {
    const d = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
    /** @param {string} big @param {number} small @param {(n: number) => string} unit */
    const pair = (big, small, unit) => (small === 0 ? big : `${big} ${unit(small)}`);
    if (d < SECONDS.minute) return strings.agoSeconds(d);
    if (d < SECONDS.hour) return pair(strings.agoMinutes(Math.floor(d / SECONDS.minute)), d % SECONDS.minute, strings.agoSeconds);
    if (d < SECONDS.day)
        return pair(strings.agoHours(Math.floor(d / SECONDS.hour)), Math.floor((d % SECONDS.hour) / SECONDS.minute), strings.agoMinutes);
    if (units === 'days') return strings.agoDays(Math.floor(d / SECONDS.day));
    return pair(strings.agoDays(Math.floor(d / SECONDS.day)), Math.floor((d % SECONDS.day) / SECONDS.hour), strings.agoHours);
}

/** The units option of a line: `days`, or none. @param {Element} el @returns {'days' | undefined} */
export const unitsOf = (el) => (el.getAttribute('data-kp-ago-units') === 'days' ? 'days' : undefined);

/**
 * The line's words: "updated 12 s ago", or "not updated yet" with no moment.
 * A moment after `nowMs` reads 0 s.
 * @param {string} verb
 * @param {number | null | undefined} atMs
 * @param {number} nowMs
 * @param {Strings} [strings]
 * @param {'days' | undefined} [units] `days`: a day or more reads as whole days
 * @returns {string}
 */
export function agoText(verb, atMs, nowMs, strings = getStrings(), units = undefined) {
    if (atMs == null || !Number.isFinite(atMs)) return strings.agoNever(verb);
    return strings.agoText(verb, humanDuration(Math.max(0, Math.floor((nowMs - atMs) / MS_PER_SECOND)), strings, units));
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const FORMATS = new Map();

/**
 * A moment as a person reads it (rule 52): `dd/mm/yyyy HH:mm`, 24-hour, in
 * `timeZone`. The parts are read one by one, so no locale reorders or names
 * them.
 * @param {number} ms
 * @param {string} [timeZone]
 * @returns {string}
 */
export function agoMoment(ms, timeZone = FRESHNESS_TIME_ZONE) {
    let format = FORMATS.get(timeZone);
    if (!format) {
        format = new Intl.DateTimeFormat('en-GB', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        FORMATS.set(timeZone, format);
    }
    /** @type {Record<string, string>} */
    const p = {};
    for (const part of format.formatToParts(ms)) p[part.type] = part.value;
    const hour = String(Number(p.hour) % 24).padStart(2, '0');
    return `${p.day}/${p.month}/${p.year} ${hour}:${p.minute}`;
}

/**
 * The moment an element carries, in ms, or null: its `datetime`, else the
 * value of `data-kp-ago` (ISO or milliseconds).
 * @param {Element} el
 * @returns {number | null}
 */
export function momentOf(el) {
    const raw = (el.getAttribute('datetime') ?? el.getAttribute('data-kp-ago') ?? '').trim();
    if (raw === '') return null;
    const ms = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
}
