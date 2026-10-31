// One master-detail layout: the list as a listbox, the selection, opening and closing the folded detail, history, keys and states [kpadopt5-ops].

import { Controller } from '../controller.js';
import { scrollWithin } from '../listbox.js';
import { arriveShown } from '../motion.js';
import {
    DEFAULT_LIST_WIDTH,
    ITEM,
    PANE_ASIDE_WIDTH,
    PANE_CLOSE_EVENT,
    PANE_OPEN_EVENT,
    PANE_RETRY_EVENT,
    PANE_SELECT_EVENT,
    PANE_WIDTHS,
} from './constants.js';
import { DetailState } from './detail-state.js';
import { Folding } from './folding.js';
import { columns, DetailParts, paneOf } from './parts.js';

/**
 * The controller of one `[data-kp-master-detail]` layout that has a detail pane and a window, and a list pane, or, without one, an
 * aside: the detail + aside variant [homelab gap 73], where the detail always shows and only the aside folds.
 */
export class MasterDetailController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {{ history?: boolean }} [options] `history: false` leaves the browser's history alone
     */
    constructor(host, options = {}) {
        super(host, options);
        this.doc = host.ownerDocument;
        this.view = /** @type {Window} */ (this.doc.defaultView);
        /** The list pane, or null in the detail + aside variant. */
        this.list = paneOf(host, 'list');
        this.detail = /** @type {HTMLElement} */ (paneOf(host, 'detail'));
        this.aside = paneOf(host, 'aside');
        this.useHistory = options.history ?? host.getAttribute('data-kp-pane-history') !== 'off';
        this.folding = new Folding(host, this.list === null);
        this.parts = new DetailParts(this.detail);
        this.detailState = new DetailState(host, this.detail, this.parts);
        /** The key of the selected item. @type {string | null} */
        this.selected = null;
        /** The item that opened the detail, to give the focus back to. @type {HTMLElement | null} */
        this.opener = null;
        this.listScroll = 0;
        /** Whether a history entry was pushed for the open detail. */
        this.pushed = false;
        /** What a page gets back from masterDetail(). @type {import('./constants.js').MasterDetailHandle} */
        this.handle = {
            element: host,
            key: () => this.selected,
            select: (key, how) => this.select(key, how),
            open: (key, how) => this.open(key, how),
            close: () => this.close(),
            narrow: () => this.folding.narrow,
            setState: (next, how) => this.detailState.setState(next, how),
        };
    }

    connect() {
        const root = this.host;
        root.toggleAttribute('data-kp-pane-listless', this.list === null);
        this.setColumns();
        this.readItems();
        this.folding.measure();
        this.parts.mount();
        this.listen(root, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(root, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.view, 'popstate', () => this.onPop());
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(() => this.onSize())).observe(root);
        this.observe(new MutationObserver(() => this.sync())).observe(root, { attributes: true, attributeFilter: ['data-kp-narrow'] });
        this.own(() => this.undoMarks());
        this.own(() => this.detailState.release());
        this.paint();
        this.sync();
        // Nothing selected: the detail says what to do rather than stand blank. Without a list there is nothing to select: the detail is ready.
        if (!this.selected && !root.hasAttribute('data-kp-state') && this.list) this.detailState.setState('empty');
        else if (root.hasAttribute('data-kp-state')) this.detailState.setState(/** @type {import('./constants.js').PaneState} */ (root.getAttribute('data-kp-state')));
    }

    /** The columns, from `data-kp-pane-widths` or the defaults. */
    setColumns() {
        const root = this.host;
        const fallback = this.list ? (this.aside ? `${PANE_WIDTHS} ${PANE_ASIDE_WIDTH}` : PANE_WIDTHS) : this.aside ? `1fr ${PANE_ASIDE_WIDTH}` : '1fr';
        const widths = root.getAttribute('data-kp-pane-widths') ?? fallback;
        root.style.setProperty('--kp-pane-columns', columns(widths));
        if (!this.list) return;
        const [listWidth = DEFAULT_LIST_WIDTH] = widths.trim().split(/\s+/);
        root.style.setProperty('--kp-pane-list', listWidth);
    }

    /** The list as a listbox: roles on the list and its items, and the item the markup already selected. */
    readItems() {
        if (!this.list) return;
        const listbox = /** @type {HTMLElement} */ (this.list.querySelector('[role="listbox"]') ?? this.list);
        if (!listbox.hasAttribute('role')) listbox.setAttribute('role', 'listbox');
        for (const item of this.items()) {
            if (!item.hasAttribute('role')) item.setAttribute('role', 'option');
            if (item.getAttribute('aria-selected') === 'true' || item.hasAttribute('data-kp-selected')) this.selected = item.getAttribute('data-kp-pane-key');
        }
    }

    /** Take the marks the layout wrote away. */
    undoMarks() {
        const root = this.host;
        root.removeAttribute('data-kp-pane-shown');
        root.removeAttribute('data-kp-narrow-on');
        root.removeAttribute('data-kp-aside-folded');
        root.removeAttribute('data-kp-pane-listless');
        root.style.removeProperty('--kp-pane-columns');
        root.style.removeProperty('--kp-pane-list');
    }

    items() {
        return /** @type {HTMLElement[]} */ (this.list ? [...this.list.querySelectorAll(ITEM)] : []);
    }

    /** @param {string | null} key */
    itemOf(key) {
        return this.items().find((i) => i.getAttribute('data-kp-pane-key') === key) ?? null;
    }

    /** Mark the selected item and give the roving tab stop to it (or the first). */
    paint() {
        const all = this.items();
        const current = this.itemOf(this.selected) ?? all[0] ?? null;
        for (const item of all) {
            const on = item.getAttribute('data-kp-pane-key') === this.selected;
            item.setAttribute('aria-selected', on ? 'true' : 'false');
            item.toggleAttribute('data-kp-selected', on);
            item.tabIndex = item === current ? 0 : -1;
        }
    }

    /** Write the fold marks on the layout, and let the loading look follow the pane on screen. */
    sync() {
        const root = this.host;
        const { narrow, asideNarrow, shown } = this.folding;
        root.toggleAttribute('data-kp-narrow-on', narrow);
        root.toggleAttribute('data-kp-aside-folded', Boolean(this.aside) && asideNarrow && !narrow);
        if (this.folding.oneAtATime()) root.setAttribute('data-kp-pane-shown', shown);
        else root.removeAttribute('data-kp-pane-shown');
        this.detailState.reseatBusy();
    }

    // --- Moving about. ---
    /** Select an item (without opening the detail). @param {string | null} key @param {{ focus?: boolean }} [how] */
    select(key, how = {}) {
        const item = this.itemOf(key);
        this.selected = item ? key : null;
        this.paint();
        if (item && how.focus) item.focus({ preventScroll: false });
        if (item) scrollWithin(item); // the pane's own scroller only, never the window
        this.host.dispatchEvent(new CustomEvent(PANE_SELECT_EVENT, { bubbles: true, detail: { key: this.selected, item } }));
    }

    heading() {
        return /** @type {HTMLElement | null} */ (this.detail.querySelector('[data-kp-pane-heading], h1, h2, h3, h4'));
    }

    /** Select an item and, folded, show the detail in its place. @param {string} key @param {{ focus?: boolean }} [how] */
    open(key, how = {}) {
        const item = this.itemOf(key);
        if (!item) return;
        if (this.selected !== key) this.select(key);
        if (this.folding.oneAtATime() && this.folding.shown !== 'detail') this.showDetail(key, item);
        else if (how.focus) this.heading()?.focus({ preventScroll: true });
        this.host.dispatchEvent(new CustomEvent(PANE_OPEN_EVENT, { bubbles: true, detail: { key, item } }));
    }

    /** The detail replaces the list: arrive, push a history entry, focus the heading. @param {string} key @param {HTMLElement} item */
    showDetail(key, item) {
        this.opener = item;
        this.listScroll = this.list?.scrollTop ?? 0;
        this.folding.shown = 'detail';
        this.sync();
        arriveShown(this.detail);
        if (this.useHistory && !this.pushed) {
            try {
                this.view.history.pushState({ kpPane: key }, '');
                this.pushed = true;
            } catch {
                // A document without history (a sandboxed frame): the Back button still works.
            }
        }
        const target = this.heading();
        if (target) {
            target.tabIndex = -1;
            target.focus({ preventScroll: true });
        }
    }

    /** Show the list again (folded). @param {{ fromHistory?: boolean }} [how] */
    close({ fromHistory = false } = {}) {
        if (!(this.folding.oneAtATime() && this.folding.shown === 'detail')) return;
        this.folding.shown = 'list';
        this.sync();
        if (this.list) {
            arriveShown(this.list);
            this.list.scrollTop = this.listScroll;
        }
        if (this.pushed && !fromHistory) {
            this.pushed = false;
            try {
                this.view.history.back();
            } catch {
                // nothing to go back to
            }
        }
        this.pushed = false;
        const key = this.selected;
        (this.opener ?? this.itemOf(key))?.focus({ preventScroll: true });
        this.host.dispatchEvent(new CustomEvent(PANE_CLOSE_EVENT, { bubbles: true, detail: { pane: 'detail', key } }));
    }

    // --- Events. ---
    /** @param {MouseEvent} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-kp-pane-retry]') && this.detail.contains(target)) {
            this.host.dispatchEvent(new CustomEvent(PANE_RETRY_EVENT, { bubbles: true, detail: { key: this.selected } }));
            return;
        }
        if (target.closest('.kp-pane__back') === this.parts.back) {
            this.close();
            return;
        }
        const item = target.closest(ITEM);
        if (item instanceof HTMLElement && this.list?.contains(item)) this.open(item.getAttribute('data-kp-pane-key') ?? '');
    }

    /** The arrow keys, Home and End move the selection; Enter and Space open; Esc closes the aside or the folded detail. @param {KeyboardEvent} event */
    onKey(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const item = target.closest(ITEM);
        if (item instanceof HTMLElement && this.list?.contains(item)) {
            this.onItemKey(event, item);
            return;
        }
        if (event.key !== 'Escape') return;
        const aside = this.aside;
        if (aside && aside.contains(target) && this.host.hasAttribute('data-kp-aside-closable')) {
            event.preventDefault();
            aside.hidden = true;
            this.host.dispatchEvent(new CustomEvent(PANE_CLOSE_EVENT, { bubbles: true, detail: { pane: 'aside', key: this.selected } }));
        } else if (this.detail.contains(target) && this.folding.narrow && this.folding.shown === 'detail') {
            event.preventDefault();
            this.close();
        }
    }

    /** A key on a list item: move, jump, or open. @param {KeyboardEvent} event @param {HTMLElement} item */
    onItemKey(event, item) {
        const all = this.items();
        const at = all.indexOf(item);
        let to = -1;
        if (event.key === 'ArrowDown') to = Math.min(all.length - 1, at + 1);
        else if (event.key === 'ArrowUp') to = Math.max(0, at - 1);
        else if (event.key === 'Home') to = 0;
        else if (event.key === 'End') to = all.length - 1;
        if (to >= 0) {
            event.preventDefault();
            const next = all[to];
            if (next) this.select(next.getAttribute('data-kp-pane-key'), { focus: true });
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.open(item.getAttribute('data-kp-pane-key') ?? '', { focus: true });
        }
    }

    onPop() {
        if (this.pushed || this.folding.shown === 'detail') this.close({ fromHistory: true });
    }

    onSize() {
        if (this.folding.widthNow() <= 0) return;
        this.folding.resize();
        this.sync();
    }
}
