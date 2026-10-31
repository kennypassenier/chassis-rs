// Pure sorting: the comparison, the order and the next sort of a column.
import { collator, parseNumber } from '../locale.js';

/** @typedef {(a: string, b: string, kind: string, locale: string) => number} Compare */
/** @typedef {(row: HTMLTableRowElement, query: string) => boolean} Filter */

/**
 * Compare two cells the way their column asks to be compared.
 *
 * A number column sorted as text puts 100 before 20, which is the single
 * most common data-table bug and the reason the column declares its type
 * rather than the code guessing from the first row. Numbers and text are
 * read in the locale: "1.284,50" is a number in Dutch and "1,284.50" in
 * English, and both sort correctly on their own page.
 *
 * @type {Compare}
 */
export function compare(a, b, kind, locale) {
    if (kind === 'number') {
        const left = parseNumber(a, locale);
        const right = parseNumber(b, locale);
        if (Number.isNaN(left) || Number.isNaN(right)) return collator(locale).compare(a, b);
        return left - right;
    }
    if (kind === 'date') {
        const left = Date.parse(a);
        const right = Date.parse(b);
        if (Number.isNaN(left) || Number.isNaN(right)) return collator(locale).compare(a, b);
        return left - right;
    }
    // A collator, not <: "Zoetermeer" before "école" is wrong in every
    // language a consumer's labels are written in.
    return collator(locale).compare(a, b);
}
/**
 * Compare two cells by a declared order, "Low,Medium,High,Critical" [gap-13].
 *
 * Severity sorted as text reads Critical, High, Low, Medium: alphabetical
 * and meaningless. A value the order does not name sorts after every value
 * it does, by the column's own comparison, so a stray "Unknown" neither
 * disappears nor jumps to the top.
 *
 * @param {readonly string[]} order
 * @param {string} a
 * @param {string} b
 * @param {(a: string, b: string) => number} fallback
 */
export function compareByOrder(order, a, b, fallback) {
    const rank = (/** @type {string} */ value) => {
        const at = order.findIndex((entry) => entry.trim().toLowerCase() === value.trim().toLowerCase());
        return at === -1 ? order.length : at;
    };
    return rank(a) - rank(b) || fallback(a, b);
}
/**
 * The next sort keys after a header press [Kenny, 2026-09-13, #multi-sort].
 *
 * A plain press sorts on that column alone, ascending, then descending, then (cycle
 * 'three', the default since wish-1120 / homelab 93) off again: the rows go back to their own
 * order and the header says aria-sort none. Cycle 'two' keeps turning between the two
 * directions and never leaves the sort. With `add` (Shift) the column joins the keys as the
 * last one, turns round when it is a key already, and leaves the keys on
 * its third press. Both channels call this, so they cannot disagree on
 * what a press does.
 *
 * @template K
 * @param {{ column: K, direction: 'ascending' | 'descending' }[]} keys
 * @param {K} column
 * @param {{ add?: boolean, cycle?: 'two' | 'three' }} [options]
 * @returns {{ column: K, direction: 'ascending' | 'descending' }[]}
 */
export function nextSorts(keys, column, { add = false, cycle = 'three' } = {}) {
    const current = keys.find((key) => key.column === column);
    if (add) {
        if (current === undefined) return [...keys, { column, direction: 'ascending' }];
        if (current.direction === 'ascending') return keys.map((key) => (key.column === column ? { column, direction: 'descending' } : key));
        return keys.filter((key) => key.column !== column);
    }
    if (current !== undefined && keys.length === 1) {
        if (current.direction === 'ascending') return [{ column, direction: 'descending' }];
        return cycle === 'three' ? [] : [{ column, direction: 'ascending' }];
    }
    return [{ column, direction: 'ascending' }];
}
