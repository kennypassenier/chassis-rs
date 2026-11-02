// The month and weekday names a calendar shows, in the locale it is drawn for [gap-11].

import { resolveLocale } from './resolve.js';
import { getLanguageDictionary } from '../strings/runtime.js';

/** @typedef {{ months: string[], weekdays: string[], monthsShort?: string[] }} NameSet */

/** @param {string[]} a @param {string[]} b */
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The index of Monday..Saturday, Sunday in a Monday-first list, for a Sunday-first reading. */
const SUNDAY_FIRST = [6, 0, 1, 2, 3, 4, 5];
/** The year Intl is asked about: 7 January 2001 was a Sunday, so day i of that week is getDay() === i. */
const PROBE_YEAR = 2001;
const SUNDAY_PROBE = 7;
const MONTHS_IN_YEAR = 12;
const DAYS_IN_WEEK = 7;

/** Whether the locale is English, where the dictionary already is the answer; an unknown tag keeps the dictionary. @param {string} resolved */
function isEnglish(resolved) {
    try {
        return new Intl.Locale(resolved).language === 'en';
    } catch {
        // An unknown tag: keep the dictionary.
        return true;
    }
}

/**
 * Names from Intl, or null for an English locale or an engine that cannot.
 * @param {string} resolved @param {boolean} english @param {Intl.DateTimeFormatOptions} options @param {(i: number) => Date} date @param {number} count
 * @returns {string[] | null}
 */
function fromIntl(resolved, english, options, date, count) {
    if (english) return null;
    try {
        const format = new Intl.DateTimeFormat(resolved, options);
        return Array.from({ length: count }, (_, i) => format.format(date(i)));
    } catch {
        return null;
    }
}

/**
 * The month and weekday names a calendar shows, in the locale it is drawn
 * for [gap-11].
 *
 * The date picker wrote a Dutch date under an English month, because its
 * names came from the string dictionary and the dictionary is English.
 * Intl knows the names in every language the browser does, so a locale
 * that is not English reads them from Intl. The dictionary still decides
 * in two cases: when a consumer has set names of their own (their words
 * win, which is the way out [KT6]), and when the locale is English, where
 * the dictionary already is the answer — and where Intl's "Mon" would
 * quietly change the two-letter "Mo" every English page shows.
 *
 * The short month names fill the month grid [scope-89], where twelve full
 * names in three columns ran out of their cells in eleven themes
 * ("September", 83px of text in a 75px cell). They follow the same rule, and
 * a consumer who set full names of their own but no short ones sees their
 * full names there rather than the package's English abbreviations.
 *
 * @param {NameSet} dictionary the strings in force; weekdays Monday first
 * @param {NameSet} defaults the package's own dictionary, to tell a consumer's names from it
 * A page in Dutch makes the dictionary Dutch without a consumer saying so
 * [habits-1101]; names that are the language dictionary's own are not a
 * consumer's words, so an English picker on that page still reads English.
 *
 * @param {string | undefined} [locale]
 * @param {Partial<NameSet>} [language] the dictionary of the page's language, to tell it from a consumer's names
 * @returns {{ months: string[], monthsShort: string[], weekdays: string[] }} weekdays Sunday first, the way Date#getDay counts
 */
export function calendarNames(dictionary, defaults, locale, language = getLanguageDictionary()) {
    const resolved = resolveLocale(locale);
    const english = isEnglish(resolved);
    const intl = (/** @type {Intl.DateTimeFormatOptions} */ options, /** @type {(i: number) => Date} */ date, /** @type {number} */ count) =>
        fromIntl(resolved, english, options, date, count);
    /** Whether the names are the package's or the page language's own, not a consumer's. @param {string[]} names @param {string[]} base @param {string[] | undefined} lang */
    const isStock = (names, base, lang) => same(names, base) || (lang !== undefined && same(names, lang));
    const stockMonths = isStock(dictionary.months, defaults.months, language.months);
    // An English locale under a page whose dictionary is not English reads the package's English, not that dictionary.
    const pick = (/** @type {'months' | 'weekdays'} */ key, stock = isStock(dictionary[key], defaults[key], language[key])) =>
        english && stock ? defaults[key] : dictionary[key];
    const months = (stockMonths ? intl({ month: 'long' }, (i) => new Date(PROBE_YEAR, i, 1), MONTHS_IN_YEAR) : null) ?? pick('months');
    // Short names a consumer set win; full names they set, with no short ones, come next; then Intl's, then the dictionary's.
    const shortDefaults = defaults.monthsShort;
    const stockShort = shortDefaults !== undefined && isStock(dictionary.monthsShort ?? shortDefaults, shortDefaults, language.monthsShort);
    const monthsShort = !stockShort
        ? (dictionary.monthsShort ?? months)
        : !stockMonths
          ? dictionary.months
          : (intl({ month: 'short' }, (i) => new Date(PROBE_YEAR, i, 1), MONTHS_IN_YEAR) ?? shortDefaults ?? months);
    const stockWeekdays = isStock(dictionary.weekdays, defaults.weekdays, language.weekdays);
    const sundayFirst = SUNDAY_FIRST.map((i) => pick('weekdays', stockWeekdays)[i] ?? '');
    const weekdays = (stockWeekdays ? intl({ weekday: 'short' }, (i) => new Date(PROBE_YEAR, 0, SUNDAY_PROBE + i), DAYS_IN_WEEK) : null) ?? sundayFirst;
    return { months, monthsShort, weekdays };
}
