// The context menu [habits-1101; the Habits todo app's right click and long press on a task row].
//
// Any element marked `data-kp-context-menu` opens a kp menu at the pointer: on a right click, on a long press on touch (a finger
// or a pen held still for LONG_PRESS_MS, 500 ms), and on Shift+F10 or the context-menu key (then it hangs from the focused
// element's start edge). The menu is the menu button's own (js/menu-button.js): the same `.kp-menu--rich` plate in every theme,
// the same keys (↓ ↑ wrapping, Home, End, a letter, Esc back to where the focus was, Tab on), the same placement that keeps
// it whole on the screen and the same `kp-menu-select` `{ item, value }` event, here with `context`, the element, added.
//
//   <li data-kp-context-menu>…</li>                 setContextMenu(li, groups)  (or a function of the element, read on open)
//   <li data-kp-context-menu="inner">…⋯ menu…</li>  the entries of the element's own menu button; a pick is reported on
//                                                   that button's wrapper, where the page already listens
//   <li data-kp-context-menu="more-t1">…</li>        the entries of the menu button with that id, reported there too
//
//   data-kp-context-menu-label   the menu's name for a screen reader ("Actions" from the dictionary when absent)
//   data-kp-context-press        `on` or `off`: whether a long press opens it; by default it does, except inside an element
//                                with row picking (js/row-pick.js), whose long press starts selection mode
//
// Shift with a right click keeps the browser's own menu, and so does an element whose menu has no entries. A scroll of the page
// closes the open menu. `kp-context-menu-open` `{ x, y, source }` fires on the element when its menu opens.
//
// Each root is one ContextMenuRoot controller (js/context-menu/controller.js) that listens for every element under it; the menu
// itself is one ContextAnchor per document (js/context-menu/anchor.js), on js/controller.js.

import { attachOne, controllerOf } from './controller.js';
import { ContextMenuRoot, given } from './context-menu/controller.js';

export { CONTEXT_MENU, CONTEXT_OPEN_EVENT } from './context-menu/values.js';

/** @typedef {import('./menu-button.js').MenuGroup} MenuGroup */

/**
 * Give an element its context menu: groups of entries as setMenu() takes them, or a function that answers them when the menu
 * opens (a row whose actions depend on its state). Marks the element `data-kp-context-menu`.
 * @param {HTMLElement} el
 * @param {MenuGroup[] | ((el: HTMLElement) => MenuGroup[])} groups
 */
export function setContextMenu(el, groups) {
    given.set(el, groups);
    if (!el.hasAttribute('data-kp-context-menu')) el.setAttribute('data-kp-context-menu', '');
}

/**
 * Listen for context menus under `root` (the document by default): every `[data-kp-context-menu]` element under it, also those
 * added later. Idempotent per root.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachContextMenus(root = document) {
    const host = root instanceof Document ? root.documentElement : root;
    if (!(host instanceof HTMLElement) || controllerOf(host, ContextMenuRoot)) return () => {};
    const made = attachOne(host, ContextMenuRoot);
    return () => made?.destroy();
}

/**
 * Open an element's context menu from the page, at a point in window coordinates (the element's start edge when not given).
 * @param {HTMLElement} el
 * @param {{ x?: number, y?: number }} [at]
 * @returns {boolean} whether it opened (false when it has no entries or nothing listens under a root that holds it)
 */
export function openContextMenu(el, at = {}) {
    const box = el.getBoundingClientRect();
    let root = /** @type {HTMLElement | null} */ (el);
    while (root && !controllerOf(root, ContextMenuRoot)) root = root.parentElement;
    const control = root ? controllerOf(root, ContextMenuRoot) : undefined;
    return control?.openAt(el, at.x ?? box.left, at.y ?? box.bottom, 'pointer') ?? false;
}
