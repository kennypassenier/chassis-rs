// Pure date helpers: ISO and locale text, month clamping, year blocks, range tests and the month and year grid's key moves.

import { formatDate, parseDate as parseLocale } from '../locale.js';
import { JUMP_COLUMNS, JUMP_PAGE, YEARS_PER_BLOCK } from './constants.js';

/** @param {Date} date */
export function toISO(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A date as a locale writes it. `toDutch` remains for the consumers that
 * imported it in 1.x; it is `formatDate(date, 'nl-NL')`.
 *
 * @param {Date} date
 * @param {string} [locale]
 */
export function formatLocalDate(date, locale) {
    return formatDate(date, locale);
}
/** @deprecated since 3.0.0 — `formatLocalDate(date, 'nl-NL')`. @param {Date} date */
export function toDutch(date) {
    return formatDate(date, 'nl-NL');
}

/**
 * Read what someone typed: ISO always, and the locale's own order for
 * the numeric form. "31-02-2026" is refused rather than rounded to 3
 * March, in every locale.
 *
 * @param {string} text
 * @param {string} [locale]
 * @returns {Date | null}
 */
export function parseDate(text, locale) {
    if (text.trim() === '') return null;
    return parseLocale(text, locale);
}

// ── The month and year grids [scope-89] ──────────────────────────────────
//
// The title opens the twelve months of the shown year, and in that view the
// year opens twelve years. Both grids are three cells a row and draw their
// cells with the day's class, so every register that paints a day paints a
// month and a year without knowing they exist. The helpers below are shared
// by both channels: two implementations of "which months does a maximum
// leave" is how the channels come to disagree.

/** The first year of the block of twelve that holds `year`. @param {number} year */
export function yearBlockStart(year) {
    return Math.floor(year / YEARS_PER_BLOCK) * YEARS_PER_BLOCK;
}

/**
 * A day of a month, the day kept where the month has it and the month's last
 * day otherwise: 31 January to February lands on the 28th, not in March.
 *
 * @param {number} year @param {number} month may run past 0-11 @param {number} day
 */
export function clampToMonth(year, month, day) {
    const first = new Date(year, month, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return new Date(first.getFullYear(), first.getMonth(), Math.min(day, last));
}

/**
 * Whether a span of days lies wholly before the minimum or after the maximum:
 * a month or a year that still holds one day to choose stays a way in.
 *
 * @param {Date} from first day @param {Date} to last day @param {Date | null} min @param {Date | null} max
 */
export function outsideRange(from, to, min, max) {
    return (min !== null && to < min) || (max !== null && from > max);
}

/**
 * How far a key moves the focus in a month or year grid, in cells; null for a
 * key the grid does not take. Arrows by a cell and a row, Home and End to the
 * ends of the row, PageUp and PageDown by twelve — the day grid's keys, one
 * size up. A move past the drawn grid crosses into the next year or block.
 *
 * @param {string} key @param {number} index the focused cell, 0-11
 * @returns {number | null}
 */
export function jumpMove(key, index) {
    const column = index % JUMP_COLUMNS;
    /** @type {Record<string, number>} */
    const moves = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: JUMP_COLUMNS,
        ArrowUp: -JUMP_COLUMNS,
        Home: -column,
        End: JUMP_COLUMNS - 1 - column,
        PageDown: JUMP_PAGE,
        PageUp: -JUMP_PAGE,
    };
    return moves[key] ?? null;
}
