// The rows of a facet group: finding them, wiring each row's names and descriptions, building and painting a row, the "Everything" row, and bringing the group in step.

import { getStrings } from '../strings.js';
import { drawPattern } from './pattern.js';

/** @typedef {import('../facets.js').FacetItem} FacetItem */

/** Numbers the rows of a page, for the ids that name and describe their checkbox. */
let serial = 0;

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'span') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {number | string | null | undefined} count */
export const countText = (count) => (typeof count === 'number' ? count.toLocaleString() : (count ?? ''));

/** @param {Element} group @returns {HTMLElement[]} the value rows, in order */
export const rowsOf = (group) => /** @type {HTMLElement[]} */ ([...group.querySelectorAll('.kp-facet:not([data-kp-facet-all])')]);

/** @param {Element} row @returns {HTMLInputElement | null} */
export const checkOf = (row) => row.querySelector('.kp-facet__check');

/** @param {Element} group @returns {HTMLElement} */
export function listOf(group) {
    let list = /** @type {HTMLElement | null} */ (group.querySelector('.kp-facets__list'));
    if (!list) {
        list = el('kp-facets__list', 'ul');
        group.append(list);
    }
    return list;
}

/** @param {Element} row */
export const nameOf = (row) => row.querySelector('.kp-facet__name')?.textContent?.trim() ?? '';

/**
 * Give a row its ids, its checkbox's name and description, and its "only"
 * button's name. Safe to run again.
 * @param {HTMLElement} row
 */
export function wireRow(row) {
    const check = checkOf(row);
    const swatch = /** @type {HTMLElement | null} */ (row.querySelector('.kp-facet__swatch[data-kp-facet-pattern]'));
    if (swatch) drawPattern(swatch, swatch.getAttribute('data-kp-facet-pattern'));
    const name = row.querySelector('.kp-facet__name');
    const count = row.querySelector('.kp-facet__count');
    serial += 1;
    if (name && !name.id) name.id = `kp-facet-${serial}-name`;
    if (count && !count.id) count.id = `kp-facet-${serial}-count`;
    if (check) {
        if (name) check.setAttribute('aria-labelledby', name.id);
        if (count) check.setAttribute('aria-describedby', count.id);
    }
    const only = row.querySelector('.kp-facet__only');
    if (only && !row.hasAttribute('data-kp-facet-all')) {
        only.setAttribute('aria-label', getStrings().facetOnlyLabel(nameOf(row)));
        if (!only.textContent?.trim()) only.textContent = getStrings().facetOnly;
    }
}

/**
 * Write a row's text, count and swatch from an item.
 * @param {HTMLElement} row
 * @param {FacetItem} item
 */
export function paintRow(row, item) {
    row.querySelector('.kp-facet__name')?.replaceChildren(item.label);
    const count = row.querySelector('.kp-facet__count');
    if (count && item.count !== undefined) count.textContent = String(countText(item.count));
    const swatch = /** @type {HTMLElement | null} */ (row.querySelector('.kp-facet__swatch'));
    if (swatch && item.swatch !== undefined) swatch.style.setProperty('--kp-facet-swatch-colour', item.swatch);
    if (swatch && item.pattern !== undefined) drawPattern(swatch, item.pattern || null);
    const check = checkOf(row);
    if (check) {
        if (item.disabled !== undefined) check.disabled = item.disabled;
        if (item.checked !== undefined) check.checked = item.checked;
    }
    wireRow(row);
}

/**
 * Build one row.
 * @param {FacetItem} item
 * @returns {HTMLLIElement}
 */
export function buildRow(item) {
    const row = /** @type {HTMLLIElement} */ (el('kp-facet', 'li'));
    row.setAttribute('data-value', item.value);
    const option = el('kp-facet__option', 'label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'kp-field__check kp-facet__check';
    check.checked = item.checked ?? true;
    option.append(check);
    if (item.swatch !== undefined || item.pattern) option.append(el('kp-facet__swatch'));
    option.append(el('kp-facet__name'), el('kp-facet__count'));
    const only = document.createElement('button');
    only.type = 'button';
    only.className = 'kp-button kp-button--ghost kp-button--sm kp-facet__only';
    row.append(option, only);
    paintRow(row, item);
    return row;
}

/**
 * The "Everything" row, made when the group asks for it.
 * @param {Element} group
 * @returns {HTMLElement | null}
 */
export function ensureAll(group) {
    const word = group.getAttribute('data-kp-facets-all');
    let row = /** @type {HTMLElement | null} */ (group.querySelector('.kp-facet[data-kp-facet-all]'));
    if (row || word === null) return row;
    row = el('kp-facet', 'li');
    row.setAttribute('data-kp-facet-all', '');
    const option = el('kp-facet__option', 'label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'kp-field__check kp-facet__check';
    option.append(check, el('kp-facet__name'), el('kp-facet__count'));
    row.append(option);
    row.querySelector('.kp-facet__name')?.replaceChildren(word || getStrings().facetAll);
    listOf(group).prepend(row);
    wireRow(row);
    return row;
}

/**
 * Bring the "Everything" row, the empty message and every row's wiring in step.
 * @param {Element} group
 */
export function syncGroup(group) {
    const rows = rowsOf(group);
    for (const row of rows) wireRow(row);
    const all = ensureAll(group);
    const on = rows.filter((row) => checkOf(row)?.checked).length;
    const check = all ? checkOf(all) : null;
    if (check) {
        check.checked = rows.length > 0 && on === rows.length;
        check.indeterminate = on > 0 && on < rows.length;
    }
    const empty = group.querySelector('.kp-facets__empty');
    if (empty instanceof HTMLElement) empty.hidden = rows.length > 0;
}
