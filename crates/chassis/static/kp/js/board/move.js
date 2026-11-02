// "Move to" for a board's cards [uxtouch1101]: the lanes a card can go to, as a group of its own menu (the ⋯ menu button and,
// through `data-kp-context-menu="inner"`, its context menu), and the move a pick makes. On a phone the board shows one lane at a
// time, so a card cannot be dragged into a lane that is not on screen; its menu is how it moves, on every width alike.
//
// A card whose ⋯ menu the page filled with setMenu() gets the group in front of the page's own (moving is the board's verb), and
// again whenever the counts change, so each lane's line says what it holds now. A page that builds its own menu (setContextMenu
// with a function) asks for the group with boardMoveGroup(). `data-kp-board-move="off"` on the board leaves every menu alone.

import { controllerOf } from '../controller.js';
import { MENU_SELECT_EVENT } from '../menu-button/constants.js';
import { filled } from '../menu-button/model.js';
import { setMenu } from '../menu-button/open.js';
import { ReorderControl } from '../structure/reorder.js';
import { BoardLanes } from './lanes.js';
import { MOVE_PREFIX, itemsOf, limitOf } from './values.js';

/** @typedef {import('../menu-button.js').MenuGroup} MenuGroup */

/** Whether a menu group is the board's own "Move to" group. @param {MenuGroup} group */
const isMoveGroup = (group) => group.items.length > 0 && group.items.every((item) => item.value?.startsWith(MOVE_PREFIX));

export class BoardMoves extends BoardLanes {
    /** @param {HTMLElement} el @param {{ strings?: Partial<import('../strings.js').Strings> }} [options] */
    constructor(el, options = {}) {
        super(el, options);
        /** Set while a menu move runs, so the narrow board keeps the lane the reader is working in. */
        this.menuMove = false;
    }

    /** Listen for picks in the cards' menus; called from the board's connect(). */
    wireMoves() {
        this.listen(this.host, MENU_SELECT_EVENT, (event) => this.onMovePick(/** @type {CustomEvent} */ (event)));
    }

    count() {
        super.count();
        this.syncMenus();
    }

    /** The lane that holds a card. @param {Element} card @returns {HTMLElement | undefined} */
    laneOf(card) {
        return this.lanes.find((lane) => lane.contains(card));
    }

    /**
     * The "Move to" group for a card: every other lane with what it holds now; null when there is nowhere to go.
     * @param {HTMLElement} card @returns {MenuGroup | null}
     */
    moveGroup(card) {
        const home = this.laneOf(card);
        const items = this.lanes
            .filter((lane) => lane !== home)
            .map((lane) => {
                const list = BoardLanes.listOf(lane);
                const key = BoardLanes.keyOf(lane);
                return { label: lane.dataset.kpBoardLabel ?? key, hint: this.strings.boardMoveHint(list ? itemsOf(list).length : 0, limitOf(lane)), value: `${MOVE_PREFIX}${key}` };
            });
        return items.length > 0 ? { group: this.strings.boardMoveTo, items } : null;
    }

    /** Every card's own menu gets the group in front of the page's entries (a menu that shows the same is skipped by setMenu). */
    syncMenus() {
        if (this.host.dataset.kpBoardMove === 'off') return;
        for (const lane of this.lanes) {
            const list = BoardLanes.listOf(lane);
            for (const card of list ? itemsOf(list) : []) {
                const wrapper = /** @type {HTMLElement | null} */ (card.querySelector('[data-kp-menu-button]'));
                const own = wrapper ? filled.get(wrapper) : undefined;
                if (!wrapper || !Array.isArray(own)) continue;
                const group = this.moveGroup(/** @type {HTMLElement} */ (card));
                setMenu(wrapper, [...(group ? [group] : []), ...own.filter((g) => !isMoveGroup(g))]);
            }
        }
    }

    /** A pick of a "Move to" entry, from a card's ⋯ menu or its context menu. @param {CustomEvent} event */
    onMovePick(event) {
        const value = String(event.detail?.value ?? '');
        if (!value.startsWith(MOVE_PREFIX)) return;
        const from = event.detail?.context instanceof Element ? event.detail.context : event.target;
        const card = from instanceof Element ? /** @type {HTMLElement | null} */ (from.closest('[data-kp-item]')) : null;
        if (card && this.host.contains(card)) this.move(card, value.slice(MOVE_PREFIX.length));
    }

    /**
     * Send a card to the end of a lane, said in words; the reorder list reports it as `kp-reorder` with `fromList` / `toList`.
     * @param {HTMLElement} card @param {string} key the lane's key @returns {boolean} whether it moved
     */
    move(card, key) {
        const lane = this.lanes.find((one) => BoardLanes.keyOf(one) === key);
        const list = lane ? BoardLanes.listOf(lane) : null;
        const control = list ? controllerOf(list, ReorderControl) : undefined;
        const source = card.parentElement;
        if (!lane || !list || !control || source === list) return false;
        const at = source ? itemsOf(source).indexOf(card) : -1;
        this.menuMove = true;
        try {
            control.receive(card, list.children.length);
        } finally {
            this.menuMove = false;
        }
        // Counted now rather than by the observer, so going over the limit is said in the same sentence as the move.
        this.count();
        const n = itemsOf(list).length;
        const limit = limitOf(lane);
        const label = lane.dataset.kpBoardLabel ?? key;
        const moved = this.strings.boardMovedSaid(ReorderControl.nameOf(card), label, n, limit);
        this.live.textContent = limit > 0 && n > limit ? `${moved}. ${this.strings.boardOverSaid(label, n, limit)}` : moved;
        // After the menu has closed and put the focus back on its button, which may now stand in a lane that is not shown.
        queueMicrotask(() => this.refocus(card, source, at));
        return true;
    }

    /**
     * The focus after a menu move: the card itself where it can be seen, else the card that took its place, the one before it,
     * or the lane's button in the switcher.
     * @param {HTMLElement} card @param {HTMLElement | null} source @param {number} at
     */
    refocus(card, source, at) {
        const target = card.closest('[hidden]') === null ? card : source ? (itemsOf(source)[at] ?? itemsOf(source)[at - 1]) : undefined;
        const focusable = target?.querySelector('[data-kp-menu-button] > button, [data-kp-handle], button, a[href]');
        if (focusable instanceof HTMLElement) focusable.focus();
        else this.focusSwitcher();
    }

    /** The switcher's button of the lane shown; the board controller draws the switcher. */
    focusSwitcher() {}
}
