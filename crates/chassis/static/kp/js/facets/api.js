// What a page calls on a facet group: the values that are on, the counts and the rows. None of it needs the group to be attached.

import { countText, buildRow, checkOf, ensureAll, listOf, paintRow, rowsOf, syncGroup } from './rows.js';

/**
 * The values that are on.
 * @param {Element} group
 * @returns {string[]}
 */
export function getFacetValues(group) {
    return rowsOf(group)
        .filter((row) => checkOf(row)?.checked)
        .map((row) => row.getAttribute('data-value') ?? '');
}

/**
 * Turn exactly these values on (every other off); `null` turns all on. The
 * event is not fired: the page that calls this knows.
 *
 * @param {Element} group
 * @param {string[] | null} values
 */
export function setFacetValues(group, values) {
    for (const row of rowsOf(group)) {
        const check = checkOf(row);
        if (check) check.checked = values === null || values.includes(row.getAttribute('data-value') ?? '');
    }
    syncGroup(group);
}

/**
 * Write the counts. `counts` maps a value to its count; a value not in it
 * keeps its count. `all` is the "Everything" row's (the sum of the numbers
 * when absent). The group stops being busy.
 *
 * @param {Element} group
 * @param {Record<string, number | string | null>} counts
 * @param {{ all?: number | string | null }} [options]
 */
export function setFacetCounts(group, counts, { all } = {}) {
    let sum = 0;
    for (const row of rowsOf(group)) {
        const value = row.getAttribute('data-value') ?? '';
        if (Object.hasOwn(counts, value)) row.querySelector('.kp-facet__count')?.replaceChildren(String(countText(counts[value])));
        const shown = Number(row.querySelector('.kp-facet__count')?.textContent?.replace(/\D/g, '') || 0);
        sum += shown;
    }
    const total = group.querySelector('.kp-facet[data-kp-facet-all] .kp-facet__count');
    if (total) total.textContent = String(countText(all === undefined ? sum : all));
    group.removeAttribute('aria-busy');
}

/**
 * Make the rows these items, in this order, changing what is there in place.
 *
 * @param {Element} group
 * @param {import('../facets.js').FacetItem[]} items
 */
export function setFacetItems(group, items) {
    const list = listOf(group);
    ensureAll(group);
    const existing = new Map(rowsOf(group).map((row) => [row.getAttribute('data-value') ?? '', row]));
    /** @type {HTMLElement | null} the row the next one goes after */
    let previous = /** @type {HTMLElement | null} */ (group.querySelector('.kp-facet[data-kp-facet-all]'));
    for (const item of items) {
        let row = existing.get(item.value);
        if (row) {
            paintRow(row, item);
            existing.delete(item.value);
        } else row = buildRow(item);
        const expected = previous ? previous.nextElementSibling : list.firstElementChild;
        // Insert only when the row is not already where it belongs: a row that stays keeps its focus.
        if (row !== expected) previous ? previous.after(row) : list.prepend(row);
        previous = row;
    }
    for (const gone of existing.values()) gone.remove();
    if (!items.some((item) => item.count !== undefined)) group.removeAttribute('aria-busy');
    syncGroup(group);
}
