// One day timeline [parts-1102]: the hour grid from the start hour down, the page's items as blocks as long as they take, side by
// side in lanes where they overlap, the read-only ones dashed among them, the all-day strip above, a now line on the clock, the
// moves (js/dayline/move.js), the drops from a list beside it (js/dayline/drop.js) and the states (js/dayline/states.js).

import { Controller } from '../controller.js';
import { say } from '../live-say.js';
import { watchOptions } from '../live-options.js';
import { getStrings } from '../strings.js';
import {
    DAYLINE_CHANGE_EVENT, DAYLINE_OPEN_EVENT, HOLD_ATTRIBUTE, HOURS_ATTRIBUTE, NOW_ATTRIBUTE, NOW_TICK_MS, NOW_VIEW_SHARE, START_ATTRIBUTE, STEP_ATTRIBUTE,
} from './constants.js';
import { wireDrop } from './drop.js';
import { clockAt, dayMinute, holdOf, intIn, placeItems, stepOf, toMinutes } from './layout.js';
import { KeyWalk, dragFrom } from './move.js';
import { allDayItems, buildBlock, buildFrame, hourParts, placeNow, spanOf } from './render.js';
import { drawBusy, drawPlate } from './states.js';

/** @typedef {import('./constants.js').DaylineItem} DaylineItem */
/** @typedef {import('./constants.js').Placed} Placed */
/** @typedef {import('./constants.js').DaylineState} DaylineState */

export class DaylineControl extends Controller {
    /** @param {HTMLElement} host @param {{ now?: () => number }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.parts = buildFrame(host.ownerDocument);
        /** @type {DaylineItem[]} */
        this.items = [];
        /** The all-day strip's items; null while the page gave none (the strip then takes no room). @type {DaylineItem[] | null} */
        this.allDay = null;
        /** @type {Map<string, Placed>} */
        this.placed = new Map();
        /** The state and what its card and plate draw on. @type {import('./states.js').StateParts} */
        this.st = { host, frame: this.parts.frame, scroll: this.parts.scroll, plate: this.parts.plate, state: 'ready', words: '', text: '', drawn: false, busy: null };
        /** Whether the person has scrolled or worked in the box: from then on it is never scrolled for them. */
        this.touched = false;
        /** The sentence the status line was given last, so a finished move does not say its final step a second time. */
        this.lastSaid = '';
        this.clock = typeof options.now === 'function' ? options.now : () => Date.now();
        this.walk = new KeyWalk(this.mover());
    }

    connect() {
        const { host } = this;
        const p = this.parts;
        if (!host.id) host.id = `kp-dayline-${Math.random().toString(36).slice(2, 9)}`;
        if (!host.hasAttribute('aria-label') && !host.hasAttribute('aria-labelledby')) host.setAttribute('aria-label', getStrings().daylineLabel);
        p.scroll.setAttribute('aria-label', host.getAttribute('aria-label') ?? getStrings().daylineLabel);
        host.replaceChildren(p.allDay, p.frame, p.status);
        this.listen(p.grid, 'pointerdown', (e) => dragFrom(/** @type {PointerEvent} */ (e), this.mover()));
        this.listen(p.grid, 'keydown', (e) => this.walk.onKey(/** @type {KeyboardEvent} */ (e)));
        this.listen(p.grid, 'click', (e) => this.open(/** @type {MouseEvent} */ (e)));
        this.own(watchOptions(host, [START_ATTRIBUTE, STEP_ATTRIBUTE, HOURS_ATTRIBUTE, NOW_ATTRIBUTE, HOLD_ATTRIBUTE], () => this.draw()));
        const tick = setInterval(() => this.paintNow(), NOW_TICK_MS);
        this.own(() => clearInterval(tick));
        this.own(() => this.walk.stop());
        // Each time the box gets a size or comes into view (a section shown later, moved, opened in a dialog) it scrolls to now,
        // until the person scrolls or works in it.
        this.observe(new ResizeObserver(() => this.reveal())).observe(p.scroll);
        this.observe(new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && this.reveal())).observe(p.scroll);
        for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) this.listen(p.scroll, type, () => (this.touched = true), { passive: true });
        this.own(
            wireDrop({
                host,
                grid: p.grid,
                scroll: p.scroll,
                marker: p.drop,
                rowsTotal: () => this.grid().rowsTotal,
                holdMs: () => this.holdMs(),
                clockOfRow: (row) => this.clockOfRow(row),
                strings: getStrings,
                say: (text) => this.say(text),
            }),
        );
        this.draw();
    }

    /** The grid as the markup asks for it now. */
    grid() {
        const startHour = intIn(this.host.getAttribute(START_ATTRIBUTE), 0, 23, 0);
        const step = stepOf(this.host.getAttribute(STEP_ATTRIBUTE));
        const hours = intIn(this.host.getAttribute(HOURS_ATTRIBUTE), 1, 24, 24);
        const perHour = 60 / step;
        return { startHour, step, hours, perHour, rowsTotal: hours * perHour, total: hours * 60 };
    }

    /** How long a finger holds a block or a source still before it lifts [ms]. */
    holdMs() {
        return holdOf(this.host.getAttribute(HOLD_ATTRIBUTE));
    }

    /** @param {number} row */
    clockOfRow(row) {
        const g = this.grid();
        return clockAt(row * g.step, g.startHour);
    }

    /** What a move needs from this day. @returns {import('./move.js').MoveHost} */
    mover() {
        return {
            grid: this.parts.grid,
            scroll: this.parts.scroll,
            holdMs: () => this.holdMs(),
            lifted: (p) => this.say(getStrings().daylineLifted(p.item.label)),
            rowsTotal: () => this.grid().rowsTotal,
            perHour: () => this.grid().perHour,
            placed: (id) => this.placed.get(id),
            show: (p, row) => this.show(p, row, true),
            commit: (p, row, source) => this.commit(p, row, source),
            putBack: (p) => this.putBack(p),
        };
    }

    /** @param {readonly DaylineItem[]} items @param {readonly DaylineItem[] | undefined} allDay */
    setItems(items, allDay) {
        this.items = items.filter((item) => !item.allDay && toMinutes(item.start) !== null).map((item) => ({ ...item }));
        const strip = [...(allDay ?? []), ...items.filter((item) => item.allDay || toMinutes(item.start) === null)];
        this.allDay = allDay === undefined && strip.length === 0 ? null : strip;
        this.draw();
    }

    /** @param {DaylineState} state @param {string} words @param {string} text */
    setState(state, words, text) {
        Object.assign(this.st, { state, words, text });
        this.host.dataset.kpState = state;
        this.paintStates();
    }

    /** Draw the grid, the blocks, the strip and the now line; the focused handle or body button keeps the focus, without scrolling. */
    draw() {
        const g = this.grid();
        const p = this.parts;
        const doc = this.host.ownerDocument;
        const s = getStrings();
        const focused = this.focusedPart();
        p.grid.style.setProperty('--kp-dayline-rows', String(g.rowsTotal));
        p.grid.style.setProperty('--kp-dayline-per-hour', String(g.perHour));
        const placed = placeItems(this.items, g);
        this.placed = new Map(placed.map((one) => [one.item.id, one]));
        p.grid.replaceChildren(...hourParts(doc, g), ...placed.map((one) => buildBlock(doc, one, g.startHour, s)), p.now, p.drop);
        p.allDay.hidden = this.allDay === null;
        p.allDayName.textContent = s.daylineAllDay;
        p.allDayList.replaceChildren(...allDayItems(doc, this.allDay ?? [], s));
        this.paintNow();
        this.paintStates();
        if (focused) /** @type {HTMLElement | null} */ (p.grid.querySelector(`[data-kp-dayline-id="${CSS.escape(focused.id)}"] .${focused.part}`))?.focus({ preventScroll: true });
        this.reveal();
        this.st.drawn = true;
    }

    /** The block part that holds the focus (its handle or its body button), to give it back after a draw. @returns {{ id: string, part: string } | null} */
    focusedPart() {
        const active = this.host.ownerDocument.activeElement;
        const id = active && this.parts.grid.contains(active) ? active.closest('[data-kp-dayline-id]')?.getAttribute('data-kp-dayline-id') : null;
        const part = ['kp-dayline__handle', 'kp-dayline__body'].find((name) => active?.classList.contains(name));
        return id && part ? { id, part } : null;
    }

    paintStates() {
        const s = getStrings();
        drawPlate(this.st, this.items.length === 0, s);
        drawBusy(this.st, s);
    }

    /** The clock's minute of the day, from the frozen attribute or the clock. */
    nowClock() {
        const own = toMinutes(this.host.getAttribute(NOW_ATTRIBUTE));
        if (own !== null) return own;
        const at = new Date(this.clock());
        return at.getHours() * 60 + at.getMinutes();
    }

    paintNow() {
        const g = this.grid();
        const clock = this.nowClock();
        placeNow(this.parts.now, this.parts.nowLabel, dayMinute(clock, g.startHour), g.total, clock, getStrings());
    }

    /** Until the person works in it, the box is scrolled so the now line stands a quarter from the top (or the first item does). */
    reveal() {
        if (this.touched || this.st.state !== 'ready' || !this.placed.size || !this.parts.scroll.clientHeight) return;
        const { scroll, grid, now } = this.parts;
        const first = Math.min(...[...this.placed.values()].map((one) => one.row)) / this.grid().rowsTotal;
        const share = now.hidden ? first : Number(now.style.getPropertyValue('--kp-dayline-now') || 0);
        scroll.scrollTop = Math.max(0, share * grid.scrollHeight - scroll.clientHeight * NOW_VIEW_SHARE);
    }

    /** Stand a block on a row (a step of a move) and, when asked, say where. @param {Placed} p @param {number} row @param {boolean} say */
    show(p, row, say) {
        const g = this.grid();
        const block = /** @type {HTMLElement | null} */ (this.parts.grid.querySelector(`[data-kp-dayline-id="${CSS.escape(p.item.id)}"]`));
        if (!block) return;
        block.style.gridRow = `${row + 1} / span ${p.rows}`;
        const time = block.querySelector('.kp-dayline__time');
        if (time) time.textContent = spanOf({ ...p, at: row * g.step }, g.startHour);
        if (say) this.say(getStrings().daylineMoved(p.item.label, clockAt(row * g.step, g.startHour)));
    }

    /** A finished move: the item takes its new start, the lanes are laid again, the event fires. @param {Placed} p @param {number} row @param {'pointer' | 'keyboard'} source */
    commit(p, row, source) {
        const g = this.grid();
        const from = clockAt(p.at, g.startHour);
        const start = clockAt(row * g.step, g.startHour);
        const item = this.items.find((one) => one.id === p.item.id);
        if (item) item.start = start;
        this.draw();
        const words = getStrings().daylineMoved(p.item.label, start);
        if (this.lastSaid !== words) this.say(words);
        this.host.dispatchEvent(new CustomEvent(DAYLINE_CHANGE_EVENT, { bubbles: true, detail: { id: p.item.id, start, from, source } }));
    }

    /** @param {Placed} p */
    putBack(p) {
        this.show(p, p.row, false);
        this.say(getStrings().daylineKept(p.item.label, clockAt(p.at, this.grid().startHour)));
    }

    /** A press on an item's body. @param {MouseEvent} event */
    open(event) {
        const body = event.target instanceof Element ? event.target.closest('button.kp-dayline__body') : null;
        const id = body?.closest('[data-kp-dayline-id]')?.getAttribute('data-kp-dayline-id');
        if (!id) return;
        this.host.dispatchEvent(new CustomEvent(DAYLINE_OPEN_EVENT, { bubbles: true, detail: { id, source: event.detail === 0 ? 'keyboard' : 'pointer' } }));
    }

    /** Write a sentence to the status line, cleared first so the same sentence twice is still heard. @param {string} text */
    say(text) {
        this.lastSaid = text;
        say(this.parts.status, text);
    }
}
