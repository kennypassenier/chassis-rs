// Rows ticked with the keyboard and with Shift-click [kpadopt5; homelab's Overview keys, kyu's dead letters].
//
// A table or a list of rows that carry a checkbox (`data-kp-select-row`) is
// worked down without the mouse: j and k walk a cursor from row to row, x ticks
// the row under it, Shift+x ticks everything from the last tick to the cursor,
// Esc unticks all, Enter on a row opens it (`kp-row-open`, as js/actions.js'
// row keys do). Shift-click on a checkbox ticks the range from the last one a
// plain click ticked; a plain click still toggles one row, so nobody needs
// Shift. It is on for every data table that has a select column and for any
// element marked `data-kp-select-keys`; `data-kp-select-keys="false"` turns it
// off.
//
//   <div class="kp-datatable" data-kp-datatable data-kp-select-range="shift">…</div>
//   <ul data-kp-select-keys> <li data-kp-row-key="a"><input type="checkbox" data-kp-select-row>…
//
// The module only sets the boxes and fires `change` on each, so the data table
// (or the page's own list) hears a tick the way it hears a click; it keeps
// nothing of its own but the cursor. Options, as attributes on the element and
// as the second argument of attachRowSelect():
//
//   data-kp-select-range   `shift` (default) | `off`
//   data-kp-select-arrows  the arrow keys walk too, on by default, `false` turns them off (never inside a `data-kp-grid`, which owns them)
//   data-kp-select-all-key Ctrl+A ticks every row shown, `Ctrl+Shift+A` unticks them: on by default, `false` turns it off
//   data-kp-cursor-scroll  `nearest` (default) | `center`
//   data-kp-select-hint    an element in the page; the keys are written into it as a `.kp-keys` line
//
// Rows hidden by a filter are not in the walk; rows whose box is disabled are
// walked over by a range and counted in what is said ("2 skipped: cannot be
// selected"). The cursor is a ring on the row (`is-cursor`), not a fill, so a
// ticked row and the cursor row read apart. It survives a refresh by the row's
// key. On a phone a long press on a row starts selection mode: every tap on a
// row then ticks it, until the last tick goes (`data-kp-selecting`).
//
// Each element is one RowSelector controller (js/row-select/controller.js over js/row-select/core.js, on js/controller.js);
// the parts are listed in js/README.md.

import { attachOne, controllerOf } from './controller.js';
import { RowSelector } from './row-select/controller.js';
import { ROW_SELECT, ROW_SELECT_AUTO, boxesOf, keyOfRow, rowOf } from './row-select/rows.js';

export {
    ROW_SELECT,
    ROW_SELECT_AUTO,
    SELECT_BOX,
    ROW_SELECT_EVENT,
    ROW_OPEN_EVENT,
    CURSOR_CLASS,
    LONG_PRESS_MS,
} from './row-select/rows.js';

/**
 * @typedef {object} RowSelectOptions
 * @property {'shift' | 'off'} [range]
 * @property {boolean} [arrows]
 * @property {boolean} [allKey]
 * @property {'nearest' | 'center'} [scroll]
 */

/**
 * @typedef {object} RowSelectHandle
 * @property {() => string[]} keys the keys of every ticked row
 * @property {() => string | null} cursor the key of the cursor row
 * @property {(key: string | null) => void} moveTo put the cursor on a row, or take it away
 * @property {() => void} clear untick everything
 */

/**
 * The keys of every ticked row under `el`.
 * @param {Element} el
 * @returns {string[]}
 */
export function rowSelectKeys(el) {
    const known = rowSelect(el);
    if (known) return known.keys();
    return boxesOf(el)
        .filter((b) => b.checked)
        .map((b, i) => {
            const row = rowOf(b);
            return row ? keyOfRow(row, i) : '';
        });
}

/**
 * The handle of an element that has the keys.
 * @param {Element} el
 * @returns {RowSelectHandle | null}
 */
export function rowSelect(el) {
    return controllerOf(el, RowSelector)?.handle ?? null;
}

/**
 * Give every table and list under `root` that has select boxes the keys.
 * @param {ParentNode} [root]
 * @param {RowSelectOptions} [options]
 * @returns {() => void} detach
 */
export function attachRowSelect(root = document, options = {}) {
    // The descendants first, then the root itself, the order the elements have always been wired in.
    const found = new Set(/** @type {HTMLElement[]} */ ([...root.querySelectorAll(`${ROW_SELECT}, ${ROW_SELECT_AUTO}`)]));
    if (root instanceof HTMLElement && root.matches(`${ROW_SELECT}, ${ROW_SELECT_AUTO}`)) found.add(root);
    /** @type {RowSelector[]} */
    const made = [];
    for (const el of found) {
        if (el.getAttribute('data-kp-select-keys') === 'false' || controllerOf(el, RowSelector)) continue;
        const selector = attachOne(el, RowSelector, options);
        if (selector) made.push(selector);
    }
    return () => made.forEach((selector) => selector.destroy());
}
