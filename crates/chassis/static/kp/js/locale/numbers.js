// Numbers as the locale writes them: a byte count printed, and a typed number read back.

import { resolveLocale } from './resolve.js';

/** The units of a byte count, base 1000 with SI prefixes. */
const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];
/** Spaces a typed number may hold besides the group glyph: no-break space and narrow no-break space (U+00A0, U+202F). */
const NUMBER_SPACES = '  ';

/**
 * A byte count as the locale writes numbers: "1,5 MB" in Dutch, "1.5 MB"
 * in English. Base 1000 with SI units, because a person reading a file
 * size is not counting sectors.
 *
 * @param {number} bytes
 * @param {string | undefined} [locale]
 * @param {{ base?: 1000 | 1024, units?: string[] }} [options]
 * @returns {string}
 */
export function formatBytes(bytes, locale, { base = 1000, units = BYTE_UNITS } = {}) {
    let value = bytes;
    let unit = 0;
    while (value >= base && unit < units.length - 1) {
        value /= base;
        unit += 1;
    }
    const digits = unit === 0 ? 0 : 1;
    return `${new Intl.NumberFormat(resolveLocale(locale), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)} ${units[unit]}`;
}

/** @param {string} s */
function escape(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Read a number the way the locale writes it: "1.284,50" in Dutch,
 * "1,284.50" in English. Intl tells us which glyph is the decimal.
 *
 * @param {string} text
 * @param {string | undefined} [locale]
 * @returns {number}
 */
export function parseNumber(text, locale) {
    const parts = new Intl.NumberFormat(resolveLocale(locale)).formatToParts(1234.5);
    const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
    const group = parts.find((p) => p.type === 'group')?.value ?? ',';
    const cleaned = text
        .replace(new RegExp(`[${escape(group)}\\s${NUMBER_SPACES}]`, 'g'), '')
        .replace(decimal, '.')
        .replace(/[^\d.+-]/g, '');
    return Number.parseFloat(cleaned);
}
