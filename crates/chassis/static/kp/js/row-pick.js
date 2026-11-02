// Rows picked without select boxes [habits-1101; the Habits todo app's bulk actions].
//
// `attachRowSelect` (js/row-select.js) works on rows that carry a `data-kp-select-row` box and owns j / k / x / Esc. A row whose only
// box means something else (a task's "done") has none to give. This module picks rows by their key instead, and owns no key:
//
//   <ul data-kp-row-pick role="listbox" aria-label="Tasks"> <li role="option" data-kp-row-key="a">…</li> …
//
//   Ctrl/Cmd + click        picks the row or takes it out; it starts the next range
//   Shift + click           picks every visible row from the last one to this one
//   a long press on touch   (LONG_PRESS_MS) picks the row and starts selection mode: a tap then picks or unpicks (`data-kp-selecting`)
//                           until the last pick goes; `data-kp-pick-mode="any"` makes any first pick start it, mouse too
//
// A picked row carries `data-kp-picked`, and `aria-selected="true"` when its role is option, row, gridcell or treeitem (every such row says
// "true" or "false"; a listbox or grid gets `aria-multiselectable`). The row's own controls keep their meaning (a link, a button, an input,
// and what `data-kp-pick-ignore="<selector>"` names), and a click that picks never reaches the row's own handlers. The picks feed a selection
// bar (js/selection-bar.js) without boxes: `kp-rows-select` (ROW_SELECT_EVENT of js/row-select.js) fires on the element with `{ keys, count, source, skipped }`.
//
// The keys are the page's: bind `rowPickNext`, `rowPickPrev`, `rowPickToggle`, `rowPickExtend` and `rowPickClear` in the page's own table
// (registerShortcuts), so the module owns no j / k / x / Esc. Opt-in: only an element marked `data-kp-row-pick` (or passed to
// attachRowPick) is touched; attachRowSelect is unchanged.
//
// Each element is one RowPicker controller (js/row-pick/controller.js over js/row-pick/core.js, on js/controller.js).

import { attachOne, controllerOf, hostsOf } from './controller.js';
import { RowPicker } from './row-pick/controller.js';
import { ROW_PICK } from './row-pick/rows.js';

export { ROW_PICK, PICK_ROW, PICKED_ATTRIBUTE } from './row-pick/rows.js';

/**
 * @typedef {object} RowPickHandle
 * @property {() => string[]} keys the keys of every picked row, in the order picked
 * @property {() => string | null} cursor the key of the cursor row
 * @property {(key: string | null) => void} moveTo put the cursor on a row, or take it away
 * @property {(keys: readonly string[]) => void} set pick exactly these keys
 * @property {() => void} next cursor one row down
 * @property {() => void} prev cursor one row up
 * @property {() => void} toggle pick or unpick the cursor row
 * @property {(direction: number) => void} extend move the cursor by 1 or -1 and pick the range from the anchor
 * @property {() => void} clear unpick everything
 */

/**
 * The handle of an element whose rows are picked.
 * @param {Element} el
 * @returns {RowPickHandle | null}
 */
export function rowPick(el) {
    return controllerOf(el, RowPicker)?.handle ?? null;
}

/**
 * The picked keys of an element.
 * @param {Element} el
 * @returns {string[]}
 */
export const rowPickKeys = (el) => rowPick(el)?.keys() ?? [];

/** Move the cursor one row down. @param {Element} el */
export const rowPickNext = (el) => rowPick(el)?.next();
/** Move the cursor one row up. @param {Element} el */
export const rowPickPrev = (el) => rowPick(el)?.prev();
/** Pick or unpick the cursor row. @param {Element} el */
export const rowPickToggle = (el) => rowPick(el)?.toggle();
/** Move the cursor and pick the range from the anchor to it. @param {Element} el @param {number} [direction] 1 (default) or -1 */
export const rowPickExtend = (el, direction = 1) => rowPick(el)?.extend(direction);
/** Unpick everything. @param {Element} el */
export const rowPickClear = (el) => rowPick(el)?.clear();

/**
 * Let the rows of every element marked `data-kp-row-pick` under `root` (or `root` itself) be picked.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachRowPick(root = document) {
    const made = hostsOf(root, ROW_PICK)
        .filter((el) => !controllerOf(el, RowPicker))
        .map((el) => attachOne(el, RowPicker));
    return () => made.forEach((picker) => picker?.destroy());
}
