// Dates as the locale writes them: the order and separator, the text of a date, and a typed date read back.

import { resolveLocale } from './resolve.js';

/** @typedef {import('../locale.js').DateFormat} DateFormat */

/** A day Intl is asked to format to learn the order of day, month and year (25 December 2001: no two parts alike). */
const PROBE_DATE = new Date(2001, 11, 25);
/** A two-digit year is read as this century. */
const CENTURY = 2000;
/** The numeric date every locale function writes. @type {Intl.DateTimeFormatOptions} */
const NUMERIC_DATE = { year: 'numeric', month: '2-digit', day: '2-digit' };

/**
 * The order and separator a locale writes a numeric date in, read from
 * Intl once rather than assumed. `parts` is e.g. ['day','month','year'].
 * `format` is `'locale'` (what Intl says; the default of this function) or
 * `'rule52'` (dd/mm/yyyy whatever the locale, Kenny's rule 52).
 *
 * @param {string | undefined} [locale]
 * @param {DateFormat} [format]
 * @returns {{ parts: ('day' | 'month' | 'year')[], separator: string, hint: string }}
 */
export function datePattern(locale, format = 'locale') {
    if (format === 'rule52') return { parts: ['day', 'month', 'year'], separator: '/', hint: 'dd/mm/yyyy' };
    const formatter = new Intl.DateTimeFormat(resolveLocale(locale), NUMERIC_DATE);
    /** @type {('day' | 'month' | 'year')[]} */
    const parts = [];
    let separator = '-';
    for (const part of formatter.formatToParts(PROBE_DATE)) {
        if (part.type === 'day' || part.type === 'month' || part.type === 'year') parts.push(part.type);
        else if (part.type === 'literal' && separator === '-' && part.value.trim() !== '') separator = part.value.trim();
    }
    if (parts.length !== 3) return { parts: ['day', 'month', 'year'], separator: '-', hint: 'dd-mm-yyyy' };
    const hint = parts.map((p) => (p === 'day' ? 'dd' : p === 'month' ? 'mm' : 'yyyy')).join(separator);
    return { parts, separator, hint };
}

/**
 * A date as the locale writes it: numeric, two-digit day and month; with
 * `format` `'rule52'`, dd/mm/yyyy in Latin digits whatever the locale.
 *
 * @param {Date} date
 * @param {string | undefined} [locale]
 * @param {DateFormat} [format]
 * @returns {string}
 */
export function formatDate(date, locale, format = 'locale') {
    if (format === 'rule52') {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${String(date.getFullYear()).padStart(4, '0')}`;
    }
    return new Intl.DateTimeFormat(resolveLocale(locale), NUMERIC_DATE).format(date);
}

/** A date from its parts, or null when the parts are not a real day: no rounding to the next month. @param {number} y @param {number} m @param {number} d */
const exact = (y, m, d) => {
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
};

/**
 * Read what a person typed, in their locale's order — plus ISO, which
 * everyone accepts. Returns null for anything that is not a real date:
 * "31-02-2026" is refused rather than rounded to 3 March.
 *
 * @param {string} text
 * @param {string | undefined} [locale]
 * @param {DateFormat} [format]
 * @returns {Date | null}
 */
export function parseDate(text, locale, format = 'locale') {
    const trimmed = text.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso) return exact(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const loose = /^(\d{1,4})[-/. ](\d{1,2})[-/. ](\d{1,4})$/.exec(trimmed);
    if (!loose) return null;
    const { parts } = datePattern(locale, format);
    const numbers = [Number(loose[1]), Number(loose[2]), Number(loose[3])];
    /** @type {Record<string, number>} */
    const by = {};
    parts.forEach((part, i) => {
        by[part] = numbers[i] ?? Number.NaN;
    });
    let year = by.year ?? Number.NaN;
    if (year < 100) year += CENTURY;
    return exact(year, by.month ?? Number.NaN, by.day ?? Number.NaN);
}
