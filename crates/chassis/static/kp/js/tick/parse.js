// Reading the first number out of a text in the page's language, and writing another value back in the same shape.

import { SHOW_TEXT } from './values.js';

/** @typedef {import('../tick.js').TickParse} TickParse */

/** Group and decimal glyphs a locale writes numbers with. @param {string | undefined} locale */
function separators(locale) {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    return {
        group: parts.find((part) => part.type === 'group')?.value ?? '',
        decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    };
}

/** The grouping glyph the text already uses, else the locale's when the text has it, else none. @param {string} whole @param {string} group @param {string} decimal */
function groupMarkOf(whole, group, decimal) {
    const groupInText = whole.match(/\d([\s.,  '])\d{3}(?!\d)/)?.[1];
    return groupInText !== undefined && groupInText !== decimal ? groupInText : group !== '' && whole.includes(group) ? group : '';
}

/**
 * The writer of a value in the shape of the text it was read from.
 * @param {{ before: string, after: string, decimals: number, decimal: string, groupMark: string }} shape
 * @returns {(next: number) => string}
 */
function renderer({ before, after, decimals, decimal, groupMark }) {
    return (next) => {
        const [int, frac] = Math.abs(next).toFixed(decimals).split('.');
        const sign = next < 0 && Number(next.toFixed(decimals)) !== 0 ? '-' : '';
        const body = groupMark ? int.replace(/\B(?=(\d{3})+(?!\d))/g, groupMark) : int;
        return `${before}${sign}${body}${decimals ? decimal + frac : ''}${after}`;
    };
}

/**
 * Read the first number out of `text` in the shape `locale` writes numbers,
 * with a way to write another value back in the same shape (the same text
 * around it, grouping and decimals). Null when the text holds no number.
 * @param {string} text @param {string | undefined} locale
 * @returns {TickParse | null}
 */
export function parseTick(text, locale) {
    const match = /-?\d[\d\s.,  ']*/.exec(text);
    if (match === null) return null;
    const raw = match[0];
    const whole = raw.trimEnd();
    const before = text.slice(0, match.index);
    const after = raw.slice(whole.length) + text.slice(match.index + raw.length);
    const { group, decimal } = separators(locale);
    const cut = whole.lastIndexOf(decimal);
    const decimals = cut < 0 ? 0 : whole.length - cut - 1;
    const digits = (/** @type {string} */ part) => part.replace(/[^\d-]/g, '');
    const value = Number(cut < 0 ? digits(whole) : `${digits(whole.slice(0, cut))}.${digits(whole.slice(cut + 1))}`);
    if (!Number.isFinite(value)) return null;
    const groupMark = groupMarkOf(whole, group, decimal);
    return { value, decimals, render: renderer({ before, after, decimals, decimal, groupMark }) };
}

/** The text node a number lives in: the element's first text node with a digit. @param {Element} el */
export function numberNode(el) {
    const walker = el.ownerDocument.createTreeWalker(el, SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/\d/.test(node.nodeValue ?? '')) return /** @type {Text} */ (node);
    return null;
}

/** @param {Element} el */
export const localeOf = (el) => /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || el.ownerDocument.documentElement.lang || undefined;
