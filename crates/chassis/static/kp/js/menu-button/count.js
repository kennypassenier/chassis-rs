// Counting the lines of a menu: the line count property and the count of a menu.
import { MENU_COUNT_PROPERTY } from './constants.js';

/**
 * How many lines a menu has: its children. In a menu `setMenu()` filled they
 * are its groups (a nameless group is one line, a named one is its heading
 * and entries); in a menu written by hand they are its entries, which is
 * what a register counting with `:has(> :nth-child(k))` counts too. Pure.
 * @param {{ children: { length: number } }} menu
 * @returns {number}
 */
export function menuLineCount(menu) {
    return menu.children.length;
}

/**
 * Write menuLineCount() on a menu, and on the popover it stands in (the
 * element a register clips and rules), when it changed.
 * @param {HTMLElement} menu
 */
export function countMenu(menu) {
    const next = String(menuLineCount(menu));
    /** @type {HTMLElement[]} */
    const hosts = [menu];
    const popover = menu.parentElement;
    if (popover?.matches('.kp-popover[popover]')) hosts.push(popover);
    for (const host of hosts) if (host.style.getPropertyValue(MENU_COUNT_PROPERTY) !== next) host.style.setProperty(MENU_COUNT_PROPERTY, next);
}
