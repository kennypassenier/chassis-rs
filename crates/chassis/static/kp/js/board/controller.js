// One wired board: its frame, the narrow layout (one lane under a switcher of every lane with its exact count, or lanes that
// scroll sideways in the board's own box), the switcher and its keys, and the board's states (the busy card over the lanes; the
// package's plate over the whole board). "Move to" in the cards' menus is js/board/move.js.

import { openBusyCard } from '../busy-card.js';
import { hostStatePlate } from '../state-plate.js';
import { attachStructure } from '../structure.js';
import { BoardMoves } from './move.js';
import { BOARD_LANE_EVENT, BOARD_RETRY_EVENT, FALLBACK_REM_PX, NARROW_REM, itemsOf, limitOf, make } from './values.js';

/** @typedef {'loading' | 'ready' | 'empty' | 'error'} BoardState */

export class Board extends BoardMoves {
    /** @param {HTMLElement} el @param {{ strings?: Partial<import('../strings.js').Strings> }} [options] */
    constructor(el, options = {}) {
        super(el, options);
        const doc = el.ownerDocument;
        this.tabs = make(doc, 'div', 'kp-tabs__list kp-board__tabs');
        this.plate = make(doc, 'div', 'kp-board__plate');
        /** The lane a narrow board's switcher shows. */
        this.selected = '';
        /** @type {BoardState} */
        this.state = 'ready';
        this.words = '';
        /** The loading card over the lanes. @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** Whether the first frame has passed: a loading card arrives with motion only after it. */
        this.drawn = false;
    }

    connect() {
        const el = this.host;
        el.classList.add('kp-board');
        this.buildLanes();
        this.tabs.setAttribute('role', 'tablist');
        this.tabs.setAttribute('aria-label', this.strings.boardLanes);
        this.live.setAttribute('role', 'status');
        this.plate.hidden = true;
        el.replaceChildren(this.tabs, this.track, this.plate, this.live);
        this.selected = Board.keyOf(this.lanes[0] ?? el);
        this.drawTabs();
        this.own(attachStructure(this.track));
        this.count();
        this.layout();
        const view = el.ownerDocument.defaultView;
        if (view && 'MutationObserver' in view) this.observe(new view.MutationObserver(() => this.count())).observe(this.track, { childList: true, subtree: true });
        if (view && 'ResizeObserver' in view) this.observe(new view.ResizeObserver(() => this.layout())).observe(el);
        if (view && 'MutationObserver' in view) this.observe(new view.MutationObserver(() => this.adopt())).observe(el, { childList: true });
        this.listen(el, 'kp-reorder', (event) => this.follow(/** @type {CustomEvent} */ (event)));
        this.listen(this.tabs, 'click', (event) => this.onTab(event));
        this.listen(this.tabs, 'keydown', (event) => this.onTabKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(el, 'pointermove', (event) => this.springTab(event));
        this.wireMoves();
        view?.requestAnimationFrame(() => this.markDrawn());
        this.own(() => this.busy?.remove());
    }

    markDrawn() {
        this.drawn = true;
    }

    /** Lanes the page added to the board after it was attached join the track, its tabs, its group and its counts. */
    adopt() {
        if (!this.buildLanes()) return;
        if (!this.lanes.some((lane) => Board.keyOf(lane) === this.selected)) this.selected = Board.keyOf(this.lanes[0] ?? this.host);
        this.drawTabs();
        this.own(attachStructure(this.track));
        this.count();
        this.layout();
    }

    /** Whether the board is narrow now, and whether it shows one lane under the switcher (anything but `scroll`, the default). */
    tabbed() {
        const rem = Number.parseFloat(getComputedStyle(this.host.ownerDocument.documentElement).fontSize) || FALLBACK_REM_PX;
        const narrow = this.host.clientWidth > 0 && this.host.clientWidth < NARROW_REM * rem;
        const tabs = narrow && this.host.dataset.kpBoardNarrow !== 'scroll';
        this.host.toggleAttribute('data-kp-board-narrow-now', narrow);
        this.host.toggleAttribute('data-kp-board-switch', tabs);
        return tabs;
    }

    /** The narrow layout: under the switcher only the chosen lane shows (a tab panel); otherwise every lane, in the track. */
    layout() {
        const tabs = this.tabbed();
        this.tabs.hidden = !tabs;
        for (const lane of this.lanes) {
            lane.hidden = tabs && Board.keyOf(lane) !== this.selected;
            if (tabs) lane.setAttribute('role', 'tabpanel');
            else lane.removeAttribute('role');
        }
    }

    /** One button per lane in the switcher: its name over its exact count (with the limit), on the tab's own count badge. */
    drawTabs() {
        const doc = this.host.ownerDocument;
        this.tabs.replaceChildren(
            ...this.lanes.map((lane) => {
                const tab = make(doc, 'button', 'kp-tab kp-board__tab');
                tab.type = 'button';
                tab.id = `${lane.id}-tab`;
                tab.setAttribute('role', 'tab');
                tab.setAttribute('aria-controls', lane.id);
                tab.dataset.kpBoardTab = Board.keyOf(lane);
                tab.append(make(doc, 'span', 'kp-board__tab-name', lane.dataset.kpBoardLabel ?? Board.keyOf(lane)), make(doc, 'span', 'kp-badge kp-tab__count'));
                return tab;
            }),
        );
        this.markTabs();
    }

    markTabs() {
        for (const tab of /** @type {HTMLElement[]} */ ([...this.tabs.children])) {
            const on = tab.dataset.kpBoardTab === this.selected;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
        }
    }

    countTabs() {
        for (const lane of this.lanes) {
            const list = Board.listOf(lane);
            const tab = this.tabs.querySelector(`[data-kp-board-tab="${CSS.escape(Board.keyOf(lane))}"]`);
            const badge = tab?.querySelector('.kp-tab__count');
            if (!tab || !badge) continue;
            const n = list ? itemsOf(list).length : 0;
            const limit = limitOf(lane);
            const over = limit > 0 && n > limit;
            // Written only when it changes: the board's observer hears its own writes.
            const text = limit > 0 ? `${n} / ${limit}` : String(n);
            if (badge.textContent !== text) badge.textContent = text;
            badge.classList.toggle('kp-badge--destructive', over);
            const label = this.strings.boardTabLabel(lane.dataset.kpBoardLabel ?? Board.keyOf(lane), n, limit, over);
            if (tab.getAttribute('aria-label') !== label) tab.setAttribute('aria-label', label);
        }
    }

    focusSwitcher() {
        const tab = /** @type {HTMLElement | null} */ (this.tabs.querySelector('[aria-selected="true"]'));
        if (tab && !this.tabs.hidden) tab.focus();
    }

    /** Show a lane of a narrow board under its switcher. @param {string} key @param {'pointer' | 'keyboard' | 'move' | 'page'} source */
    select(key, source) {
        if (key === this.selected || !this.lanes.some((lane) => Board.keyOf(lane) === key)) return;
        this.selected = key;
        this.markTabs();
        this.layout();
        this.host.dispatchEvent(new CustomEvent(BOARD_LANE_EVENT, { bubbles: true, detail: { lane: key, source } }));
    }

    /** A card sent to a lane that is not shown: the board shows that lane, so the card and its focus stay in sight. @param {CustomEvent} event */
    follow(event) {
        const { fromList, toList } = event.detail ?? {};
        // A move from the card's menu keeps the lane the reader works in; the switcher's count says where the card went.
        if (typeof toList === 'string' && fromList !== toList && !this.menuMove) this.select(toList, 'move');
    }

    /** @param {Event} event */
    onTab(event) {
        const tab = event.target instanceof Element ? /** @type {HTMLElement | null} */ (event.target.closest('[data-kp-board-tab]')) : null;
        if (tab) this.select(tab.dataset.kpBoardTab ?? '', 'pointer');
    }

    /** ← → Home End between the tabs; the lane follows the focus. @param {KeyboardEvent} event */
    onTabKey(event) {
        const tabs = /** @type {HTMLElement[]} */ ([...this.tabs.children]);
        const at = tabs.findIndex((tab) => tab.dataset.kpBoardTab === this.selected);
        const rtl = getComputedStyle(this.host).direction === 'rtl';
        const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
        const to = step !== undefined ? (at + step + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (to < 0) return;
        event.preventDefault();
        this.select(tabs[to]?.dataset.kpBoardTab ?? '', 'keyboard');
        tabs[to]?.focus();
    }

    /** While a card is dragged, holding it over a tab opens that lane, so the card can be dropped in it. @param {Event} event */
    springTab(event) {
        if (this.tabs.hidden || !this.track.querySelector('[data-kp-dragging]')) return;
        const tab = event.target instanceof Element ? /** @type {HTMLElement | null} */ (event.target.closest('[data-kp-board-tab]')) : null;
        if (tab) this.select(tab.dataset.kpBoardTab ?? '', 'pointer');
    }

    /** @param {BoardState} state @param {string} words */
    setState(state, words) {
        this.state = state;
        this.words = words;
        this.host.dataset.kpState = state;
        this.track.toggleAttribute('aria-busy', state === 'loading');
        this.drawPlate();
        this.drawBusy();
    }

    /** The package's plate over the whole board for an empty or failed board; the lanes under it are not read. */
    drawPlate() {
        const shown = this.state === 'empty' || this.state === 'error' ? this.state : null;
        const s = this.strings;
        this.plate.replaceChildren();
        if (shown)
            this.plate.append(
                hostStatePlate(this.host, {
                    kind: shown,
                    title: shown === 'error' ? s.boardFailed('') : this.words || s.boardEmpty,
                    ...(shown === 'error' && this.words ? { text: this.words } : {}),
                    retryEvent: BOARD_RETRY_EVENT,
                    retryLabel: s.boardRetry,
                }),
            );
        this.plate.hidden = shown === null;
        this.track.toggleAttribute('inert', shown !== null);
        this.tabs.toggleAttribute('inert', shown !== null);
    }

    /** The loading card over the lanes, the data table's own. */
    drawBusy() {
        const want = this.state === 'loading';
        if (want === (this.busy !== null)) return;
        if (!want) {
            const card = /** @type {import('../busy-card.js').BusyCard} */ (this.busy);
            this.busy = null;
            void card.close();
            return;
        }
        this.busy = openBusyCard(this.host, { words: this.strings.boardLoading, area: () => [this.track], className: 'kp-board__busy', arrive: this.drawn });
        this.live.textContent = this.strings.boardLoading;
    }
}
