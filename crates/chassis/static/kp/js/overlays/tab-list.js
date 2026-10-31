// One tab list: its selection, the panels on their way out, the keys and what attach changed, so detach can put it back.
import { Controller } from '../controller.js';
import { leave, leavesState } from '../motion.js';
import { TAB_CHANGE_EVENT } from './constants.js';
import { revealTab, watchTabOverflow } from './tab-row.js';

/** How long (ms) a panel arriving beside one that leaves stays marked as swapping. */
const SWAP_MARK_MS = 400;

/** The wired tab lists, for selectTab(). @type {WeakMap<Element, { tabs: () => HTMLElement[], select: (index: number, options?: { focus?: boolean }) => void }>} */
export const handles = new WeakMap();

/** @param {HTMLElement} tab */
const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls') ?? '');

/** One tab list. */
export class TabsControl extends Controller {
    /** @param {HTMLElement} host @param {{ activation?: 'automatic' | 'manual', loop?: boolean }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.manual = (host.dataset.kpActivation ?? options.activation ?? 'automatic') === 'manual';
        this.wraps = host.dataset.kpLoop === undefined ? (options.loop ?? true) : host.dataset.kpLoop !== 'false';
        this.vertical = host.getAttribute('aria-orientation') === 'vertical';
        /** The panels on their way out, and the switch that sent them. @type {Map<HTMLElement, Promise<void>>} */
        this.leaving = new Map();
        /** Raised by every switch; a panel waits to show only for the latest. */
        this.turn = 0;
        /** What attach changed, so detach can put it back. */
        this.before = this.tabs().map((tab) => ({
            tab,
            tabIndex: tab.getAttribute('tabindex'),
            selected: tab.getAttribute('aria-selected'),
            panel: panelOf(tab),
            hidden: panelOf(tab)?.hidden ?? false,
        }));
    }

    /** The list's tabs, read again at every use. */
    tabs() {
        return [.../** @type {NodeListOf<HTMLElement>} */ (this.host.querySelectorAll('[role="tab"]'))];
    }

    connect() {
        const list = this.host;
        list.dataset.kpTabsAttached = '';
        this.own(() => this.restore());
        handles.set(list, { tabs: () => this.tabs(), select: (index, options) => this.select(index, options) });
        // The initial state comes from the markup, so a page that renders the second tab selected keeps it after this runs.
        const initial = Math.max(0, this.tabs().findIndex((t) => t.getAttribute('aria-selected') === 'true'));
        this.tabs().forEach((tab, i) => {
            tab.tabIndex = i === initial ? 0 : -1;
        });
        this.own(watchTabOverflow(list, () => this.tabs().find((t) => t.getAttribute('aria-selected') === 'true')));
        revealTab(list, this.tabs()[initial]);
        this.listen(list, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(list, 'click', (event) => {
            const tab = /** @type {HTMLElement} */ (event.target).closest('[role="tab"]');
            if (tab) this.select(this.tabs().indexOf(/** @type {HTMLElement} */ (tab)));
        });
    }

    /** Take the list out of the registry and put back the tab stops, the selection and the panels attach found. */
    restore() {
        handles.delete(this.host);
        delete this.host.dataset.kpTabsAttached;
        for (const b of this.before) {
            if (b.tabIndex === null) b.tab.removeAttribute('tabindex');
            else b.tab.setAttribute('tabindex', b.tabIndex);
            if (b.selected === null) b.tab.removeAttribute('aria-selected');
            else b.tab.setAttribute('aria-selected', b.selected);
            if (b.panel) b.panel.hidden = b.hidden;
        }
    }

    /** @param {number} index @param {{ focus?: boolean }} [options] */
    select(index, { focus = true } = {}) {
        const all = this.tabs();
        const previous = all.findIndex((t) => t.getAttribute('aria-selected') === 'true');
        /** @type {HTMLElement | null} */
        let shown = null;
        /** @type {Promise<void>[]} */
        const going = [];
        all.forEach((tab, i) => {
            const selected = i === index;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            const panel = panelOf(tab);
            if (!panel) return;
            if (selected) shown = panel;
            else this.send(panel, going);
        });
        // Every switch takes a turn, also one without a panel to show: a panel an earlier switch still waits on stays hidden.
        const mine = ++this.turn;
        const show = /** @type {HTMLElement | null} */ (shown);
        if (show) this.arrive(show, going, mine);
        // Guarded because a caller computes this index. Found by JobTracker's stricter typecheck (KT4): with
        // noUncheckedIndexedAccess an out-of-range index is a type error here, and in a browser it is a thrown TypeError that stops
        // the key handler.
        if (focus) all[index]?.focus();
        revealTab(this.host, all[index]);
        if (previous === index) return;
        const tab = all[index];
        this.host.dispatchEvent(
            new CustomEvent(TAB_CHANGE_EVENT, { bubbles: true, detail: { index, tab, panel: document.getElementById(tab?.getAttribute('aria-controls') ?? ''), previous } }),
        );
    }

    /**
     * An outgoing panel leaves the theme's way, its space folding shut, and the new one arrives once it is gone (as a leave turned
     * around): so a switch is one panel's exit followed by the other's entrance, never a jump.
     * @param {HTMLElement} panel @param {Promise<void>[]} going collects the leaves the new panel waits for
     */
    send(panel, going) {
        const already = this.leaving.get(panel);
        if (already) going.push(already);
        else if (!panel.hidden) {
            const gone = leave(panel, { hide: true }).finally(() => this.leaving.delete(panel));
            this.leaving.set(panel, gone);
            going.push(gone);
        }
    }

    /**
     * Show the new panel: at once when nothing leaves; beside the old one in a theme that lets states leave first (leavesState()),
     * one picture in one time; else once the leaves are over, unless a later switch came.
     * @param {HTMLElement} show @param {Promise<void>[]} going @param {number} mine this switch's turn
     */
    arrive(show, going, mine) {
        // Still on its way out: it comes back once its leave is over.
        const back = this.leaving.get(show);
        if (back) going.push(back);
        if (going.length === 0) show.hidden = false;
        else if (!back && leavesState(show)) {
            // Marked for the arrival that follows: a theme that folds in whole ticks (`--kp-swap-fold-ease`) shifts the new panel's
            // fold one tick against the old one's, so the two always add up to the one panel and the box does not move.
            show.setAttribute('data-kp-tabs-swapping', '');
            setTimeout(() => show.removeAttribute('data-kp-tabs-swapping'), SWAP_MARK_MS);
            show.hidden = false;
        } else {
            if (!back) show.hidden = true;
            void Promise.all(going).then(() => {
                if (this.turn === mine) show.hidden = false;
            });
        }
    }

    /** Manual activation moves focus without selecting. @param {number} index */
    roam(index) {
        const all = this.tabs();
        all.forEach((tab, i) => {
            tab.tabIndex = i === index ? 0 : -1;
        });
        all[index]?.focus();
    }

    /** @param {KeyboardEvent} e */
    onKey(e) {
        const all = this.tabs();
        const current = all.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        if (current === -1) return;
        if (this.manual && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            this.select(current);
            return;
        }
        const next = this.vertical ? 'ArrowDown' : 'ArrowRight';
        const prev = this.vertical ? 'ArrowUp' : 'ArrowLeft';
        const move = { [next]: 1, [prev]: -1, Home: -current, End: all.length - 1 - current }[e.key];
        if (move === undefined) return;
        e.preventDefault();
        const target = this.wraps ? (current + move + all.length) % all.length : Math.max(0, Math.min(all.length - 1, current + move));
        if (this.manual) this.roam(target);
        else this.select(target);
    }
}
