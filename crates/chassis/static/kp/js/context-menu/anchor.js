// The one menu a document shows at the pointer: the package's own menu button (js/menu-button.js) with an invisible button that
// stands where the menu was asked for, so the menu's placement, keys, close motion and every register's look are the menu
// button's. It is put inside the element it serves while it is open (so the review lane and a theme's selectors keep it) and
// taken out again once it has closed.

import { Controller, attachOne, controllerOf } from '../controller.js';
import { MENU_CLOSE_EVENT, MENU_SELECT_EVENT } from '../menu-button/constants.js';
import { MenuButtonControl } from '../menu-button/controller.js';
import { menus } from '../menu-button/model.js';
import { closeMenu, openMenu, setMenu } from '../menu-button/open.js';
import { ANCHOR_CLASS, CONTEXT_OPEN_EVENT, NO_CHILD } from './values.js';

/** @typedef {import('../menu-button.js').MenuGroup} MenuGroup */
/** @typedef {{ el: HTMLElement, groups: MenuGroup[], source: HTMLElement | null, x: number, y: number, how: 'pointer' | 'touch' | 'keyboard', label: string }} OpenRequest */

/** The anchor of each document. @type {WeakMap<Document, ContextAnchor>} */
const anchors = new WeakMap();

/** The wrapper, its invisible button and its menu. @param {Document} doc */
function buildWrapper(doc) {
    const wrapper = doc.createElement('div');
    wrapper.className = `kp-menu-button ${ANCHOR_CLASS}`;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `${ANCHOR_CLASS}__anchor`;
    button.tabIndex = -1;
    const menu = doc.createElement('div');
    menu.className = 'kp-menu kp-menu--rich';
    menu.setAttribute('role', 'menu');
    wrapper.append(button, menu);
    return wrapper;
}

export class ContextAnchor extends Controller {
    /** @param {HTMLElement} wrapper @param {Record<string, unknown>} [options] */
    constructor(wrapper, options) {
        super(wrapper, options);
        /** The element whose menu is open. @type {HTMLElement | null} */
        this.target = null;
        /** A menu button whose entries are shown, to which a pick is reported. @type {HTMLElement | null} */
        this.source = null;
        /** Where the focus goes back to when the menu closes. @type {HTMLElement | null} */
        this.returnTo = null;
        /** What stops listening for a scroll while the menu is open. @type {(() => void) | null} */
        this.unscroll = null;
    }

    /** The menu of the anchor of a document, made the first time. @param {Document} doc @returns {ContextAnchor} */
    static of(doc) {
        let anchor = anchors.get(doc);
        if (anchor && !anchor.destroyed) return anchor;
        const wrapper = buildWrapper(doc);
        attachOne(wrapper, MenuButtonControl);
        anchor = /** @type {ContextAnchor} */ (attachOne(wrapper, ContextAnchor));
        anchors.set(doc, anchor);
        return anchor;
    }

    connect() {
        const wrapper = this.host;
        this.listen(wrapper, MENU_SELECT_EVENT, (event) => this.onSelect(/** @type {CustomEvent} */ (event)));
        this.listen(wrapper, MENU_CLOSE_EVENT, () => this.onClose());
        // A press in the menu is the menu's: the element round it (a row that opens on a click) hears nothing of it.
        this.listen(wrapper, 'click', (event) => event.stopPropagation());
        const menu = /** @type {HTMLElement} */ (wrapper.lastElementChild);
        const view = wrapper.ownerDocument.defaultView;
        if (view && 'MutationObserver' in view) this.observe(new view.MutationObserver(() => this.park())).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
        this.own(() => {
            this.unscroll?.();
            controllerOf(wrapper, MenuButtonControl)?.destroy();
            wrapper.remove();
        });
    }

    /** Whether the menu is open now. */
    isOpen() {
        return menus.get(this.host)?.open === true;
    }

    /** Open the menu for an element at a point in window coordinates. @param {OpenRequest} request */
    open({ el, groups, source, x, y, how, label }) {
        const wrapper = this.host;
        if (this.isOpen()) closeMenu(wrapper);
        this.target = el;
        this.source = source;
        const active = el.ownerDocument.activeElement;
        this.returnTo = active instanceof HTMLElement && active !== el.ownerDocument.body && !wrapper.contains(active) ? active : el;
        setMenu(wrapper, groups);
        /** @type {HTMLElement} */ (wrapper.lastElementChild).setAttribute('aria-label', label);
        /** @type {HTMLElement} */ (wrapper.firstElementChild).setAttribute('aria-label', label);
        if (el.matches(NO_CHILD)) el.after(wrapper);
        else el.append(wrapper);
        this.place(x, y);
        openMenu(wrapper, { focus: 'first' });
        this.watchScroll();
        el.dispatchEvent(new CustomEvent(CONTEXT_OPEN_EVENT, { bubbles: true, detail: { x, y, source: how } }));
    }

    /**
     * Stand the invisible button at the point. Fixed, then corrected by what was measured: an ancestor with a transform makes
     * `fixed` count from its own box instead of the window's.
     * @param {number} x @param {number} y
     */
    place(x, y) {
        const style = this.host.style;
        style.setProperty('left', `${x}px`);
        style.setProperty('top', `${y}px`);
        const box = this.host.getBoundingClientRect();
        style.setProperty('left', `${x + (x - box.left)}px`);
        style.setProperty('top', `${y + (y - box.top)}px`);
    }

    /** A scroll of the page moves the element away from the menu: the menu closes, as a system menu does. */
    watchScroll() {
        const view = this.host.ownerDocument.defaultView;
        if (!view) return;
        /** @param {Event} event */
        const onScroll = (event) => {
            if (event.target instanceof Node && this.host.contains(event.target)) return;
            closeMenu(this.host);
        };
        view.addEventListener('scroll', onScroll, { capture: true, passive: true });
        this.unscroll = () => view.removeEventListener('scroll', onScroll, { capture: true });
    }

    /**
     * A pick: the detail names the element (`context`). A menu that shows a menu button's entries reports the pick on that
     * button's wrapper, where the page already listens; cancelling it there keeps the menu open, as on the button.
     * @param {CustomEvent} event
     */
    onSelect(event) {
        event.detail.context = this.target;
        if (!this.source || event.target !== this.host) return;
        event.stopPropagation();
        const go = this.source.dispatchEvent(new CustomEvent(MENU_SELECT_EVENT, { bubbles: true, cancelable: true, detail: event.detail }));
        if (!go) event.preventDefault();
    }

    /** The focus goes back where it was (the menu button's own close put it on the invisible button). */
    onClose() {
        this.unscroll?.();
        this.unscroll = null;
        const doc = this.host.ownerDocument;
        const lost = doc.activeElement === null || doc.activeElement === doc.body || this.host.contains(doc.activeElement);
        if (lost && this.returnTo?.isConnected) this.returnTo.focus({ preventScroll: true });
    }

    /** Once closed and hidden, the menu leaves the element it served. */
    park() {
        const menu = /** @type {HTMLElement} */ (this.host.lastElementChild);
        if (menu.hidden && !this.isOpen()) this.host.remove();
    }
}
