// One menu button: it opens and closes its menu, and the menu answers the keys of a menu (APG menu button).
import { Controller } from '../controller.js';
import { MENU_SELECT_EVENT } from './constants.js';
import { ITEM_ROLES, decorateItem, labelOf, menuItems } from './items.js';
import { menuKeyTarget } from './keys.js';
import { menus } from './model.js';
import { closeMenu, decorateButton, openMenu, wireMenu } from './open.js';
/** @typedef {import('./types.js').MenuState} MenuState */

export class MenuButtonControl extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The menu's state, found or built by `connect()`. @type {MenuState} */
        this.state = /** @type {MenuState} */ (/** @type {unknown} */ (null));
    }

    connect() {
        const wrapper = this.host;
        const { decorate, strings } = /** @type {import('./types.js').MenuButtonOptions} */ (this.options);
        const found = menus.get(wrapper);
        let s = found;
        if (s) this.join(s, { decorate, strings });
        else s = wireMenu(wrapper, { decorate, strings }) ?? undefined;
        if (!s) {
            // Nothing to wire: let go of the wrapper so a later call may try again.
            this.destroy();
            return;
        }
        this.state = s;
        this.own(() => menus.delete(wrapper));
        this.listen(s.button, 'click', () => this.onClick());
        this.listen(s.button, 'keydown', (event) => this.onButtonKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(s.menu, 'click', (event) => this.onPick(/** @type {MouseEvent} */ (event)));
        this.listen(s.menu, 'keydown', (event) => this.onMenuKey(/** @type {KeyboardEvent} */ (event)));
        this.own(() => closeMenu(wrapper));
    }

    /**
     * Filled before it was attached: the options join now, and the controls already built are handed to `decorate`.
     * @param {MenuState} s @param {import('./types.js').MenuButtonOptions} options
     */
    join(s, { decorate, strings }) {
        if (decorate) s.decorate = decorate;
        if (strings) s.strings = strings;
        if (!decorate) return;
        decorateButton(s);
        menuItems(s).forEach((item, index) => decorateItem(s, item, index));
    }

    onClick() {
        const { state, host } = this;
        if (state.button.getAttribute('aria-disabled') === 'true') return;
        if (state.open) closeMenu(host);
        else openMenu(host, { focus: 'first' });
    }

    /** @param {KeyboardEvent} event */
    onButtonKey(event) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        if (this.state.open) closeMenu(this.host);
        openMenu(this.host, { focus: event.key === 'ArrowUp' ? 'last' : 'first' });
    }

    /** A press on an entry: a disabled one does nothing; any other is announced, and the menu closes unless the page cancels. @param {MouseEvent} event */
    onPick(event) {
        const { state, host } = this;
        const item = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest(ITEM_ROLES) : null);
        if (!item || !state.menu.contains(item)) return;
        if (item.getAttribute('aria-disabled') === 'true') {
            event.preventDefault();
            return;
        }
        const value = item.dataset.kpValue ?? labelOf(item);
        const go = host.dispatchEvent(new CustomEvent(MENU_SELECT_EVENT, { bubbles: true, cancelable: true, detail: { item, value } }));
        if (!go) {
            event.preventDefault();
            return;
        }
        closeMenu(host, { focus: !item.matches('a[href]') });
    }

    /** @param {KeyboardEvent} event */
    onMenuKey(event) {
        const { state, host } = this;
        const items = menuItems(state);
        if (!items.length) return;
        const active = /** @type {HTMLElement | null} */ (state.menu.ownerDocument.activeElement);
        if (event.key === 'Tab') {
            // The focus goes back to the button first, so the browser's own Tab moves on from there: to what follows the
            // button, or (with Shift) to what comes before it.
            closeMenu(host, { focus: true });
            return;
        }
        if (event.key === ' ' && active?.matches('a[href]')) {
            event.preventDefault();
            active.click();
            return;
        }
        const to = menuKeyTarget(event, items.indexOf(/** @type {HTMLElement} */ (active)), items.map(labelOf));
        if (to == null) return;
        event.preventDefault();
        items[to].focus();
    }
}
