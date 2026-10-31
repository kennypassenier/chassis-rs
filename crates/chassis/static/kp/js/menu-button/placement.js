// Where a menu goes: the edges it must clear, the clip, the raise and lower and the placing.
import { layoutRect, raiseOverlay } from '../top-layer.js';
import { MENU_GUTTER } from './constants.js';
/** @typedef {import('./types.js').Covered} Covered */
/** @typedef {import('./types.js').Edges} Edges */
/** @typedef {import('./types.js').MenuState} MenuState */

/**
 * Where an open menu goes so that all of it is on the screen (Kenny,
 * 2026-10-05: a menu under a button at the left edge opened off the
 * screen). Pure: boxes in, box out, all in viewport px.
 *
 * Across, the place the stylesheet gave it (under the button, at its end
 * edge; spanning the header's buttons on a phone) is kept when it fits;
 * else it lines up with the button's start edge, else with its end edge,
 * else it is pushed inside the room. Down, it hangs under the button when
 * it fits there, else over it when it fits there, else on the roomier side
 * at that side's height, scrolling inside itself.
 *
 * @param {object} at
 * @param {Edges} at.button the button's box
 * @param {Edges} at.menu where the stylesheet put the menu
 * @param {number} at.height the menu's whole height, within the stylesheet's own cap
 * @param {number} at.gap the space between the button and the menu
 * @param {Edges} at.room the screen less its gutter and what is stuck over its edges
 * @returns {{ left: number, top: number, width: number | null, height: number | null, side: 'below' | 'above' }}
 *   `width` and `height` are the caps to set, null where the menu fits whole
 */
export function menuPlacement({ button, menu, height, gap, room }) {
    const width = menu.right - menu.left;
    const across = room.right - room.left;
    const fits = (/** @type {number} */ x) => x >= room.left - 0.5 && x + width <= room.right + 0.5;
    let left = menu.left;
    let capWidth = null;
    if (width > across) {
        left = room.left;
        capWidth = across;
    } else if (!fits(left)) {
        const start = button.left;
        const end = button.right - width;
        left = fits(start) ? start : fits(end) ? end : Math.min(Math.max(left, room.left), room.right - width);
    }
    const below = room.bottom - (button.bottom + gap);
    const above = button.top - gap - room.top;
    /** @type {'below' | 'above'} */
    let side = 'below';
    let capHeight = null;
    if (height > below + 0.5) {
        if (height <= above + 0.5) side = 'above';
        else {
            side = above > below ? 'above' : 'below';
            capHeight = Math.max(0, Math.floor(side === 'above' ? above : below));
        }
    }
    const tall = capHeight ?? height;
    const top = side === 'below' ? button.bottom + gap : button.top - gap - tall;
    return { left, top, width: capWidth, height: capHeight, side };
}

/**
 * Whether a container round the menu button cuts off what hangs outside it
 * (a clip-path, or overflow other than visible): cyberpunk's cut card hid
 * the whole menu that opened above its button.
 * @param {Element} wrapper
 * @param {Window} view
 */
function clipped(wrapper, view) {
    const top = view.document.body;
    for (let el = wrapper.parentElement; el && el !== top; el = el.parentElement) {
        const style = view.getComputedStyle(el);
        if (style.clipPath !== 'none' || style.overflowX !== 'visible' || style.overflowY !== 'visible') return true;
    }
    return false;
}

/**
 * Lift the placed menu into the top layer at the spot it was placed on,
 * kept against its button as the page scrolls (js/top-layer.js), when a
 * container would clip it. It stays the button's child, so every register
 * selector still reaches it.
 * @param {MenuState} s
 * @param {Window} view
 */
export function raiseMenu(s, view) {
    if (!clipped(s.wrapper, view)) return;
    const box = layoutRect(s.menu);
    const button = s.button.getBoundingClientRect();
    const dx = box.left - button.left;
    const dy = box.top - button.top;
    s.lower = raiseOverlay(s.menu, (menu) => {
        const at = s.button.getBoundingClientRect();
        menu.style.setProperty('left', `${at.left + dx}px`);
        menu.style.setProperty('top', `${at.top + dy}px`);
        menu.style.setProperty('right', 'auto');
        menu.style.setProperty('bottom', 'auto');
        menu.style.setProperty('width', `${box.width}px`);
    });
}

/** @param {MenuState} s */
export function lowerMenu(s) {
    s.lower?.();
    s.lower = null;
}

/** The inline properties placeMenu() writes, undone when the menu closes. */
const PLACED = ['left', 'right', 'top', 'bottom', 'width', 'max-block-size', 'max-inline-size', '--kp-menu-anchor-x'];

/** How far from the menu's left edge the written anchor stays at least, so it sits on the straight part of the top edge (past a theme's cove). */
const ANCHOR_EDGE = 14;

/** @param {HTMLElement} menu */
export function unplaceMenu(menu) {
    for (const name of PLACED) menu.style.removeProperty(name);
    menu.removeAttribute('data-kp-menu-side');
}

/**
 * Put the open menu where menuPlacement() says: one read of the boxes, then
 * one write, before the frame is painted, so it never shows in the wrong
 * place first.
 * @param {MenuState} s
 * @param {Window} view
 * @param {Covered} covered
 */
export function placeMenu(s, view, covered) {
    const { menu } = s;
    unplaceMenu(menu);
    const html = view.document.documentElement;
    const room = {
        left: covered.left + MENU_GUTTER,
        right: html.clientWidth - covered.right - MENU_GUTTER,
        top: covered.top + MENU_GUTTER,
        bottom: html.clientHeight - covered.bottom - MENU_GUTTER,
    };
    // Side bars that leave less than the button's own width between them
    // are not kept clear: the menu then has the whole screen across.
    const button = s.button.getBoundingClientRect();
    if (room.right - room.left < button.width) {
        room.left = MENU_GUTTER;
        room.right = html.clientWidth - MENU_GUTTER;
    }
    // A button the window does not show (a menu opened by a script before its page was scrolled there) has no room to
    // fit the menu into: clamping it to the window would hang it somewhere that has nothing to do with the button, and
    // the raised menu keeps that offset for good. On that axis the menu stays where the layout puts it.
    if (button.bottom < 0 || button.top > html.clientHeight) {
        room.top = Number.NEGATIVE_INFINITY;
        room.bottom = Number.POSITIVE_INFINITY;
    }
    if (button.right < 0 || button.left > html.clientWidth) {
        room.left = Number.NEGATIVE_INFINITY;
        room.right = Number.POSITIVE_INFINITY;
    }
    // Measured where the layout put it: a theme's arrival may still be
    // drawing it elsewhere on this frame (forest's growth, layoutRect).
    const box = layoutRect(menu);
    const style = view.getComputedStyle(menu);
    const cap = parseFloat(style.maxBlockSize);
    const borders = box.height - menu.clientHeight;
    const whole = menu.scrollHeight + borders;
    const height = Number.isFinite(cap) ? Math.min(whole, cap) : whole;
    const at = menuPlacement({ button, menu: box, height, gap: Math.max(0, box.top - button.bottom), room });
    // Only what moves is written: the used left or top (px for a positioned
    // box) moved by the difference, so whichever box contains the menu it
    // lands at `at`. A menu the stylesheet sized by its two edges (the
    // phone header's span) keeps its width when it moves across.
    if (Math.abs(at.left - box.left) > 0.5 || at.width != null) {
        const usedLeft = parseFloat(style.left);
        menu.style.setProperty('left', `${(Number.isFinite(usedLeft) ? usedLeft : menu.offsetLeft) + at.left - box.left}px`);
        menu.style.setProperty('right', 'auto');
        menu.style.setProperty('width', `${at.width ?? box.width}px`);
    }
    if (Math.abs(at.top - box.top) > 0.5) {
        const usedTop = parseFloat(style.top);
        menu.style.setProperty('top', `${(Number.isFinite(usedTop) ? usedTop : menu.offsetTop) + at.top - box.top}px`);
        menu.style.setProperty('bottom', 'auto');
    }
    if (at.width != null) menu.style.setProperty('max-inline-size', `${at.width}px`);
    if (at.height != null) menu.style.setProperty('max-block-size', `${at.height}px`);
    menu.setAttribute('data-kp-menu-side', at.side);
    // Where the button's centre falls on the menu, from the menu's left edge, for a register that starts something
    // under the button (deco's inlay). Written for every theme; only a menu hanging below its button has it: one
    // flipped above has its top edge away from the button, so it keeps the register's own origin.
    if (at.side === 'below') {
        const width = at.width ?? box.width;
        const x = Math.min(Math.max(button.left + button.width / 2 - at.left, ANCHOR_EDGE), Math.max(width - ANCHOR_EDGE, ANCHOR_EDGE));
        menu.style.setProperty('--kp-menu-anchor-x', `${Math.round(x * 10) / 10}px`);
    }
}
