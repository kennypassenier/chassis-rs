// One root whose `[data-kp-context-menu]` elements open their menu on a right click, a long press on touch, Shift+F10 and the
// context-menu key. Delegated: one set of listeners for every element under the root, also those added later.

import { Controller } from '../controller.js';
import { filled } from '../menu-button/model.js';
import { getStrings } from '../strings.js';
import { ContextAnchor } from './anchor.js';
import { CONTEXT_MENU, INNER, KEY_ECHO_MS, KEY_INSET_PX, LONG_PRESS_MS, OWN_PRESS, PRESS_SLOP_PX } from './values.js';

/** @typedef {import('../menu-button.js').MenuGroup} MenuGroup */
/** @typedef {MenuGroup[] | ((el: HTMLElement) => MenuGroup[])} ContextGroups */

/** The entries a page gave each element with setContextMenu(). @type {WeakMap<Element, ContextGroups>} */
export const given = new WeakMap();

/** Events a root already answered, so a root inside another root does not open the menu twice. @type {WeakSet<Event>} */
const answered = new WeakSet();

/**
 * What an element's menu shows, and the menu button it borrows them from (`inner`, or the id of a menu button), if any.
 * @param {HTMLElement} el
 * @returns {{ groups: MenuGroup[], source: HTMLElement | null }}
 */
export function menuFor(el) {
    const value = el.getAttribute('data-kp-context-menu') ?? '';
    if (value !== '') {
        const source = /** @type {HTMLElement | null} */ (value === INNER ? el.querySelector('[data-kp-menu-button]') : el.ownerDocument.getElementById(value));
        return { groups: (source && filled.get(source)) ?? [], source };
    }
    const own = given.get(el);
    return { groups: typeof own === 'function' ? own(el) : (own ?? []), source: null };
}

/** Whether a menu holds anything to pick. @param {MenuGroup[]} groups */
const hasItems = (groups) => groups.some((group) => group.items.length > 0);

export class ContextMenuRoot extends Controller {
    /** @param {HTMLElement} root @param {Record<string, unknown>} [options] */
    constructor(root, options) {
        super(root, options);
        /** A long press on its way. @type {ReturnType<typeof setTimeout> | null} */
        this.hold = null;
        this.pressAt = { x: 0, y: 0 };
        /** Whether the last press opened the menu, so the click its release makes is not a pick or an outside click. */
        this.pressOpened = false;
        /** When a key last opened a menu, to tell the key's own `contextmenu` echo from a new request. */
        this.keyAt = Number.NEGATIVE_INFINITY;
    }

    connect() {
        const root = this.host;
        this.listen(root, 'contextmenu', (event) => this.onContext(/** @type {MouseEvent} */ (event)));
        this.listen(root, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(root, 'pointerdown', (event) => this.onPressStart(/** @type {PointerEvent} */ (event)));
        this.listen(root, 'pointermove', (event) => this.onPressMove(/** @type {PointerEvent} */ (event)));
        for (const type of ['pointerup', 'pointercancel']) this.listen(root, type, () => this.cancelPress());
        const view = root.ownerDocument.defaultView;
        // On the window, in the capture phase: before the menu's own outside-click closes what the press just opened.
        if (view) this.listen(view, 'click', (event) => this.swallowRelease(event), true);
        this.own(() => this.cancelPress());
    }

    /** The element with a context menu an event is about, unless it happened in the open menu. @param {Event} event */
    elementOf(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || answered.has(event) || target.closest('.kp-context-menu')) return null;
        const el = target.closest(CONTEXT_MENU);
        return el instanceof HTMLElement && this.host.contains(el) ? el : null;
    }

    /**
     * Open the element's menu at a point; nothing when it has no entries (the browser's own menu then stays).
     * @param {HTMLElement} el @param {number} x @param {number} y @param {'pointer' | 'touch' | 'keyboard'} how
     * @returns {boolean} whether it opened
     */
    openAt(el, x, y, how) {
        const { groups, source } = menuFor(el);
        if (!hasItems(groups)) return false;
        const label = el.getAttribute('data-kp-context-menu-label') ?? getStrings().contextMenuLabel;
        ContextAnchor.of(el.ownerDocument).open({ el, groups, source, x, y, how, label });
        return true;
    }

    /** A right click (Shift keeps the browser's own menu), or the key's echo. @param {MouseEvent} event */
    onContext(event) {
        const el = this.elementOf(event);
        if (!el || event.shiftKey) return;
        answered.add(event);
        if (performance.now() - this.keyAt < KEY_ECHO_MS || this.pressOpened) {
            event.preventDefault();
            return;
        }
        // A long press on Android sends this before the timer is up: it opens now, once.
        const how = this.hold !== null ? 'touch' : 'pointer';
        this.cancelPress();
        if (this.openAt(el, event.clientX, event.clientY, how)) {
            event.preventDefault();
            if (how === 'touch') this.pressOpened = true;
        }
    }

    /** Shift+F10 or the context-menu key: the menu hangs from the focused element's start edge. @param {KeyboardEvent} event */
    onKey(event) {
        const asked = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey);
        if (!asked) return;
        const el = this.elementOf(event);
        if (!el) return;
        answered.add(event);
        const focused = event.target instanceof HTMLElement ? event.target : el;
        const box = focused.getBoundingClientRect();
        const rtl = getComputedStyle(focused).direction === 'rtl';
        const inset = Math.min(KEY_INSET_PX, box.width / 2);
        if (this.openAt(el, rtl ? box.right - inset : box.left + inset, box.bottom, 'keyboard')) {
            event.preventDefault();
            this.keyAt = performance.now();
        }
    }

    /** Whether a long press on this element may open its menu: `data-kp-context-press`, by default off inside row picking. @param {HTMLElement} el */
    static pressAllowed(el) {
        const press = el.getAttribute('data-kp-context-press');
        if (press === 'off') return false;
        return press === 'on' || el.closest('[data-kp-row-pick]') === null;
    }

    /** A finger or a pen held still for LONG_PRESS_MS opens the menu where it is. @param {PointerEvent} event */
    onPressStart(event) {
        this.cancelPress();
        this.pressOpened = false;
        if (event.pointerType === 'mouse' || !event.isPrimary) return;
        const el = this.elementOf(event);
        if (!el || !ContextMenuRoot.pressAllowed(el) || (event.target instanceof Element && event.target.closest(OWN_PRESS))) return;
        this.pressAt = { x: event.clientX, y: event.clientY };
        this.hold = setTimeout(() => {
            this.hold = null;
            this.pressOpened = this.openAt(el, this.pressAt.x, this.pressAt.y, 'touch');
        }, LONG_PRESS_MS);
    }

    /** @param {PointerEvent} event */
    onPressMove(event) {
        if (Math.hypot(event.clientX - this.pressAt.x, event.clientY - this.pressAt.y) > PRESS_SLOP_PX) this.cancelPress();
    }

    cancelPress() {
        if (this.hold) clearTimeout(this.hold);
        this.hold = null;
    }

    /** The click the finger's release makes after a long press opened the menu is no click at all. @param {Event} event */
    swallowRelease(event) {
        if (!this.pressOpened) return;
        this.pressOpened = false;
        if (event.target instanceof Element && event.target.closest('.kp-context-menu')) return;
        event.preventDefault();
        event.stopPropagation();
    }
}
