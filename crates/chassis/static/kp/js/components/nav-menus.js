// Opens, closes and keys the navigation dropdowns.
import { Controller, attachOne } from '../controller.js';
import { getStrings } from '../strings.js';
import { NAV_OWNED } from './nav-toggle.js';
import { DROPDOWN, placeNavMenu, placeNavPanel } from './nav-place.js';

const MS_PER_SECOND = 1000;

/**
 * Wire every bar's dropdowns and mega menus [fix-27, scope-48].
 *
 * Dropdowns open on hover and on focus within, in CSS; this only places an
 * open one so it stays in the window (`placeNavMenu`), when it opens and
 * again when the window changes size.
 *
 * A mega menu is a `data-kp-nav-disclosure` button beside a
 * `.kp-nav__menu--wide` panel. The button gets `aria-expanded` and an
 * `aria-controls` naming the panel (an id is given when the panel has
 * none), and the panel shows while it says `true`. Every open state has a
 * way out [KT6]: the button again, Escape while the focus is in the bar
 * (the focus goes back to the button), a click outside the item, and the
 * focus leaving it. One panel is open at a time: opening one closes the
 * others. A button with no words of its own is named from the dictionary
 * (`navDisclosure`). The React NavBar wires its own bar and marks it
 * `data-kp-nav-owner`, so this module leaves that bar alone [AR29].
 *
 * @param {ParentNode} root
 * @param {{ strings?: Partial<import('../strings.js').Strings>, ownedBy?: string }} [options]
 * @returns {() => void} detach
 */
export function attachNavMenus(root = document, { strings, ownedBy = NAV_OWNED } = {}) {
    const navs = /** @type {HTMLElement[]} */ ([...(root instanceof Element && root.matches('.kp-nav') ? [root] : []), ...root.querySelectorAll('.kp-nav')]);
    // A bar the React NavBar owns is left alone; one marked attached is wired already.
    const made = navs
        .filter((nav) => !(ownedBy !== '' && nav.matches(ownedBy)) && !('kpNavMenusAttached' in nav.dataset))
        .map((nav) => attachOne(nav, NavMenusControl, { strings }));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}

/** @param {EventTarget | null} target */
const itemOf = (target) => (target instanceof Element ? target.closest('.kp-nav__links > li') : null);

/** One bar's dropdowns and mega menus: its disclosure buttons, each with its panel and the attributes it stamped. */
class NavMenusControl extends Controller {
    /** @param {HTMLElement} host @param {{ strings?: Partial<import('../strings.js').Strings> }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.strings = options.strings;
        /** The bar's mega menu buttons. */
        this.buttons = /** @type {HTMLElement[]} */ ([...host.querySelectorAll('[data-kp-nav-disclosure]')]);
        /** Each button's panel and the attributes this controller stamped on it. @type {Map<HTMLElement, { panel: Element | null, stamped: string[] }>} */
        this.wired = new Map();
    }

    connect() {
        const nav = this.host;
        nav.dataset.kpNavMenusAttached = '';
        // Registered first, so it runs last: what the bar was given goes after the listeners.
        this.own(() => this.unstamp());
        for (const button of this.buttons) this.stamp(button);
        this.listen(nav, 'pointerover', (event) => this.onEnter(event));
        this.listen(nav, 'focusin', (event) => this.onEnter(event));
        this.listen(nav, 'pointerover', (event) => this.onReturn(event));
        this.listen(nav, 'focusin', (event) => this.onReturn(event));
        this.listen(nav, 'pointerout', (event) => this.onLeave(event));
        this.listen(nav, 'focusout', (event) => this.onLeave(event));
        this.listen(nav, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(nav, 'focusout', (event) => this.onFocusOut(/** @type {FocusEvent} */ (event)));
        for (const button of this.buttons) this.listen(button, 'click', () => this.set(button, button.getAttribute('aria-expanded') !== 'true'));
        this.listen(document, 'click', (event) => this.onOutside(event), true);
        this.listen(window, 'resize', () => this.placeOpen());
        this.placeOpen();
    }

    /**
     * Give a mega menu button its `aria-expanded`, an `aria-controls` naming its panel (an id is given when the panel has none),
     * and a name from the dictionary when it has no words of its own.
     * @param {HTMLElement} button
     */
    stamp(button) {
        const panel = button.parentElement?.querySelector(':scope > .kp-nav__menu--wide') ?? null;
        /** @type {string[]} */
        const stamped = ['aria-expanded'];
        if (panel && !panel.id) panel.id = `kp-nav-panel-${Math.random().toString(36).slice(2, 10)}`;
        if (panel && !button.hasAttribute('aria-controls')) {
            button.setAttribute('aria-controls', panel.id);
            stamped.push('aria-controls');
        }
        if (!(button.textContent ?? '').trim() && !button.hasAttribute('aria-label') && !button.hasAttribute('aria-labelledby')) {
            button.setAttribute('aria-label', { ...getStrings(), ...this.strings }.navDisclosure);
            stamped.push('aria-label');
        }
        button.setAttribute('aria-expanded', 'false');
        this.wired.set(button, { panel, stamped });
    }

    /** Take back what the bar was given: the stamped attributes, the placements and the attached mark. */
    unstamp() {
        const nav = this.host;
        for (const [button, { stamped }] of this.wired) for (const name of stamped) button.removeAttribute(name);
        for (const menu of nav.querySelectorAll('[data-kp-nav-menu-end]')) menu.removeAttribute('data-kp-nav-menu-end');
        for (const menu of nav.querySelectorAll('.kp-nav__menu')) /** @type {HTMLElement} */ (menu).style.removeProperty('--kp-nav-menu-shift');
        for (const panel of nav.querySelectorAll('.kp-nav__menu--wide')) {
            /** @type {HTMLElement} */ (panel).style.removeProperty('--kp-nav-mega-start');
            /** @type {HTMLElement} */ (panel).style.removeProperty('--kp-nav-mega-end');
        }
        delete nav.dataset.kpNavMenusAttached;
    }

    /** Place every open dropdown and mega panel inside the window. */
    placeOpen() {
        const nav = this.host;
        for (const item of nav.querySelectorAll('.kp-nav__links > li')) if (item.querySelector(DROPDOWN)) placeNavMenu(item, false);
        for (const panel of nav.querySelectorAll('.kp-nav__links > li > .kp-nav__menu--wide')) placeNavPanel(panel);
    }

    /** The mega menu button that is open, if one is. */
    openButton() {
        return this.buttons.find((b) => b.getAttribute('aria-expanded') === 'true') ?? null;
    }

    /** Open or close one mega menu; opening one closes the others. @param {HTMLElement} button @param {boolean} open */
    set(button, open) {
        if (open) for (const other of this.buttons) if (other !== button && other.getAttribute('aria-expanded') === 'true') this.set(other, false);
        const was = button.getAttribute('aria-expanded') === 'true';
        const panel = this.wired.get(button)?.panel;
        const item = button.parentElement;
        if (open) item?.removeAttribute('data-kp-nav-closing');
        button.setAttribute('aria-expanded', String(open));
        if (open && panel) placeNavPanel(panel);
        if (!open && was && item) settleClosing(item, panel);
    }

    /** @param {Event} event */
    onEnter(event) {
        const item = itemOf(event.target);
        if (item && this.host.contains(item) && item.querySelector(DROPDOWN)) placeNavMenu(item);
    }

    /**
     * A dropdown that opens on hover and focus closes in CSS, the instant the pointer or the focus leaves, which no engine can hold
     * open for a close that plays (Firefox does not hold `display`). A register that plays one (`--kp-nav-close-time`, cyberpunk)
     * gets the same hold as the mega menu: the item is marked while the close plays.
     * @param {Event} event
     */
    onLeave(event) {
        const nav = this.host;
        const raw = getComputedStyle(nav).getPropertyValue('--kp-nav-close-time').trim();
        if (raw === '') return;
        const item = itemOf(event.target);
        if (!item || !nav.contains(item) || !item.querySelector(DROPDOWN) || !leavesItem(item, event)) return;
        // Held for the close's own time, not for a transition: the pointer's `:hover` may not have changed yet when this runs, so
        // none has begun.
        const ms = raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * MS_PER_SECOND;
        if (!(ms > 0)) return;
        item.setAttribute('data-kp-nav-closing', '');
        setTimeout(() => {
            if (!item.matches(':hover, :focus-within, [data-kp-nav-menu-open]')) item.removeAttribute('data-kp-nav-closing');
        }, ms || 0);
    }

    /** @param {Event} event */
    onReturn(event) {
        const item = itemOf(event.target);
        if (item?.hasAttribute('data-kp-nav-closing') && item.querySelector(DROPDOWN)) item.removeAttribute('data-kp-nav-closing');
    }

    /** Escape in the bar closes the open mega menu and puts the focus back on its button. @param {KeyboardEvent} event */
    onKey(event) {
        const button = this.openButton();
        if (event.key !== 'Escape' || !button) return;
        this.set(button, false);
        button.focus();
    }

    /** @param {Event} event */
    onOutside(event) {
        const button = this.openButton();
        if (!button || button.parentElement?.contains(/** @type {Node} */ (event.target))) return;
        this.set(button, false);
    }

    /** @param {FocusEvent} event */
    onFocusOut(event) {
        const button = this.openButton();
        const to = event.relatedTarget;
        // A press on the panel's ground moves the focus nowhere; that is not leaving.
        if (!button || !(to instanceof Node)) return;
        if (button.parentElement?.contains(to)) return;
        this.set(button, false);
    }
}

/**
 * Whether `event` really leaves the item's dropdown: not into the item itself, and not while the other way in (hover or focus)
 * or the menu's own open mark still holds it. The state is read before the leaving event's own effect lands, so only the other
 * way in counts.
 * @param {Element} item
 * @param {Event} event
 */
function leavesItem(item, event) {
    const to = /** @type {FocusEvent | PointerEvent} */ (event).relatedTarget;
    if (to instanceof Node && item.contains(to)) return false;
    if (item.hasAttribute('data-kp-nav-menu-open')) return false;
    return !(event.type === 'pointerout' ? item.matches(':focus-within') : item.matches(':hover'));
}

/**
 * A panel that is closing stays on screen, `[data-kp-nav-closing]` on its item, until the transitions the theme runs to the closed
 * state have played; a panel with none is gone on the next frame, as before.
 * @param {HTMLElement} item
 * @param {Element | null | undefined} panel
 */
function settleClosing(item, panel) {
    item.setAttribute('data-kp-nav-closing', '');
    requestAnimationFrame(() => {
        if (!item.hasAttribute('data-kp-nav-closing')) return;
        const plays = (panel?.getAnimations() ?? []).filter((a) => typeof CSSTransition !== 'undefined' && a instanceof CSSTransition);
        void Promise.all(plays.map((a) => a.finished.catch(() => undefined))).then(() => item.removeAttribute('data-kp-nav-closing'));
    });
}
