// Attaches the menu buttons of a page.
import { attachOne, controllerOf } from '../controller.js';
import { MENU_BUTTON } from './constants.js';
import { countMenu } from './count.js';
import { MenuButtonControl } from './controller.js';
/** @typedef {import('./types.js').MenuButtonOptions} MenuButtonOptions */

/**
 * Wire every menu button under `root`: the button opens and closes the menu,
 * and the menu answers the keys of a menu (APG menu button). A disabled
 * entry (`aria-disabled`) keeps the focus, so its reason is read; it does
 * nothing. Idempotent.
 * @param {ParentNode} [root]
 * @param {MenuButtonOptions} [options]
 * @returns {() => void} detach
 */
export function attachMenuButtons(root = document, { decorate, strings } = {}) {
    const wrappers = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(MENU_BUTTON)]);
    const made = wrappers.filter((wrapper) => !controllerOf(wrapper, MenuButtonControl)).map((wrapper) => attachOne(wrapper, MenuButtonControl, { decorate, strings }));
    // A popover with a menu in it has no wrapper to wire, but a register that
    // rules its lines needs the same count.
    for (const menu of /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.kp-popover[popover] > .kp-menu')])) countMenu(menu);
    return () => {
        for (const control of made) control?.destroy();
    };
}
