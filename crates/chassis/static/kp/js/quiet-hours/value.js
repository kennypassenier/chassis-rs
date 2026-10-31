// Pure: a value read from whatever the page wrote, and the value in words.

import { getStrings } from '../strings.js';
import { timeMinutes } from '../timefield.js';
import { dayNames, joinWords, weekdaySummary } from '../weekdays.js';
import { DEFAULT, QUIET_SEVERITIES } from './values.js';

/** The last day number, Saturday. */
const LAST_DAY = 6;

/**
 * A value read from whatever the page wrote, with the defaults for what is missing. Pure.
 * @param {unknown} raw an object, or its JSON text
 * @returns {import('./values.js').QuietValue}
 */
export function readQuiet(raw) {
    /** @type {Record<string, unknown>} */
    let data = {};
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object') data = /** @type {Record<string, unknown>} */ (parsed);
    } catch {
        data = {};
    }
    const time = (/** @type {unknown} */ t, /** @type {string} */ fallback) => (typeof t === 'string' && Number.isFinite(timeMinutes(t)) ? t : fallback);
    const days = Array.isArray(data.days) ? [...new Set(data.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= LAST_DAY))].sort() : DEFAULT.days;
    const through = Array.isArray(data.through) ? [...new Set(data.through.map(String))] : DEFAULT.through;
    return { on: data.on === true, from: time(data.from, DEFAULT.from), to: time(data.to, DEFAULT.to), days, through };
}

/** @param {string} key */
export function severityWord(key) {
    const s = getStrings();
    return /** @type {Record<string, string>} */ ({ critical: s.quietCritical, warning: s.quietWarning, info: s.quietInfo, ok: s.quietOk })[key] ?? key;
}

/**
 * The value in words: "Quiet from 22:00 to 07:00: Every weekday. Critical still comes through." Pure.
 * @param {import('./values.js').QuietValue} value
 * @param {{ severities?: readonly { key: string, label: string }[], firstDay?: number }} [options]
 * @returns {string}
 */
export function quietSummary(value, { severities, firstDay = 1 } = {}) {
    const s = getStrings();
    if (!value.on) return s.quietOff;
    if (value.from === value.to) return s.quietSame;
    const days = weekdaySummary(value.days, { firstDay, names: dayNames('short') });
    const known = severities ?? QUIET_SEVERITIES.map((key) => ({ key, label: severityWord(key) }));
    const names = known.filter((k) => value.through.includes(k.key)).map((k) => k.label);
    const head = s.quietWhen(value.from, value.to, days);
    return names.length ? `${head} ${s.quietThrough(joinWords(names), names.length)}` : `${head} ${s.quietNothing}`;
}
