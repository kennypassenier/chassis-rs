// The toolbar's search box and its active row: the filters that are on, drawn as removable tags with Clear all.

import { getStrings } from '../strings.js';
import { ACTIVE, CLEAR, LIST, SEARCH } from './values.js';

/** @typedef {import('../toolbar.js').ToolbarFilter} ToolbarFilter */
/** @typedef {import('../toolbar.js').ToolbarDecorateInfo} ToolbarDecorateInfo */
/** @typedef {import('../strings.js').Strings} Strings */

/** @param {Element} toolbar @returns {HTMLInputElement | null} */
export function toolbarSearch(toolbar) {
    const input = toolbar.querySelector(SEARCH);
    return input instanceof HTMLInputElement ? input : null;
}

/** The active row, made at the end of the toolbar where it is missing. @param {Element} toolbar @returns {HTMLElement} */
function rowOf(toolbar) {
    let row = /** @type {HTMLElement | null} */ (toolbar.querySelector(ACTIVE));
    if (!row) {
        row = document.createElement('div');
        row.className = 'kp-toolbar__active';
        toolbar.append(row);
    }
    return row;
}

/**
 * The tag list and the Clear all button, made once and kept, so a press that is still in flight never meets a button replaced under it.
 * @param {HTMLElement} row
 * @returns {{ list: Element, button: HTMLElement }}
 */
function partsOf(row) {
    let list = row.querySelector(LIST);
    let button = /** @type {HTMLElement | null} */ (row.querySelector(CLEAR));
    if (!list || !button) {
        const word = document.createElement('span');
        word.className = 'kp-toolbar__active-label';
        list = document.createElement('ul');
        list.className = 'kp-tag-list kp-toolbar__active-list';
        button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.className = 'kp-button kp-button--ghost kp-button--sm';
        button.setAttribute('data-kp-toolbar-clear', '');
        row.replaceChildren(word, list, button);
    }
    return { list, button };
}

/** One removable tag. @param {ToolbarFilter} filter @param {string} removeGlyph @param {Strings} strings @returns {{ item: HTMLElement, remove: HTMLButtonElement }} */
function tagOf(filter, removeGlyph, strings) {
    const item = document.createElement('li');
    item.className = 'kp-tag';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'kp-tag__remove';
    remove.dataset.id = filter.id ?? filter.label;
    remove.dataset.label = filter.label;
    remove.setAttribute('aria-label', strings.tableRemoveFilter(filter.label));
    remove.textContent = removeGlyph;
    item.append(filter.label, remove);
    return { item, remove };
}

/**
 * Draw the filters that are on under the toolbar: one removable tag each and
 * Clear all, or nothing (the row is hidden) when there are none. The Clear all
 * button and the word before the tags are made once and kept, so a press that
 * is still in flight never meets a button replaced under it.
 * @param {Element} toolbar
 * @param {readonly ToolbarFilter[]} filters
 * @param {{ clearAll?: boolean, removeGlyph?: string, decorate?: (part: HTMLElement, info: ToolbarDecorateInfo) => void }} [options]
 *   clearAll: show Clear all (default true); decorate: called with every tag's cross (`tag-remove`) and with Clear all (`clear-all`),
 *   each time they are built, the same shape every kp module's `decorate` takes [wish-1120, homelab 66, 114]
 */
export function setToolbarActive(toolbar, filters, { clearAll = true, removeGlyph = '×', decorate } = {}) {
    /** @param {HTMLElement} part @param {Omit<ToolbarDecorateInfo, 'host' | 'key'>} info */
    const mark = (part, info) => {
        if (!decorate) return;
        const key = toolbar.getAttribute('data-kp-key');
        decorate(part, { ...info, host: /** @type {HTMLElement} */ (toolbar), ...(key === null ? {} : { key }) });
    };
    const strings = getStrings();
    const row = rowOf(toolbar);
    const { list, button } = partsOf(row);
    const word = row.querySelector('.kp-toolbar__active-label');
    if (word) word.textContent = strings.toolbarShowingOnly;
    list.setAttribute('aria-label', strings.tableActiveFilters);
    list.replaceChildren(
        ...filters.map((filter) => {
            const { item, remove } = tagOf(filter, removeGlyph, strings);
            mark(remove, { kind: 'tag-remove', value: filter.id ?? filter.label, label: filter.label });
            return item;
        }),
    );
    button.textContent = strings.toolbarClearAll;
    mark(button, { kind: 'clear-all', label: strings.toolbarClearAll });
    button.hidden = !clearAll;
    row.hidden = filters.length === 0;
}
