// Opening, closing, setting and wiring a menu, and dressing its button.
import { stopClose, playClose } from '../motion.js';
import { MENU_CLOSE_EVENT, MENU_OPEN_EVENT } from './constants.js';
import { countMenu } from './count.js';
import { decorateItem, drawMenu, menuItems } from './items.js';
import { keyOf, menuSignature, menus, nextId } from './model.js';
import { coveredEdges } from './covered.js';
import { lowerMenu, placeMenu, raiseMenu, unplaceMenu } from './placement.js';
/** @typedef {import('./types.js').MenuButtonOptions} MenuButtonOptions */
/** @typedef {import('./types.js').MenuDecorateInfo} MenuDecorateInfo */
/** @typedef {import('./types.js').MenuGroup} MenuGroup */
/** @typedef {import('./types.js').MenuState} MenuState */

/** Place an open menu again in the next frame, once however often a resize asks. @param {MenuState} s @param {Window} view */
function placeAgain(s, view) {
    if (s.placing) return;
    s.placing = view.requestAnimationFrame(() => {
        s.placing = 0;
        if (!s.open) return;
        lowerMenu(s);
        placeMenu(s, view, coveredEdges(view, s.wrapper, s.menu));
        raiseMenu(s, view);
    });
}

/**
 * Open a menu button's menu and put the focus on its first (or last) entry;
 * `none` leaves the focus where it is (a page showing the menu on its own,
 * not the reader asking for it).
 * @param {Element} wrapper
 * @param {{ focus?: 'first' | 'last' | 'none' }} [options]
 */
export function openMenu(wrapper, { focus = 'first' } = {}) {
    const s = menus.get(wrapper);
    if (!s || s.open || s.empty) return;
    const doc = s.menu.ownerDocument;
    const view = doc.defaultView;
    s.open = true;
    // A line a page added by hand since it was wired is counted too.
    countMenu(s.menu);
    // Still closing: it turns round where it stands.
    const closing = !s.menu.hidden;
    stopClose(s.menu);
    s.menu.inert = false;
    lowerMenu(s);
    if (closing) unplaceMenu(s.menu);
    s.menu.hidden = true;
    // What the page has stuck over the screen's edges is read while the
    // menu is still hidden, so the probe cannot hit the menu itself.
    const covered = view ? coveredEdges(view, s.wrapper) : null;
    s.menu.hidden = false;
    if (view && covered) {
        placeMenu(s, view, covered);
        raiseMenu(s, view);
        // A turned phone or a resized window: the menu is placed again,
        // once a frame at most; the frame asked for sits on the menu's state.
        const again = () => placeAgain(s, view);
        view.addEventListener('resize', again);
        s.off.push(() => {
            view.removeEventListener('resize', again);
            if (s.placing) view.cancelAnimationFrame(s.placing);
            s.placing = 0;
        });
    }
    s.button.setAttribute('aria-expanded', 'true');
    /** @param {MouseEvent} event */
    const outside = (event) => {
        if (!s.wrapper.contains(/** @type {Node} */ (event.target))) closeMenu(s.wrapper);
    };
    /** @param {KeyboardEvent} event */
    const escape = (event) => {
        if (event.key !== 'Escape') return;
        // Capture, on the window: the menu's Escape is its own, and the
        // page's Escape (or a dialog's) does not fire as well.
        event.preventDefault();
        event.stopPropagation();
        closeMenu(s.wrapper, { focus: true });
    };
    doc.addEventListener('click', outside, true);
    view?.addEventListener('keydown', escape, true);
    s.off.push(
        () => doc.removeEventListener('click', outside, true),
        () => view?.removeEventListener('keydown', escape, true),
    );
    const items = menuItems(s);
    const target = focus === 'none' ? null : focus === 'last' ? items.at(-1) : items[0];
    target?.focus();
    s.wrapper.dispatchEvent(new CustomEvent(MENU_OPEN_EVENT, { bubbles: true }));
}

/**
 * Close it; with `focus`, the focus goes back to the button. A fill that
 * waited while it was open is drawn now.
 * @param {Element} wrapper
 * @param {{ focus?: boolean }} [options]
 */
export function closeMenu(wrapper, { focus = false } = {}) {
    const s = menus.get(wrapper);
    if (!s || !s.open) return;
    s.open = false;
    s.button.setAttribute('aria-expanded', 'false');
    for (const off of s.off.splice(0)) off();
    if (focus) s.button.focus();
    // It closes as it opened, backwards, before it is hidden (Kenny,
    // 2026-10-06: every close is its open played backwards); meanwhile it
    // takes no pointer or focus. Opened again before that, it turns round.
    s.menu.inert = true;
    const menu = s.menu;
    void playClose(menu).then((played) => {
        if (!played || s.open) return;
        // Hidden first, then out of the top layer: hidden, it has no box
        // for a second close to play on (js/motion.js).
        menu.hidden = true;
        lowerMenu(s);
        menu.inert = false;
        stopClose(menu);
        unplaceMenu(menu);
        if (s.pending) {
            const next = s.pending;
            s.pending = null;
            drawMenu(s, next);
        }
    });
    s.wrapper.dispatchEvent(new CustomEvent(MENU_CLOSE_EVENT, { bubbles: true }));
}

/**
 * Give a menu button its entries. Skipped when they show the same as now;
 * while the menu is open the change waits until it closes, so a live refill
 * never moves an entry under the pointer or the focus. `'loading'` shows one
 * disabled entry at the final row height. A wrapper not attached yet is
 * wired (without listeners) so the fill is kept.
 * @param {Element} wrapper
 * @param {MenuGroup[] | 'loading'} groups
 */
export function setMenu(wrapper, groups) {
    const s = menus.get(wrapper) ?? wireMenu(/** @type {HTMLElement} */ (wrapper), {});
    if (!s) return;
    if (menuSignature(groups) === s.drawn) {
        s.pending = null;
        return;
    }
    if (s.open) {
        s.pending = groups;
        return;
    }
    drawMenu(s, groups);
}

/**
 * @param {HTMLElement} wrapper
 * @param {MenuButtonOptions} options
 * @returns {MenuState | null}
 */
export function wireMenu(wrapper, { decorate, strings }) {
    const button = /** @type {HTMLElement | null} */ (wrapper.querySelector(':scope > button'));
    const menu = /** @type {HTMLElement | null} */ (wrapper.querySelector(':scope > [role="menu"]'));
    if (!button || !menu) return null;
    if (!menu.id) menu.id = nextId('kp-menu');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-controls', menu.id);
    button.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    /** @type {MenuState} */
    const s = { wrapper, button, menu, decorate, strings, drawn: '', pending: null, open: false, empty: false, off: [], placing: 0 };
    menus.set(wrapper, s);
    decorateButton(s);
    menuItems(s).forEach((item, index) => {
        item.tabIndex = -1;
        decorateItem(s, item, index);
    });
    countMenu(menu);
    return s;
}

/** @param {MenuState} s */
export const decorateButton = (s) => {
    if (!s.decorate) return;
    /** @type {MenuDecorateInfo} */
    const info = { kind: 'menu-button', host: s.wrapper };
    const key = keyOf(s.wrapper);
    if (key !== undefined) info.key = key;
    s.decorate(s.button, info);
};
