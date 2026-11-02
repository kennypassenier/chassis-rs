// Attaches the menu buttons of a page.
import { attachOne, controllerOf } from '../controller.js';
import { MENU_BUTTON } from './constants.js';
import { countMenu } from './count.js';
import { MenuButtonControl } from './controller.js';
/** @typedef {import('./types.js').MenuButtonOptions} MenuButtonOptions */

/** What reaches a menu button first: a pointer, the focus, a key, a click. */
const LATE_EVENTS = ['pointerdown', 'focusin', 'keydown', 'click'];

/**
 * Wire every menu button under `root`: the button opens and closes the menu,
 * and the menu answers the keys of a menu (APG menu button). A disabled
 * entry (`aria-disabled`) keeps the focus, so its reason is read; it does
 * nothing. Idempotent. A menu button that arrives after the call (a table redraws its rows, a card is rebuilt) is wired the
 * moment a pointer, the keyboard or a click reaches it, by one delegated listener on `root`.
 * @param {ParentNode} [root]
 * @param {MenuButtonOptions} [options]
 * @returns {() => void} detach
 */
export function attachMenuButtons(root = document, { decorate, strings } = {}) {
    const wrappers = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(MENU_BUTTON)]);
    const wire = (/** @type {HTMLElement} */ wrapper) => (controllerOf(wrapper, MenuButtonControl) ? undefined : attachOne(wrapper, MenuButtonControl, { decorate, strings }));
    const made = wrappers.map(wire);
    // Capture, so the button's own listener exists before the event reaches the button.
    const late = (/** @type {Event} */ event) => {
        const wrapper = event.target instanceof Element ? event.target.closest(MENU_BUTTON) : null;
        if (wrapper instanceof HTMLElement) made.push(wire(wrapper));
    };
    for (const type of LATE_EVENTS) root.addEventListener(type, late, true);
    // A popover with a menu in it has no wrapper to wire, but a register that
    // rules its lines needs the same count.
    for (const menu of /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.kp-popover[popover] > .kp-menu')])) countMenu(menu);
    return () => {
        for (const type of LATE_EVENTS) root.removeEventListener(type, late, true);
        for (const control of made) control?.destroy();
    };
}
