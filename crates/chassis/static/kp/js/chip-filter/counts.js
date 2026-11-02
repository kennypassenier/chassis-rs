// Pure: the values a data table's column holds, and how many rows hold each [forms-1102].

/**
 * How many rows hold each value, in the order the values first appear.
 * @param {readonly string[]} values one per row
 * @returns {Map<string, number>}
 */
export function countValues(values) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
}

/**
 * The chips a column asks for: the header's own list when it gives one, else every value it holds in the reader's order.
 * @param {Map<string, number>} counts
 * @param {readonly string[] | null} declared the header's `data-kp-filter-options`
 * @param {string} [locale]
 * @returns {string[]}
 */
export function chipValues(counts, declared, locale) {
    if (declared && declared.length > 0) return [...declared];
    return [...counts.keys()].filter((v) => v !== '').sort((a, b) => a.localeCompare(b, locale, { numeric: true, sensitivity: 'base' }));
}

/**
 * The counts every chip shows: each value's rows, 0 for a value no row holds, and the total under the All item's value.
 * @param {Map<string, number>} counts @param {readonly string[]} values @param {string} allValue
 * @returns {Record<string, number>}
 */
export function chipCounts(counts, values, allValue) {
    /** @type {Record<string, number>} */
    const out = {};
    let total = 0;
    for (const n of counts.values()) total += n;
    for (const value of values) out[value] = counts.get(value) ?? 0;
    out[allValue] = total;
    return out;
}
