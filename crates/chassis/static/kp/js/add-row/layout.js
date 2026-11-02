// Where an add row's fields stand: under their table columns while the table shows its header, under each other when the
// table shows cards or the row is narrow [forms-1102].

import { ADD_ROW_COLUMN, ADD_ROW_SUBMIT_COLUMN, CELL, FOLD_AT_REM, STACKED, SUBMIT_CELL } from './constants.js';

/** The header cells of a table wrapper's last header row. @param {HTMLElement} wrap @returns {HTMLTableCellElement[]} */
export function headerCells(wrap) {
    return /** @type {HTMLTableCellElement[]} */ ([...(wrap.querySelector('thead tr:last-child')?.children ?? [])]);
}

/** A column's number from its id or number, or -1. @param {HTMLTableCellElement[]} heads @param {string | null} id */
export function columnNumber(heads, id) {
    if (id === null || id === '') return -1;
    const named = heads.findIndex((th) => (th.getAttribute('data-kp-field') ?? th.textContent?.trim()) === id);
    if (named >= 0) return named;
    return /^\d+$/.test(id) && Number(id) < heads.length ? Number(id) : -1;
}

/** Whether a table shows its header row (not its cards). @param {HTMLTableCellElement[]} heads */
const headerShown = (heads) => heads.some((th) => th.getBoundingClientRect().width > 0);

/** One rem in pixels on this page. @param {Element} el */
const rem = (el) => parseFloat(getComputedStyle(el.ownerDocument.documentElement).fontSize) || 16;

/**
 * Lay a table's add row out: one track per column as wide as the column, each field in its column's track, the Add button in
 * its own; or stacked. Returns whether it stacked.
 * @param {HTMLElement} row the add row (the form)
 * @param {HTMLElement} cells the grid that holds the cells
 * @param {HTMLElement} wrap the table's wrapper
 */
export function layTableRow(row, cells, wrap) {
    const heads = headerCells(wrap);
    const stacked = !headerShown(heads) || row.getBoundingClientRect().width < FOLD_AT_REM * rem(row);
    row.toggleAttribute(STACKED, stacked);
    const parts = /** @type {HTMLElement[]} */ ([...cells.querySelectorAll(`:scope > ${CELL}, :scope > ${SUBMIT_CELL}`)]);
    if (stacked) {
        cells.style.removeProperty('grid-template-columns');
        cells.style.removeProperty('inline-size');
        for (const part of parts) part.style.removeProperty('grid-column');
        return true;
    }
    const widths = heads.map((th) => th.getBoundingClientRect().width);
    const used = new Set();
    for (const part of parts.filter((p) => p.matches(CELL))) {
        const at = columnNumber(heads, part.getAttribute(ADD_ROW_COLUMN));
        if (at < 0) console.warn('kp-addrow: a field names no column of its table', part);
        else used.add(at);
        if (at >= 0) part.style.setProperty('grid-column', String(at + 1));
    }
    const submit = parts.find((p) => p.matches(SUBMIT_CELL));
    const asked = columnNumber(heads, row.getAttribute(ADD_ROW_SUBMIT_COLUMN));
    const free = [...widths.keys()].reverse().find((at) => !used.has(at) && widths[at] > 0) ?? -1;
    const place = asked >= 0 ? asked : free;
    const tracks = widths.map((w) => `${w.toFixed(2)}px`);
    if (submit) submit.style.setProperty('grid-column', place >= 0 ? String(place + 1) : String(widths.length + 1));
    if (place < 0) tracks.push('max-content');
    cells.style.setProperty('grid-template-columns', tracks.join(' '));
    cells.style.setProperty('inline-size', `${widths.reduce((a, b) => a + b, 0).toFixed(2)}px`);
    return false;
}

/**
 * A line in a form grid stacks under the fold width of its own.
 * @param {HTMLElement} row
 */
export function layLine(row) {
    const stacked = row.getBoundingClientRect().width < FOLD_AT_REM * rem(row);
    row.toggleAttribute(STACKED, stacked);
    return stacked;
}
