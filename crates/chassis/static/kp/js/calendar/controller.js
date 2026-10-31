// One month heatmap: its month, its days and state, the picking and the keys, and the calls a page makes on it.

import { Controller } from '../controller.js';
import { calendarNames, resolveLocale, weekStartsOn } from '../locale.js';
import { DEFAULT_STRINGS, resolveStrings } from '../strings.js';
import { isCalmTones } from '../calm-tones.js';
import { CHART_TIME_ZONE } from '../chart.js';
import { CALENDAR_MONTH_EVENT, CALENDAR_PICK_EVENT } from './constants.js';
import { writeBusyWords } from './busy.js';
import { buildCalendar } from './build.js';
import { calmLegend } from './day.js';
import { dayKey, isoOf, shiftMonth } from './dates.js';
import { keyOf, make } from './dom.js';
import { targetDay } from './keys.js';
import { paintCalendar } from './paint.js';

/** @typedef {import('./constants.js').CalendarDay} CalendarDay */
/** @typedef {import('./constants.js').CalendarState} CalendarState */
/** @typedef {import('./constants.js').CalendarTone} CalendarTone */

/** The attributes whose change repaints the calendar: the calm look's options. */
const WATCHED = ['data-kp-tones', 'data-kp-paused-range', 'data-kp-quiet-words', 'data-kp-calm-map', 'data-kp-legend'];

/** A month heatmap. */
export class CalendarController extends Controller {
    /**
     * @param {HTMLElement} host the calendar
     * @param {import('./constants.js').CalendarOptions} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.el = host;
        // The month shown (month 1-12), the picked day and the day last moved to.
        this.year = 0;
        this.month = 1;
        /** @type {string | null} */
        this.selected = null;
        /** @type {string | null} */
        this.focus = null;
        /** Every day's state by `YYYY-MM-DD`. @type {Record<string, CalendarDay>} */
        this.days = {};
        /** @type {CalendarState} */
        this.state = 'ready';
        this.timeZone = CHART_TIME_ZONE;
        this.firstDay = 1;
        /** The clock. @type {() => number} */
        this.now = () => Date.now();
        this.strings = resolveStrings(options.strings);
        /** @type {string[]} */
        this.months = [];
        /** @type {import('./constants.js').CalendarOptions['decorate']} */
        this.decorate = options.decorate;
        /** The month the grid last drew, so only a change replays the arrival. */
        this.shownMonth = '';
        // The parts, made in `connect()`.
        this.title = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.stateLine = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.grid = /** @type {HTMLTableElement} */ (/** @type {unknown} */ (null));
        /** @type {{ td: HTMLTableCellElement, button: HTMLButtonElement, num: HTMLElement, count: HTMLElement, pad: HTMLElement }[]} */
        this.cells = [];
        this.legend = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        /** @type {HTMLElement | undefined} */
        this.busyText = undefined;
    }

    connect() {
        const { el, strings: s } = this;
        const options = /** @type {import('./constants.js').CalendarOptions} */ (this.options);
        this.now = options.now ?? this.now;
        this.timeZone = options.timeZone ?? el.dataset.kpTimeZone ?? CHART_TIME_ZONE;
        const locale = resolveLocale(options.locale ?? el.dataset.kpLocale, el);
        this.firstDay = weekStartsOn(
            locale,
            options.weekStartsOn ?? (el.dataset.kpWeekStartsOn === undefined ? undefined : Number(el.dataset.kpWeekStartsOn)),
        );
        const today = dayKey(this.now(), this.timeZone);
        [this.year = 0, this.month = 1] = (el.dataset.kpCalendarMonth ?? today.slice(0, 7)).split('-').map(Number);
        const parts = buildCalendar(el, s, locale, this.firstDay);
        this.selected = el.dataset.kpCalendarSelected ?? null;
        this.months = calendarNames(s, DEFAULT_STRINGS, locale).months;
        Object.assign(this, {
            title: parts.title,
            stateLine: parts.stateLine,
            grid: parts.grid,
            cells: parts.cells,
            legend: parts.legend,
            busyText: parts.busyText,
        });
        this.decorate?.(parts.prev, { kind: 'month-prev', host: el, key: keyOf(el) });
        this.decorate?.(parts.next, { kind: 'month-next', host: el, key: keyOf(el) });
        this.decorate?.(parts.todayButton, { kind: 'today', host: el, key: keyOf(el) });
        paintCalendar(this);
        if (isCalmTones(el) && el.getAttribute('data-kp-legend') !== 'hide') this.setLegend(calmLegend(s));
        this.watchOptions();
        this.listen(parts.prev, 'click', () => this.step(-1));
        this.listen(parts.next, 'click', () => this.step(1));
        this.listen(parts.todayButton, 'click', () => this.onToday());
        this.listen(parts.body, 'click', (event) => this.onDay(/** @type {MouseEvent} */ (event)));
        this.listen(parts.body, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
    }

    /** The legend follows its option: `hide` takes the calm legend away, anything else puts it back. */
    watchOptions() {
        const { el, strings: s } = this;
        const watch = this.observe(
            new MutationObserver(() => {
                if (isCalmTones(el)) {
                    if (el.getAttribute('data-kp-legend') === 'hide') this.setLegend([]);
                    else if (this.legend.hidden) this.setLegend(calmLegend(s));
                }
                paintCalendar(this);
            }),
        );
        watch.observe(el, { attributes: true, attributeFilter: WATCHED });
    }

    /** Move by whole months and say so. @param {number} months */
    step(months) {
        const [y = 0, m = 1] = shiftMonth(isoOf(this.year, this.month, 1), months)
            .split('-')
            .map(Number);
        this.showMonth(y, m, true);
    }

    onToday() {
        const iso = dayKey(this.now(), this.timeZone);
        const [y = 0, m = 1] = iso.split('-').map(Number);
        this.showMonth(y, m, true);
        this.pick(iso, 'pointer');
    }

    /** The day button an event came from. @param {Event} event */
    dayOf(event) {
        return /** @type {HTMLButtonElement | null} */ (event.target instanceof Element ? event.target.closest('.kp-calendar__day') : null);
    }

    /** @param {MouseEvent} event */
    onDay(event) {
        const iso = this.dayOf(event)?.dataset.kpDate;
        // A click from Enter or Space has no pointer behind it: detail 0.
        if (iso) this.pick(iso, event.detail === 0 ? 'keyboard' : 'pointer');
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const iso = this.dayOf(event)?.dataset.kpDate;
        if (!iso || event.altKey || event.ctrlKey || event.metaKey) return;
        const to = targetDay(event.key, event.shiftKey, iso, this.firstDay);
        if (!to) return;
        event.preventDefault();
        this.moveFocus(to);
    }

    /** @param {number} year @param {number} month @param {boolean} announce */
    showMonth(year, month, announce) {
        if (this.year === year && this.month === month) return;
        this.year = year;
        this.month = month;
        paintCalendar(this);
        if (announce) this.el.dispatchEvent(new CustomEvent(CALENDAR_MONTH_EVENT, { bubbles: true, detail: { year, month } }));
    }

    /** @param {string} iso */
    buttonFor(iso) {
        return this.cells.find((cell) => cell.button.dataset.kpDate === iso)?.button ?? null;
    }

    /** @param {string} iso */
    moveFocus(iso) {
        const [y = 0, m = 1] = iso.split('-').map(Number);
        this.focus = iso;
        if (y !== this.year || m !== this.month) this.showMonth(y, m, true);
        else paintCalendar(this);
        this.buttonFor(iso)?.focus();
    }

    /** @param {string} iso @param {'pointer' | 'keyboard'} source */
    pick(iso, source) {
        this.selected = iso;
        this.focus = iso;
        paintCalendar(this);
        this.buttonFor(iso)?.focus();
        this.el.dispatchEvent(new CustomEvent(CALENDAR_PICK_EVENT, { bubbles: true, detail: { date: iso, source } }));
    }

    /** @param {Record<string, CalendarDay>} days */
    setDays(days) {
        this.days = days;
        if (this.state === 'loading') this.state = 'ready';
        paintCalendar(this);
    }

    /** @param {CalendarState} state @param {string} words */
    setState(state, words) {
        this.state = state;
        this.stateLine.textContent = words;
        this.stateLine.dataset.kpState = state;
        writeBusyWords(this, words);
        paintCalendar(this);
    }

    /** @param {string | null} iso */
    select(iso) {
        this.selected = iso;
        if (iso) {
            const [y = 0, m = 1] = iso.split('-').map(Number);
            this.year = y;
            this.month = m;
        }
        paintCalendar(this);
    }

    /** @param {{ tone: CalendarTone, label: string }[]} entries */
    setLegend(entries) {
        const doc = this.legend.ownerDocument;
        this.legend.replaceChildren(
            ...entries.map(({ tone, label }) => {
                const li = make(doc, 'li');
                const swatch = make(doc, 'span', 'kp-calendar__swatch');
                swatch.dataset.kpTone = tone;
                swatch.setAttribute('aria-hidden', 'true');
                li.append(swatch, make(doc, 'span', '', label));
                return li;
            }),
        );
        this.legend.hidden = entries.length === 0;
    }
}
