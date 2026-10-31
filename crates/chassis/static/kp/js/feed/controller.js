// One activity feed: its model, the rows that are open, the clicks and arrow keys, the option watcher, the clock tick and its handle [gap-activity-feed-1019].

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { ANNOUNCE_GAP_MS, FEED_EARLIER_EVENT, FEED_OPEN_EVENT, FEED_RETRY_EVENT, FEED_TICK_MS, FEED_TIME_ZONE, OPTIONS } from './constants.js';
import { buildFrame } from './frame.js';
import { dayKey, feedOptions } from './options.js';
import { renderFeed } from './render.js';
import { nextFeedNumber } from './state.js';

/** The controller of one `.kp-feed` host. */
export class FeedController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {{ now?: () => number, timeZone?: string }} [options] `now` so a test never reads the real clock
     */
    constructor(host, options = {}) {
        super(host, options);
        /** The clock. */
        this.now = options.now ?? (() => Date.now());
        /** The zone a day is counted in. */
        this.zone = options.timeZone ?? FEED_TIME_ZONE;
        /** The id the rows' regions are numbered under. */
        this.id = `kp-feed-${nextFeedNumber()}`;
        /** The fixed parts of the feed. */
        this.parts = buildFrame(host.ownerDocument);
        /** @type {import('./constants.js').FeedModel} */
        this.model = { state: 'ready', rows: [] };
        /** The rows that are open, by key. @type {Set<string>} */
        this.open = new Set();
        /** The keys the last model showed, for the announcement of new ones. @type {Set<string> | null} */
        this.seen = null;
        /** The busy card of a loading feed. @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** When new rows were last said. */
        this.lastSaid = 0;
        /** The day the headings were last drawn for. */
        this.drawnDay = '';
        /** The moment the next row turns from an ago line into a moment. */
        this.nextFlip = Infinity;
        /** What a page gets back from feedOf(). @type {import('./constants.js').FeedHandle} */
        this.handle = {
            element: host,
            set: (next) => this.set(next),
            openKeys: () => [...this.open],
            setOpen: (keys) => this.setOpen(keys),
            render: () => this.render(),
        };
    }

    connect() {
        const { head, body, foot, voice } = this.parts;
        this.host.classList.add('kp-feed');
        this.host.replaceChildren(head, body, foot, voice);
        this.listen(this.host, 'click', (event) => this.onClick(event));
        this.listen(this.host, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        // An option changed: draw again with it. A tick: a row that turned a day old, or midnight, draws again.
        const watcher = this.observe(new MutationObserver(() => this.render()));
        watcher.observe(this.host, { attributes: true, attributeFilter: OPTIONS });
        const view = this.host.ownerDocument.defaultView;
        const tick = view?.setInterval(() => this.onTick(), FEED_TICK_MS);
        if (tick !== undefined) this.own(() => view?.clearInterval(tick));
        this.own(() => this.busy?.remove());
        this.render();
    }

    /** Draw again, with the options as they stand now. */
    render() {
        renderFeed(this);
    }

    /** A row that turned a day old, or midnight: draw again. */
    onTick() {
        if (this.model.state === 'ready' && (this.now() >= this.nextFlip || dayKey(this.now(), this.zone) !== this.drawnDay)) this.render();
    }

    /** Give the feed its rows, or its state. @param {import('./constants.js').FeedModel} next */
    set(next) {
        const model = { ...this.model, ...next };
        this.model = model;
        if (next.stale === undefined && next.rows !== undefined && next.state === undefined) model.stale = null;
        if (next.state === undefined && next.rows !== undefined) model.state = model.rows?.length ? 'ready' : 'empty';
        const keys = new Set((model.rows ?? []).map((row) => row.key));
        if (this.seen !== null && model.state === 'ready') this.announce((model.rows ?? []).filter((row) => !this.seen?.has(row.key)));
        this.seen = keys;
        for (const key of [...this.open]) if (!keys.has(key)) this.open.delete(key);
        this.render();
    }

    /** Open exactly these rows (or every row that has lines), close the rest; fires no event. @param {readonly string[] | 'all'} keys */
    setOpen(keys) {
        this.open.clear();
        const wanted = keys === 'all' ? (this.model.rows ?? []).filter((row) => row.more?.length).map((row) => row.key) : keys;
        for (const key of wanted) this.open.add(key);
        this.render();
    }

    /** New rows are said once, politely, at most every ten seconds. @param {import('./constants.js').FeedRow[]} fresh */
    announce(fresh) {
        if (!fresh.length || this.now() - this.lastSaid < ANNOUNCE_GAP_MS) return;
        this.lastSaid = this.now();
        const newest = [...fresh].sort((a, b) => b.at - a.at)[0];
        const t = getStrings();
        if (newest) this.parts.voice.textContent = fresh.length > 1 ? t.feedNewMany(fresh.length, newest.title) : t.feedNew(newest.title);
    }

    /** @param {Event} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const toggle = target.closest('.kp-feed__toggle');
        if (toggle && this.host.contains(toggle)) {
            this.toggleRow(toggle.closest('[data-kp-key]'));
            return;
        }
        if (target.closest('[data-kp-feed-retry]')) this.host.dispatchEvent(new CustomEvent(FEED_RETRY_EVENT, { bubbles: true, detail: {} }));
        else if (target.closest('[data-kp-feed-earlier]')) this.host.dispatchEvent(new CustomEvent(FEED_EARLIER_EVENT, { bubbles: true, detail: {} }));
    }

    /** Open or close one row; `one` closes the others first. @param {Element | null} li */
    toggleRow(li) {
        const key = li?.getAttribute('data-kp-key') ?? '';
        const opening = !this.open.has(key);
        if (opening && feedOptions(this.host).expand === 'one') {
            for (const other of [...this.open]) {
                this.open.delete(other);
                this.paintOpen(this.parts.list.querySelector(`[data-kp-key="${CSS.escape(other)}"]`), false);
            }
        }
        if (opening) this.open.add(key);
        else this.open.delete(key);
        this.paintOpen(li, opening);
        this.host.dispatchEvent(new CustomEvent(FEED_OPEN_EVENT, { bubbles: true, detail: { key, open: opening } }));
    }

    /** Show a row open or closed without drawing the feed again. @param {Element | null} li @param {boolean} on */
    paintOpen(li, on) {
        if (!li) return;
        li.toggleAttribute('data-kp-open', on);
        li.querySelector('.kp-feed__toggle')?.setAttribute('aria-expanded', String(on));
        const region = li.querySelector('.kp-feed__more');
        if (region instanceof HTMLElement) region.hidden = !on;
    }

    /** The arrow keys move between the rows' controls. @param {KeyboardEvent} event */
    onKey(event) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const from = event.target instanceof Element ? event.target.closest('.kp-feed__toggle, .kp-feed__link') : null;
        if (!from || !this.host.contains(from)) return;
        const all = [...this.parts.list.querySelectorAll('.kp-feed__toggle, .kp-feed__link')];
        const next = all[all.indexOf(from) + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next instanceof HTMLElement) {
            event.preventDefault();
            next.focus();
        }
    }
}
