// One uptime strip: drawn waiting until it is given its periods, fitted to its width, with its keys and presses.
import { CELL, UPTIME_PICK_EVENT } from './constants.js';
import { setUptime } from './draw.js';
import { edges, fit } from './fit.js';
import { infoMode, leaveGroupCard } from './group.js';
import { UptimeInfo } from './info.js';
import { CARDS, GROUPS, INFO, SPECS, UNPINNED } from './state.js';
/** @typedef {import('./types.js').UptimeSpec} UptimeSpec */

/** How far in px from the end of the track still counts as scrolled to the latest period. */
const PIN_SLACK = 2;
/** The track of cells. */
const TRACK = '.kp-uptime__track';

export class UptimeControl extends UptimeInfo {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The animation frame of the next fit. */
        this.frame = 0;
        /** The width the last fit was for; -1 before the first. */
        this.width = -1;
    }

    connect() {
        const el = this.host;
        el.dataset.kpUptimeAttached = '';
        this.own(() => delete el.dataset.kpUptimeAttached);
        this.own(() => this.leaveCard());
        if (!SPECS.has(el)) setUptime(el, { state: /** @type {UptimeSpec['state']} */ (el.dataset.kpUptimeState ?? 'loading') });
        this.watchWidth();
        this.listen(el, 'scroll', (event) => this.onScroll(event), { capture: true, passive: true });
        this.watchTrack();
        INFO.set(el, () => this.reset());
        this.own(() => {
            this.reset();
            INFO.delete(el);
        });
        this.listen(el, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(el, 'focusout', (event) => this.onFocusOut(/** @type {FocusEvent} */ (event)));
        this.listen(el.ownerDocument, 'pointerdown', (event) => this.onOutside(/** @type {PointerEvent} */ (event)), true);
        this.own(() => cancelAnimationFrame(this.frame));
    }

    /** Fit again when the strip's width changes, at most once per frame. */
    watchWidth() {
        if (typeof ResizeObserver !== 'function') return;
        const el = this.host;
        this.observe(
            new ResizeObserver(() => {
                const now = el.clientWidth;
                if (now === this.width) return;
                this.width = now;
                cancelAnimationFrame(this.frame);
                this.frame = requestAnimationFrame(() => fit(el));
            }),
        ).observe(el);
    }

    /** A strip that is laid out again (its fonts arrived, it was shown) keeps its latest period in view. */
    watchTrack() {
        const el = this.host;
        const track = el.querySelector(TRACK);
        if (typeof ResizeObserver === 'function' && track && el.dataset.kpUptimeFit === 'scroll') this.observe(new ResizeObserver(() => fit(el))).observe(track);
    }

    /** The busy card goes with the strip; the group's card goes with its last strip. */
    leaveCard() {
        const el = this.host;
        const own = CARDS.get(el);
        const left = leaveGroupCard(el);
        if (!left || left.last) own?.remove();
        if (left?.last) GROUPS.delete(left.host);
        CARDS.delete(el);
    }

    /** Remember whether the reader scrolled away from the latest period. @param {Event} event */
    onScroll(event) {
        const track = /** @type {HTMLElement} */ (event.target);
        if (!(track instanceof HTMLElement) || !track.matches(TRACK)) return;
        if (track.scrollLeft >= track.scrollWidth - track.clientWidth - PIN_SLACK) UNPINNED.delete(this.host);
        else UNPINNED.add(this.host);
        edges(this.host, track);
    }

    /** The cell an event happened in, if it is one of this strip's pressable cells outside the quick info. @param {Event} event @returns {HTMLElement | null} */
    cellOf(event) {
        const cell = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest(CELL) : null);
        return cell && this.host.contains(cell) && !this.panel?.contains(cell) ? cell : null;
    }

    /** The index a key or arrow leads to, or -1 for a key that moves nothing. @param {string} key @param {number} at @param {number} count */
    static target(key, at, count) {
        if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(count - 1, at + 1);
        if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, at - 1);
        if (key === 'Home') return 0;
        return key === 'End' ? count - 1 : -1;
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        if (event.key === 'Escape' && this.shown) {
            event.preventDefault();
            event.stopPropagation();
            void this.closeInfo(true);
            return;
        }
        const cell = this.cellOf(event);
        if (!cell) return;
        if (event.key === ' ' && cell.tagName === 'A') {
            // A link follows Enter by itself; Space follows it too, as on a button.
            event.preventDefault();
            cell.click();
            return;
        }
        const cells = /** @type {HTMLElement[]} */ ([...this.host.querySelectorAll(`${TRACK} > ${CELL}:not([hidden])`)]);
        const at = cells.indexOf(cell);
        const next = UptimeControl.target(event.key, at, cells.length);
        if (next < 0) return;
        event.preventDefault();
        if (next === at) return;
        for (const c of cells) c.tabIndex = -1;
        cells[next].tabIndex = 0;
        cells[next].focus();
        // An open quick info goes along with the focus.
        if (this.shown && cells[next].getAttribute('aria-haspopup')) this.openInfo(cells[next]);
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const el = this.host;
        const cell = this.cellOf(event);
        if (!cell) return;
        const periods = SPECS.get(el)?.periods ?? [];
        const index = periods.findIndex((p) => p.key === cell.dataset.kpKey);
        if (index < 0) return;
        for (const c of el.querySelectorAll(`${TRACK} > ${CELL}`)) /** @type {HTMLElement} */ (c).tabIndex = -1;
        cell.tabIndex = 0;
        el.dispatchEvent(new CustomEvent(UPTIME_PICK_EVENT, { bubbles: true, detail: { key: cell.dataset.kpKey, index, period: periods[index] } }));
        if (cell.getAttribute('aria-haspopup') && infoMode(el)) {
            if (this.shown && this.anchor === cell) void this.closeInfo(false);
            else this.openInfo(cell);
        }
    }

    /** A press anywhere but the quick info and the strip's cells closes it. @param {PointerEvent} event */
    onOutside(event) {
        if (!this.shown) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target && (this.panel?.contains(target) || (this.host.contains(target) && target.closest(CELL)))) return;
        void this.closeInfo(false);
    }

    /** Tabbing out of the strip and its quick info closes it. @param {FocusEvent} event */
    onFocusOut(event) {
        const next = event.relatedTarget;
        if (this.shown && next instanceof Node && !this.host.contains(next)) void this.closeInfo(false);
    }
}
