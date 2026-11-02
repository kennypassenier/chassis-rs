// The selector, attributes and pure helpers of row picking: rows keyed by `data-kp-row-key` that need no select box.

import { CONTROLS, shown } from '../row-select/rows.js';

export { CONTROLS, CURSOR_CLASS, LONG_PRESS_MS, ROW_SELECT_EVENT, labelOfRow, markCursor } from '../row-select/rows.js';

/** An element whose keyed rows can be picked. */
export const ROW_PICK = '[data-kp-row-pick]';
/** A row that can be picked: it carries a key. */
export const PICK_ROW = '[data-kp-row-key]';
/** The mark a picked row carries, for any row; a row with a selectable role also gets `aria-selected`. */
export const PICKED_ATTRIBUTE = 'data-kp-picked';
/** The roles whose rows say `aria-selected` (a listbox option, a grid or table row, a cell, a tree item). */
export const SELECTABLE_ROLES = ['option', 'row', 'gridcell', 'treeitem'];
/** The roles of a container that is told it can hold several picks (`aria-multiselectable`). */
export const MULTI_ROLES = ['listbox', 'grid', 'treegrid', 'tree'];
/** How far a finger may wander before a press counts as a scroll instead [px]. */
export const PRESS_SLOP_PX = 10;

/** A row's key. @param {HTMLElement} row */
export const keyOf = (row) => row.dataset.kpRowKey ?? '';

/** Whether a row can be seen now: not hidden by a filter, and not inside a closed section. @param {HTMLElement} row */
export const visible = (row) => shown(row) && (row.checkVisibility ? row.checkVisibility() : row.offsetParent !== null);

/** Whether a click or press landed on a control of the row that keeps its own meaning. @param {Element} target @param {string} extra a page's own selector */
export const ownControl = (target, extra) => target.closest(extra === '' ? CONTROLS : `${CONTROLS}, ${extra}`) !== null;
