// Pure filtering: filter bounds, matching and the pills that name a filter.
import { formatDate, parseNumber } from '../locale.js';
/** @typedef {import('./events.js').FilterKind} FilterKind */
/** @typedef {import('./events.js').FilterValue} FilterValue */

/** @param {string | undefined | null} attribute */
export const splitList = (attribute) =>
    (attribute ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');
/**
 * Whether a filter holds anything; an empty one filters nothing.
 * @param {FilterKind} kind
 * @param {FilterValue | undefined} value
 */
export function filterActive(kind, value) {
    if (value === undefined) return false;
    if (kind === 'choice') return Array.isArray(value) && value.length > 0;
    const range = /** @type {{ from?: string, to?: string }} */ (value);
    return (range.from ?? '') !== '' || (range.to ?? '') !== '';
}
/**
 * A filter bound as the reader writes it [b3b4-1019; homelab gap 33]. A date bound is held as ISO (`2026-10-03`) so the
 * filter compares it exactly, but a pill, an error and a screen reader say it the way the two date pickers beside it write
 * it (their `data-kp-date-format`, `rule52` by default: dd/mm/yyyy whatever the locale; Kenny, 2026-10-19, "Zelfde notatie"). A number bound, or text that is not an ISO day, is returned as it is.
 *
 * @param {FilterKind} kind
 * @param {string} bound
 * @param {string | undefined} [locale]  none: the page's own
 */
export function boundText(kind, bound, locale) {
    const day = kind === 'date' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(bound) : null;
    if (day === null) return bound;
    const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    return date.getMonth() === Number(day[2]) - 1 ? formatDate(date, locale, 'rule52') : bound;
}
/**
 * The one pill a filter shows in the add-filter mode [Kenny, 2026-09-14]:
 * the column and every value the filter holds, or null when it holds
 * nothing. Both channels call this, so their pills read the same.
 *
 * @param {FilterKind} kind
 * @param {string} column the column's name
 * @param {FilterValue | undefined} value
 * @param {import('../strings.js').Strings} s
 * @param {string} [locale]  how a date bound is written; the page's own when absent
 * @returns {string | null}
 */
export function filterPillLabel(kind, column, value, s, locale) {
    if (!filterActive(kind, value)) return null;
    if (kind === 'choice') return s.tableFilterChoicePill(column, /** @type {string[]} */ (value));
    const { from = '', to = '' } = /** @type {{ from?: string, to?: string }} */ (value);
    return s.tableFilterSpanPill(column, boundText(kind, from, locale), boundText(kind, to, locale), kind);
}
/**
 * Read the two bounds of an add-filter editor into a filter value, or say
 * what is wrong with them [Kenny, 2026-09-14, #filter-add]: a number bound
 * that is not a number, a date the picker cannot read, a range that runs
 * backwards. A value of null with no error means both bounds are empty, and
 * applying that removes the filter. Both channels call this.
 *
 * @param {'range' | 'date'} kind
 * @param {Record<'from' | 'to', { text: string, iso?: string, label: string }>} bounds  `text` as the field shows it; `iso` a date picker's value
 * @param {import('../strings.js').Strings} s
 * @param {string} [locale]  how a date bound is written in the refusal; the page's own when absent
 * @returns {{ value: { from: string, to: string } | null, error?: string, bound?: 'from' | 'to' }}
 */
export function readFilterBounds(kind, bounds, s, locale) {
    const value = { from: '', to: '' };
    for (const bound of /** @type {const} */ (['from', 'to'])) {
        const { text, iso, label } = bounds[bound];
        const typed = text.trim();
        if (typed === '') continue;
        if (kind === 'range') {
            if (!Number.isFinite(Number(typed))) return { value: null, error: s.tableFilterNotNumber(label, typed), bound };
            value[bound] = typed;
        } else {
            if (iso === undefined || iso === '') return { value: null, error: s.tableFilterNotDate(label, typed), bound };
            value[bound] = iso;
        }
    }
    const { from, to } = value;
    if (from !== '' && to !== '' && (kind === 'range' ? Number(from) > Number(to) : from > to))
        return { value: null, error: s.tableFilterBackwards(boundText(kind, from, locale), boundText(kind, to, locale)), bound: 'from' };
    return { value: from === '' && to === '' ? null : value };
}
/**
 * Whether a cell's text passes a column's filter [gap-13].
 *
 * A range reads the cell in the page's locale, the way the sort does; a
 * date reads it as the date the cell writes, and the upper bound takes
 * the whole of its day, so "to 12 August" includes 12 August.
 *
 * @param {FilterKind} kind
 * @param {FilterValue | undefined} value
 * @param {string} text the cell's text
 * @param {string} locale
 */
export function matchesFilter(kind, value, text, locale) {
    if (!filterActive(kind, value)) return true;
    if (kind === 'choice') return /** @type {string[]} */ (value).includes(text.trim());
    const { from = '', to = '' } = /** @type {{ from?: string, to?: string }} */ (value);
    if (kind === 'range') {
        const n = parseNumber(text, locale);
        if (Number.isNaN(n)) return false;
        if (from !== '' && n < Number(from)) return false;
        if (to !== '' && n > Number(to)) return false;
        return true;
    }
    const at = Date.parse(text.trim());
    if (Number.isNaN(at)) return false;
    if (from !== '' && at < Date.parse(from)) return false;
    if (to !== '' && at > Date.parse(to) + (/^\d{4}-\d{2}-\d{2}$/.test(to) ? 86_399_999 : 0)) return false;
    return true;
}
/**
 * The pills an active filter shows, each with the value that removes it.
 *
 * @param {FilterKind} kind
 * @param {string} column the column's name
 * @param {FilterValue | undefined} value
 * @param {import('../strings.js').Strings} s
 * @param {string} [locale]  how a date bound is written; the page's own when absent
 * @returns {{ label: string, without: FilterValue | undefined }[]}
 */
export function filterPills(kind, column, value, s, locale) {
    if (!filterActive(kind, value)) return [];
    if (kind === 'choice') {
        const list = /** @type {string[]} */ (value);
        return list.map((item) => ({ label: s.tableFilterValue(column, item), without: list.filter((other) => other !== item) }));
    }
    const { from = '', to = '' } = /** @type {{ from?: string, to?: string }} */ (value);
    return [
        {
            label: s.tableFilterRange(
                column,
                from === '' ? s.tableFilterOpenEnd : boundText(kind, from, locale),
                to === '' ? s.tableFilterOpenEnd : boundText(kind, to, locale),
            ),
            without: undefined,
        },
    ];
}
/**
 * Whether an element takes part in layout: not hidden by the attribute and
 * not by a stylesheet (the card layout hides the header row, a narrow
 * table hides `.kp-col-low`).
 *
 * @param {Element} element
 */
export const shown = (element) => !(/** @type {HTMLElement} */ (element).hidden) && getComputedStyle(element).display !== 'none';
