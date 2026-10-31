// One week agenda: built, painted, kept on the clock, and answering its pills, its keys, its navigation and its size.
import { Controller } from '../controller.js';
import { dayKey, shiftDay } from '../calendar.js';
import { setWeekStart } from './api.js';
import { build, buildDays, watchArrivals } from './build.js';
import { placeBusy } from './busy.js';
import { WEEK_RANGE_EVENT, WEEK_TICK_MS } from './constants.js';
import { focusPill, open, reachable, syncTabStops } from './menu.js';
import { layout, paint, tick } from './paint.js';
import { weeks } from './state.js';
import { upcomingOn } from './upcoming.js';
import { newModel } from './model.js';
/** @typedef {import('./types.js').WeekOptions} WeekOptions */

/** Where in its day a pill stands when it is not found, for the sideways move: the middle. */
const MID_DAY = 0.5;

/** @param {Event} event */
const pillOf = (event) => (event.target instanceof Element ? /** @type {HTMLElement | null} */ (event.target.closest('.kp-week__pill')) : null);

/** One week agenda: its model is the `weeks` registry entry the setters read; the last measured size sits on the instance. */
export class WeekControl extends Controller {
    /** @param {HTMLElement} host @param {WeekOptions} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** The agenda's model, the registry entry every part reads. */
        this.c = newModel(host, options);
        /** The grid width and day height last laid out, so a resize that keeps them does nothing. */
        this.lastSize = '';
    }

    connect() {
        const c = this.c;
        const el = this.host;
        weeks.set(el, c);
        // Registered first, so it runs last: a motion in flight stops and the setters lose the agenda after everything else.
        this.own(() => {
            c.motion.gone = true;
            c.motion.stop?.();
            weeks.delete(el);
        });
        build(c);
        buildDays(c);
        paint(c);
        // The one hover card of the page carries each item's detail.
        void import('../hovercard.js').then((m) => m.attachHoverCards(el.ownerDocument));
        if (c.title) watchArrivals(c);
        this.watchSize();
        c.timer = window.setInterval(() => tick(c), WEEK_TICK_MS);
        this.own(() => window.clearInterval(c.timer));
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(el, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(el, 'click', (event) => this.onNav(event));
    }

    /** The pill's height is the CSS's; a change of width can flip grid and list, a font arriving changes the pill. */
    watchSize() {
        const c = this.c;
        if (typeof ResizeObserver === 'undefined') return;
        c.observer = this.observe(new ResizeObserver(() => this.onResize()));
        c.observer.observe(c.grid);
        if (c.upcoming.list) c.observer.observe(c.upcoming.list);
    }

    /** The agenda changed size: lay it out again, or paint it when it crossed between grid and list. */
    onResize() {
        const c = this.c;
        placeBusy(c);
        const key = `${c.grid.clientWidth}x${c.cols[0]?.track.clientHeight ?? 0}`;
        if (key === this.lastSize) return;
        this.lastSize = key;
        // Crossing 40rem with an upcoming list moves the pills between the list and the days: a paint, not a layout.
        if (c.upcoming.n > 0 && upcomingOn(c) !== c.upcoming.on) {
            paint(c);
            return;
        }
        layout(c);
        syncTabStops(c);
    }

    /** A press on a pill opens its item. @param {MouseEvent} event */
    onClick(event) {
        const c = this.c;
        const pill = pillOf(event);
        if (!pill || pill.classList.contains('kp-week__pill--more') || pill.tagName !== 'BUTTON') return;
        const item = c.cols.flatMap((col) => col.items).find((i) => i.button === pill);
        if (!item) return;
        c.active = item.event.id;
        syncTabStops(c);
        open(c, item, event.detail === 0 ? 'keyboard' : 'pointer');
    }

    /** Arrows, Home and End move between the pills of a day, the days, or the upcoming list. @param {KeyboardEvent} event */
    onKey(event) {
        const c = this.c;
        const pill = pillOf(event);
        if (!pill || event.altKey || event.ctrlKey || event.metaKey) return;
        const to = c.upcoming.on && c.upcoming.list?.contains(pill) ? this.listedFrom(pill, event.key) : this.dayFrom(pill, event.key);
        if (!to) return;
        event.preventDefault();
        focusPill(c, to);
    }

    /** @param {HTMLElement} pill @param {string} key @returns {HTMLElement | undefined} */
    listedFrom(pill, key) {
        const listed = this.c.upcoming.items.map((i) => i.button).filter((b) => b.tagName === 'BUTTON');
        const at = listed.indexOf(/** @type {HTMLButtonElement} */ (pill));
        if (key === 'ArrowDown') return listed[Math.min(listed.length - 1, at + 1)];
        if (key === 'ArrowUp') return listed[Math.max(0, at - 1)];
        if (key === 'Home') return listed[0];
        if (key === 'End') return listed[listed.length - 1];
        return undefined;
    }

    /** @param {HTMLElement} pill @param {string} key @returns {HTMLElement | undefined} */
    dayFrom(pill, key) {
        const c = this.c;
        const colIndex = c.cols.findIndex((col) => col.track.contains(pill));
        const col = c.cols[colIndex];
        if (!col) return undefined;
        const own = reachable(c, col);
        const at = own.indexOf(pill);
        if (key === 'ArrowDown') return own[Math.min(own.length - 1, at + 1)];
        if (key === 'ArrowUp') return own[Math.max(0, at - 1)];
        if (key === 'Home') return own[0];
        if (key === 'End') return own[own.length - 1];
        if (key !== 'ArrowLeft' && key !== 'ArrowRight') return undefined;
        const rtl = getComputedStyle(c.grid).direction === 'rtl';
        return this.sideways(pill, colIndex, (key === 'ArrowRight') !== rtl ? 1 : -1);
    }

    /**
     * The pill nearest in time of day in the next day that has any, in the direction of `step`.
     * @param {HTMLElement} pill @param {number} colIndex @param {number} step
     * @returns {HTMLElement | undefined}
     */
    sideways(pill, colIndex, step) {
        const c = this.c;
        const stamp = (/** @type {HTMLElement} */ el, /** @type {number} */ missing) =>
            c.cols.flatMap((x) => x.items).find((i) => i.button === el)?.at ?? missing;
        const mine = stamp(pill, MID_DAY);
        for (let k = colIndex + step; k >= 0 && k < c.cols.length; k += step) {
            const there = c.cols[k];
            if (!there) break;
            const list = reachable(c, there);
            if (!list.length) continue;
            return list.reduce((best, el) => (Math.abs(stamp(el, 1) - mine) < Math.abs(stamp(best, 1) - mine) ? el : best), /** @type {HTMLElement} */ (list[0]));
        }
        return undefined;
    }

    /** Previous, Next and Today move the window and tell the page. @param {Event} event */
    onNav(event) {
        const c = this.c;
        const target = event.target instanceof Element ? event.target.closest('button') : null;
        if (!target || target.getAttribute('aria-disabled') === 'true') return;
        let next = c.start;
        if (target.hasAttribute('data-kp-week-prev')) next = shiftDay(c.start, -c.days);
        else if (target.hasAttribute('data-kp-week-next')) next = shiftDay(c.start, c.days);
        else if (target.hasAttribute('data-kp-week-today')) next = dayKey(c.now(), c.zone);
        else return;
        if (next === c.start) return;
        setWeekStart(this.host, next);
        this.host.dispatchEvent(new CustomEvent(WEEK_RANGE_EVENT, { bubbles: true, detail: { start: next, source: 'nav' } }));
    }
}
