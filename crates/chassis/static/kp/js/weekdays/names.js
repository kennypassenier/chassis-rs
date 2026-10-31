// Day names: a day read from a number or a name, and the weekday names of a style in the reader's language.

import { getStrings } from '../strings.js';
import { resolveLocale } from '../locale.js';
import { NAMES, WEEK } from './values.js';

/** The reader's week starts here in the dictionary: its names are Monday first. */
const DICTIONARY_ORDER = [6, 0, 1, 2, 3, 4, 5];
/** A Sunday in January 2001, the day the names are formatted from. */
const SUNDAY = 7;

/**
 * A day as a number 0 to 6 (0 is Sunday): a number, a digit string, or a name ("mon", "Tuesday").
 * @param {unknown} value
 * @returns {number | null}
 */
export function dayNumber(value) {
    if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
    const text = String(value ?? '')
        .trim()
        .toLowerCase();
    if (/^[0-6]$/.test(text)) return Number(text);
    const at = NAMES.indexOf(text.slice(0, 3));
    return at >= 0 && /^[a-z]+$/.test(text) ? at : null;
}

/**
 * The weekday names of a style, Sunday first (the way `Date#getDay` counts). English reads the dictionary,
 * which a consumer may replace; another language reads Intl, unless the consumer replaced the dictionary.
 * @param {'short' | 'narrow' | 'long'} style
 * @param {string} [locale]
 * @returns {string[]}
 */
export function dayNames(style, locale) {
    const s = getStrings();
    const own = style === 'short' ? s.weekdaysShort : style === 'narrow' ? s.weekdaysNarrow : s.weekdaysLong;
    const sundayFirst = DICTIONARY_ORDER.map((i) => own[i] ?? '');
    try {
        const resolved = resolveLocale(locale);
        if (new Intl.Locale(resolved).language === 'en') return sundayFirst;
        const format = new Intl.DateTimeFormat(resolved, { weekday: style });
        return Array.from({ length: WEEK }, (_, i) => format.format(new Date(2001, 0, SUNDAY + i)));
    } catch {
        return sundayFirst;
    }
}
