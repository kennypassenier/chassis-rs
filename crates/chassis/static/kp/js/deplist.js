// The dependency list: rows "A → B" that say what needs what, numbered in the order things must go [kpadopt6-ops; homelab's
// "who notices this app" rows, `uf-dep`, `whoNotices` in js/updateflow.js].
//
//   <div class="kp-deplist" data-kp-deplist data-kp-dep-link="/stacks/{name}"></div>
//   setDeplist(el, [{ from: 'paperless', to: 'postgres' }, { from: 'paperless', to: 'redis', state: 'stopped' }]);
//
// A small list a reader can scan, which a graph (a picture) and a step list (progress) are not. Each row is one fixed grid:
// the number, the thing that needs, the arrow, the thing needed, and its state, in the same columns in every row and every
// state, so a name never sits under a neighbour's shorter number. Each name carries the package's identity mark. Options, as
// attributes on the list and as the third argument of setDeplist():
//
//   data-kp-dep-order        `numbers` (default: rows stand in the order things must go, numbered 1, 2, 3 …; Kenny,
//                            2026-10-17: "Ja, met nummers") or `none` (the order given)
//   data-kp-dep-direction    `from-needs-to` (default: "paperless needs postgres") or `from-reaches-to`
//   data-kp-dep-group        `none` (default), `by-to` or `by-from`: rows grouped under a heading (with numbers the rows follow
//                            one order, so grouping stays off)
//   data-kp-dep-arrow        the arrow's glyph (default →)
//   data-kp-dep-states       a state beside each needed thing, in words and a tone (running, stopped, unknown)
//   data-kp-dep-collapse     past this many rows the first show with "Show all 23" (default 8; the number is exact)
//   data-kp-dep-link         a template for each name's own page, `{name}` for the name
//   data-kp-dep-self         `hide` (default: a thing never lists itself) or `show`
//   data-kp-dep-empty        the sentence for a list with nothing in it
//   data-kp-dep-heading      the heading, `{n}` for the exact count ("{n} stacks reach these apps"); default a count
//   data-kp-dep-copy         a button that copies the rows as text ("paperless -> postgres")
//   data-kp-dep-rows         the least rows the list stands as high as, for its states (default 3)
//
// A cycle (paperless needs redis needs paperless) is never looped: it is one destructive row at the top, unnumbered, naming
// each thing in it. Loading is the busy card over placeholder rows, empty the package's empty plate (nothing is wrong: no
// action), failed the failed plate with a normal Retry (`kp-deplist-retry`), each filling the height the list has with rows.
// Nothing runs on import.
//
// Each list is one DependencyList controller (js/deplist/controller.js over js/deplist/rows.js and js/deplist/core.js, on js/controller.js);
// the parts are listed in js/README.md.

import { attachAll, attachOne, controllerOf } from './controller.js';
import { DependencyList } from './deplist/controller.js';
import { DEPLIST } from './deplist/values.js';

export { DEPLIST, DEPLIST_RETRY_EVENT, DEPLIST_COLLAPSE } from './deplist/values.js';
export { orderDependencies, depText } from './deplist/order.js';

/**
 * @typedef {object} DepItem
 * @property {string} from the thing that needs
 * @property {string} to the thing needed
 * @property {string} [label] a word for the link between them
 * @property {'running' | 'stopped' | 'unknown'} [state] the state of the needed thing
 */

/**
 * @typedef {object} DepRow
 * @property {DepItem} item
 * @property {number | null} number its place in the order things must go (null when unnumbered)
 */

/**
 * @typedef {object} DeplistHandle
 * @property {HTMLElement} element
 * @property {(items: readonly DepItem[]) => void} set draw the rows (clears any state)
 * @property {(state: 'ready' | 'loading' | 'empty' | 'error', options?: { message?: string }) => void} setState
 * @property {() => DepRow[]} rows the rows as drawn
 */

/**
 * The handle of a list.
 * @param {Element} el
 * @returns {DeplistHandle | null}
 */
export function deplist(el) {
    return controllerOf(el, DependencyList)?.handle ?? null;
}

/**
 * Give every dependency list under `root` its rows and its states; fill one with `setDeplist` or the handle.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDeplists(root = document) {
    return attachAll(root, DEPLIST, DependencyList);
}

/**
 * Draw the rows of a list (attaching it first when it was not yet).
 * @param {HTMLElement} el
 * @param {readonly DepItem[]} items
 */
export function setDeplist(el, items) {
    (controllerOf(el, DependencyList) ?? attachOne(el, DependencyList))?.handle.set(items);
}
