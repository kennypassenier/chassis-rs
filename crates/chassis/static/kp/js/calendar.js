// A month heatmap: a month of days, each a plate in the colour of its state
// [scope-143].
//
// `section.kp-calendar[data-kp-calendar]` is filled by attachCalendars():
// the month's title between ‹ Prev and Next ›, Today, a line for the state,
// a `table[role=grid]` of six weeks, and a legend. The page gives the days
// (setCalendarDays), the state of the whole (setCalendarState) and the
// legend's entries (setCalendarLegend); the calendar paints them in place.
//
//   tones    `ok`, `warn` and `bad` as text on their own status plate,
//            `muted` (nothing to do), `future` and `before` dashed, `none`
//            (nothing known), and `loading` (a pulse, at rest under reduced
//            motion; `.kp-calendar--busy-days` puts a spinner in each
//            loading day instead, `.kp-calendar--busy-whole` one spinner
//            over the grid); a tone is never the only carrier, the day's
//            words say it too
//   grid     always six week rows, so the page does not jump from month to
//            month; the 42 cells are built once and updated in place, and
//            the neighbouring months' days show their numbers, quiet and
//            inert
//   keys     one tab stop: the arrows move a day or a week, Home and End go
//            to the week's ends, Page Up and Page Down change the month
//            (with Shift, the year), Enter and Space pick
//   today    the day it is in `timeZone` (Europe/Brussels by default, rule
//            52), whatever zone the reader's computer is in; an inner ring
//   picked   `td[aria-selected=true]`, an outer ring; `kp-calendar-pick`
//            fires with `{ date, source }`
//
//   <div class="kp-calendar-layout">
//       <section class="kp-calendar" data-kp-calendar data-kp-calendar-month="2026-10" aria-label="Nightly backups"></section>
//       <aside>…the page's own detail of the picked day…</aside>
//   </div>
//
// Every date a person reads is dd/mm/yyyy (rule 52); the machine's date is
// `YYYY-MM-DD`, the key of setCalendarDays() and of every event. The words
// are the dictionary's (`calendar…` in js/strings.js). Nothing runs on
// import; attachCalendars(root) returns a detach. `decorate` marks every
// control a calendar builds (`month-prev`, `month-next`, `today`, and each
// `day` whenever the month changes), with the shape every kp module's
// `decorate` takes.

import { CHART_TIME_ZONE, wallTime } from './chart.js';
import { calendarNames, resolveLocale, weekStartsOn } from './locale.js';
import { DEFAULT_STRINGS, resolveStrings } from './strings.js';

/** A month heatmap: `section.kp-calendar[data-kp-calendar]`. */
export const CALENDAR = '[data-kp-calendar]';
/** Fired on the calendar, bubbling, when a day is picked: `detail` `{ date: 'YYYY-MM-DD', source: 'pointer' | 'keyboard' }`. */
export const CALENDAR_PICK_EVENT = 'kp-calendar-pick';
/** Fired on the calendar, bubbling, when a person moves it to another month: `detail` `{ year, month }` (month 1-12). */
export const CALENDAR_MONTH_EVENT = 'kp-calendar-month';

/**
 * @typedef {'ok' | 'warn' | 'bad' | 'muted' | 'future' | 'before' | 'loading' | 'none'} CalendarTone
 * @typedef {{ tone: CalendarTone, count?: string, label: string }} CalendarDay
 *   One day's state: its tone, a short count under the number (`7/9`), and the words a screen reader and the
 *   title say after the date (`7 of 9 services backed up; missing: …`)
 * @typedef {'loading' | 'ready' | 'empty' | 'error'} CalendarState
 * @typedef {import('./strings.js').Strings} Strings
 */

/**
 * What `decorate` is told about the control it is handed: the same shape every kp module's `decorate` takes.
 * `kind` is `month-prev`, `month-next`, `today`, or `day` (`index` its cell, 0-41, `value` its date). `host` is
 * the calendar and `key` its `data-kp-key`.
 * @typedef {{ kind: 'day' | 'month-prev' | 'month-next' | 'today', host: HTMLElement, key?: string, index?: number, label?: string, value?: string }} CalendarDecorateInfo
 */

/**
 * @typedef {object} CalendarOptions
 * @property {string} [timeZone] the IANA zone that decides which day is today; else the calendar's `data-kp-time-zone`,
 *   else `Europe/Brussels`
 * @property {string} [locale] the month and weekday names and the first day of the week; else the calendar's
 *   `data-kp-locale`, else the nearest `lang` above it
 * @property {number} [weekStartsOn] 0 (Sunday) to 6; else the calendar's `data-kp-week-starts-on`, else the locale's
 * @property {() => number} [now] the clock, `Date.now` by default
 * @property {Partial<Strings>} [strings] any of the dictionary's words, for these calendars only
 * @property {(part: HTMLElement, info: CalendarDecorateInfo) => void} [decorate] called with every control a calendar
 *   builds, each time it builds it, so the page can mark it
 */

/**
 * @typedef {{ el: HTMLElement, year: number, month: number, selected: string | null, focus: string | null,
 *   days: Record<string, CalendarDay>, state: CalendarState, timeZone: string, firstDay: number, now: () => number,
 *   strings: Strings, months: string[], decorate?: CalendarOptions['decorate'], title: HTMLElement,
 *   stateLine: HTMLElement, grid: HTMLTableElement,
 *   cells: { td: HTMLTableCellElement, button: HTMLButtonElement, num: HTMLElement, count: HTMLElement, pad: HTMLElement }[],
 *   legend: HTMLElement, shownMonth: string }} CalendarModel
 */

/** @type {WeakMap<Element, CalendarModel>} */
const calendars = new WeakMap();

const DAY_MS = 86_400_000;

/** Two digits. @param {number} n */
const two = (n) => String(n).padStart(2, '0');

/** @param {number} y @param {number} m 1-12 @param {number} d */
const isoOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/**
 * The day a moment falls on in `timeZone`, as `YYYY-MM-DD`: the wall clock of
 * that zone decides, so 22:30 UTC on 4 October is the 5th in Brussels.
 * @param {number} ms
 * @param {string} [timeZone]
 * @returns {string}
 */
export function dayKey(ms, timeZone = CHART_TIME_ZONE) {
    const w = wallTime(ms, timeZone);
    return `${String(w.year).padStart(4, '0')}-${two(w.month)}-${two(w.day)}`;
}

/** A date as a person reads it (rule 52): `2026-10-04` → `04/10/2026`. @param {string} iso */
export const formatDayKey = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * The day `days` after `iso` (before, when negative), on the calendar: no
 * clock is involved, so a change to summer time moves nothing.
 * @param {string} iso `YYYY-MM-DD`
 * @param {number} days
 * @returns {string}
 */
export function shiftDay(iso, days) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * The same day `months` later (earlier, when negative), clamped to that
 * month's last day: 31/01 plus a month is 28/02.
 * @param {string} iso `YYYY-MM-DD`
 * @param {number} months
 * @returns {string}
 */
export function shiftMonth(iso, months) {
    const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return isoOf(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(d, last));
}

/** Where `iso` falls in a week that starts on `firstDay`: 0 … 6. @param {string} iso @param {number} firstDay 0 = Sunday */
const weekday = (iso, firstDay) => (new Date(`${iso}T00:00:00Z`).getUTCDay() - firstDay + 7) % 7;

/**
 * The 42 days a month's grid shows: six weeks from the first day of the week
 * on or before the month's first, so every month is six rows tall.
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} [firstDay] the week's first day, 0 (Sunday) to 6; Monday by default
 * @returns {string[]} `YYYY-MM-DD`, oldest first
 */
export function monthCells(year, month, firstDay = 1) {
    const first = isoOf(year, month, 1);
    const start = shiftDay(first, -weekday(first, firstDay));
    return Array.from({ length: 42 }, (_, i) => shiftDay(start, i));
}

/** @param {Element} host @returns {string | undefined} */
const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

let idSeq = 0;

/** @param {CalendarModel} c */
const monthKey = (c) => `${c.year}-${two(c.month)}`;

/** @param {CalendarModel} c @param {string} iso @param {string} today @returns {CalendarDay} */
function dayFor(c, iso, today) {
    const s = c.strings;
    if (c.state === 'loading') return { tone: 'loading', label: s.calendarLoading };
    if (c.state === 'empty') return { tone: 'muted', label: c.stateLine.textContent || s.calendarUnknown };
    if (c.state === 'error') return { tone: 'none', label: c.stateLine.textContent || s.calendarUnknown };
    const given = c.days[iso];
    if (given) return given;
    if (iso > today) return { tone: 'future', label: s.calendarFuture };
    return { tone: 'none', label: s.calendarUnknown };
}

/** Repaint the grid in place: tones, words and the tab stop, never new buttons. @param {CalendarModel} c */
function paintCalendar(c) {
    const ym = monthKey(c);
    const today = dayKey(c.now(), c.timeZone);
    const cells = monthCells(c.year, c.month, c.firstDay);
    const monthChanged = c.shownMonth !== ym;
    c.shownMonth = ym;
    c.title.textContent = c.strings.monthTitle(c.months[c.month - 1] ?? '', c.year);
    c.grid.setAttribute('aria-busy', String(c.state === 'loading'));
    const inMonth = (/** @type {string | null} */ iso) => !!iso && iso.startsWith(ym);
    // One tab stop: the day last moved to, else the picked day, else today, else the 1st.
    const stop = [c.focus, c.selected, today].find(inMonth) ?? `${ym}-01`;
    cells.forEach((iso, i) => {
        const cell = c.cells[i];
        if (!cell) return;
        const mine = inMonth(iso);
        cell.button.hidden = !mine;
        cell.pad.textContent = mine ? '' : iso.slice(8, 10);
        cell.td.toggleAttribute('data-kp-pad', !mine);
        if (!mine) {
            cell.td.removeAttribute('aria-selected');
            delete cell.button.dataset.kpDate;
            cell.button.tabIndex = -1;
            return;
        }
        const day = dayFor(c, iso, today);
        cell.button.dataset.kpDate = iso;
        cell.button.dataset.kpTone = day.tone;
        cell.button.toggleAttribute('data-kp-today', iso === today);
        cell.num.textContent = iso.slice(8, 10);
        const counted = day.count && !['future', 'before', 'loading'].includes(day.tone);
        // A no-break space keeps the count's line when there is none, so every day is one height.
        cell.count.textContent = counted ? /** @type {string} */ (day.count) : ' ';
        const words = c.strings.calendarDay(formatDayKey(iso), day.label);
        cell.button.setAttribute('aria-label', words);
        cell.button.title = words;
        cell.td.setAttribute('aria-selected', String(iso === c.selected));
        cell.button.tabIndex = iso === stop ? 0 : -1;
        if (monthChanged) c.decorate?.(cell.button, { kind: 'day', host: c.el, key: keyOf(c.el), index: i, value: iso });
    });
}

/** @param {CalendarModel} c @param {number} year @param {number} month @param {boolean} announce */
function showMonth(c, year, month, announce) {
    if (c.year === year && c.month === month) return;
    c.year = year;
    c.month = month;
    paintCalendar(c);
    if (announce) c.el.dispatchEvent(new CustomEvent(CALENDAR_MONTH_EVENT, { bubbles: true, detail: { year, month } }));
}

/** @param {CalendarModel} c @param {string} iso */
const buttonFor = (c, iso) => c.cells.find((cell) => cell.button.dataset.kpDate === iso)?.button ?? null;

/** @param {CalendarModel} c @param {string} iso */
function moveFocus(c, iso) {
    const [y = 0, m = 1] = iso.split('-').map(Number);
    c.focus = iso;
    if (y !== c.year || m !== c.month) showMonth(c, y, m, true);
    else paintCalendar(c);
    buttonFor(c, iso)?.focus();
}

/** @param {CalendarModel} c @param {string} iso @param {'pointer' | 'keyboard'} source */
function pick(c, iso, source) {
    c.selected = iso;
    c.focus = iso;
    paintCalendar(c);
    buttonFor(c, iso)?.focus();
    c.el.dispatchEvent(new CustomEvent(CALENDAR_PICK_EVENT, { bubbles: true, detail: { date: iso, source } }));
}

/**
 * Build every month heatmap under `root`: the month's title between ‹ Prev
 * and Next ›, Today, a line for the state, a six-week grid (one tab stop, the
 * keys of a date grid) and the legend. Today is the day in `timeZone`. Per
 * calendar: `data-kp-calendar-month="YYYY-MM"` (the month shown first, else
 * today's), `data-kp-calendar-selected="YYYY-MM-DD"`, `data-kp-time-zone`,
 * `data-kp-locale`, `data-kp-week-starts-on`, `data-kp-heading-level` (the
 * title's, 2 by default) and `data-kp-key` (handed to `decorate`).
 * @param {ParentNode} [root]
 * @param {CalendarOptions} [options]
 * @returns {() => void} detach: the listeners taken away; the calendars keep what they show
 */
export function attachCalendars(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    const { now = () => Date.now(), decorate } = options;
    for (const el of /** @type {HTMLElement[]} */ ([...root.querySelectorAll(CALENDAR)])) {
        if (calendars.has(el)) continue;
        const doc = el.ownerDocument;
        const s = resolveStrings(options.strings);
        const zone = options.timeZone ?? el.dataset.kpTimeZone ?? CHART_TIME_ZONE;
        const locale = resolveLocale(options.locale ?? el.dataset.kpLocale, el);
        const firstDay = weekStartsOn(
            locale,
            options.weekStartsOn ?? (el.dataset.kpWeekStartsOn === undefined ? undefined : Number(el.dataset.kpWeekStartsOn)),
        );
        const today = dayKey(now(), zone);
        const [year = 0, month = 1] = (el.dataset.kpCalendarMonth ?? today.slice(0, 7)).split('-').map(Number);
        const nav = make(doc, 'div', 'kp-calendar__nav');
        nav.setAttribute('role', 'group');
        nav.setAttribute('aria-label', s.calendarNav);
        const prev = make(doc, 'button', 'kp-button kp-button--sm', s.calendarPrev);
        prev.type = 'button';
        prev.setAttribute('aria-label', s.previousMonth);
        prev.title = s.previousMonth;
        prev.dataset.kpCalendarPrev = '';
        const title = make(doc, /** @type {'h2'} */ (`h${el.dataset.kpHeadingLevel ?? '2'}`), 'kp-calendar__title');
        title.id = `kp-calendar-title-${(idSeq += 1)}`;
        title.setAttribute('aria-live', 'polite');
        const next = make(doc, 'button', 'kp-button kp-button--sm', s.calendarNext);
        next.type = 'button';
        next.setAttribute('aria-label', s.nextMonth);
        next.title = s.nextMonth;
        next.dataset.kpCalendarNext = '';
        const todayButton = make(doc, 'button', 'kp-button kp-button--sm', s.calendarToday);
        todayButton.type = 'button';
        todayButton.title = s.calendarTodayTitle;
        todayButton.dataset.kpCalendarToday = '';
        nav.append(prev, title, next, todayButton);
        const stateLine = make(doc, 'p', 'kp-calendar__state');
        stateLine.setAttribute('role', 'status');
        const grid = make(doc, 'table', 'kp-calendar__grid');
        grid.setAttribute('role', 'grid');
        grid.setAttribute('aria-labelledby', title.id);
        const head = make(doc, 'thead');
        const headRow = make(doc, 'tr');
        // 4 January 2026 was a Sunday, so day `firstDay + d` of that week is the d-th column.
        const sunday = Date.UTC(2026, 0, 4);
        const long = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
        const short = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
        for (let d = 0; d < 7; d += 1) {
            const at = sunday + ((firstDay + d) % 7) * DAY_MS;
            const th = make(doc, 'th', '', short.format(at));
            th.scope = 'col';
            th.abbr = long.format(at);
            headRow.append(th);
        }
        head.append(headRow);
        const body = make(doc, 'tbody');
        /** @type {CalendarModel['cells']} */
        const cells = [];
        for (let w = 0; w < 6; w += 1) {
            const tr = make(doc, 'tr');
            for (let d = 0; d < 7; d += 1) {
                const td = make(doc, 'td');
                const button = make(doc, 'button', 'kp-calendar__day');
                button.type = 'button';
                const num = make(doc, 'span', 'kp-calendar__num');
                const count = make(doc, 'span', 'kp-calendar__count', ' ');
                // A spinner for a loading day, shown only by `.kp-calendar--busy-days`.
                const busy = make(doc, 'span', 'kp-calendar__day-busy');
                busy.setAttribute('aria-hidden', 'true');
                busy.append(make(doc, 'span', 'kp-spinner'));
                button.append(num, count, busy);
                const pad = make(doc, 'span', 'kp-calendar__pad');
                pad.setAttribute('aria-hidden', 'true');
                td.append(button, pad);
                tr.append(td);
                cells.push({ td, button, num, count, pad });
            }
            body.append(tr);
        }
        grid.append(head, body);
        const legend = make(doc, 'ul', 'kp-calendar__legend');
        legend.hidden = true;
        // One spinner over the whole grid while it loads, shown only by `.kp-calendar--busy-whole`.
        const busy = make(doc, 'div', 'kp-calendar__busy');
        busy.setAttribute('aria-hidden', 'true');
        busy.append(make(doc, 'span', 'kp-spinner'));
        el.replaceChildren(nav, stateLine, grid, busy, legend);
        if (!el.hasAttribute('aria-labelledby') && !el.hasAttribute('aria-label')) el.setAttribute('aria-labelledby', title.id);
        /** @type {CalendarModel} */
        const c = {
            el,
            year,
            month,
            selected: el.dataset.kpCalendarSelected ?? null,
            focus: null,
            days: {},
            state: 'ready',
            timeZone: zone,
            firstDay,
            now,
            strings: s,
            months: calendarNames(s, DEFAULT_STRINGS, locale).months,
            decorate,
            title,
            stateLine,
            grid,
            cells,
            legend,
            shownMonth: '',
        };
        calendars.set(el, c);
        decorate?.(prev, { kind: 'month-prev', host: el, key: keyOf(el) });
        decorate?.(next, { kind: 'month-next', host: el, key: keyOf(el) });
        decorate?.(todayButton, { kind: 'today', host: el, key: keyOf(el) });
        paintCalendar(c);
        const step = (/** @type {number} */ months) => {
            const [y = 0, m = 1] = shiftMonth(isoOf(c.year, c.month, 1), months)
                .split('-')
                .map(Number);
            showMonth(c, y, m, true);
        };
        const onPrev = () => step(-1);
        const onNext = () => step(1);
        const onToday = () => {
            const iso = dayKey(c.now(), c.timeZone);
            const [y = 0, m = 1] = iso.split('-').map(Number);
            showMonth(c, y, m, true);
            pick(c, iso, 'pointer');
        };
        /** @param {Event} event */
        const dayOf = (event) =>
            /** @type {HTMLButtonElement | null} */ (event.target instanceof Element ? event.target.closest('.kp-calendar__day') : null);
        /** @param {MouseEvent} event */
        const onDay = (event) => {
            const iso = dayOf(event)?.dataset.kpDate;
            // A click from Enter or Space has no pointer behind it: detail 0.
            if (iso) pick(c, iso, event.detail === 0 ? 'keyboard' : 'pointer');
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const iso = dayOf(event)?.dataset.kpDate;
            if (!iso || event.altKey || event.ctrlKey || event.metaKey) return;
            /** @type {string | null} */
            let to = null;
            if (event.key === 'ArrowLeft') to = shiftDay(iso, -1);
            else if (event.key === 'ArrowRight') to = shiftDay(iso, 1);
            else if (event.key === 'ArrowUp') to = shiftDay(iso, -7);
            else if (event.key === 'ArrowDown') to = shiftDay(iso, 7);
            else if (event.key === 'Home') to = shiftDay(iso, -weekday(iso, c.firstDay));
            else if (event.key === 'End') to = shiftDay(iso, 6 - weekday(iso, c.firstDay));
            else if (event.key === 'PageUp') to = shiftMonth(iso, event.shiftKey ? -12 : -1);
            else if (event.key === 'PageDown') to = shiftMonth(iso, event.shiftKey ? 12 : 1);
            if (!to) return;
            event.preventDefault();
            moveFocus(c, to);
        };
        prev.addEventListener('click', onPrev);
        next.addEventListener('click', onNext);
        todayButton.addEventListener('click', onToday);
        body.addEventListener('click', onDay);
        body.addEventListener('keydown', onKey);
        undo.push(() => {
            prev.removeEventListener('click', onPrev);
            next.removeEventListener('click', onNext);
            todayButton.removeEventListener('click', onToday);
            body.removeEventListener('click', onDay);
            body.removeEventListener('keydown', onKey);
            calendars.delete(el);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}

/**
 * Every day's state, by `YYYY-MM-DD` (the whole history: a month change
 * needs no new call). Repaints in place; the focus and the selection stay,
 * so a live update never moves a reader. A calendar that was loading is
 * ready from here on.
 * @param {Element} el
 * @param {Record<string, CalendarDay>} days
 */
export function setCalendarDays(el, days) {
    const c = calendars.get(el);
    if (!c) return;
    c.days = days;
    if (c.state === 'loading') c.state = 'ready';
    paintCalendar(c);
}

/**
 * The calendar as a whole: `loading` (every day pulses at its final size),
 * `ready`, `empty` or `error` (no pulse; `words` under the month, an error's
 * after a dot in the destructive colour). The days say `words` too.
 * @param {Element} el
 * @param {CalendarState} state
 * @param {string} [words]
 */
export function setCalendarState(el, state, words = '') {
    const c = calendars.get(el);
    if (!c) return;
    c.state = state;
    c.stateLine.textContent = words;
    c.stateLine.dataset.kpState = state;
    paintCalendar(c);
}

/**
 * Select a day (or none, with null) and show its month; no event, the page
 * asked.
 * @param {Element} el
 * @param {string | null} iso `YYYY-MM-DD`
 */
export function calendarSelect(el, iso) {
    const c = calendars.get(el);
    if (!c) return;
    c.selected = iso;
    if (iso) {
        const [y = 0, m = 1] = iso.split('-').map(Number);
        c.year = y;
        c.month = m;
    }
    paintCalendar(c);
}

/**
 * Show a month; no event, the page asked.
 * @param {Element} el
 * @param {{ year: number, month: number }} at month 1-12
 */
export function calendarMonth(el, { year, month }) {
    const c = calendars.get(el);
    if (c) showMonth(c, year, month, false);
}

/**
 * The legend under the grid: a swatch and its words per tone, in the order
 * given; none hides it.
 * @param {Element} el
 * @param {{ tone: CalendarTone, label: string }[]} entries
 */
export function setCalendarLegend(el, entries) {
    const c = calendars.get(el);
    if (!c) return;
    const doc = c.legend.ownerDocument;
    c.legend.replaceChildren(
        ...entries.map(({ tone, label }) => {
            const li = make(doc, 'li');
            const swatch = make(doc, 'span', 'kp-calendar__swatch');
            swatch.dataset.kpTone = tone;
            swatch.setAttribute('aria-hidden', 'true');
            li.append(swatch, make(doc, 'span', '', label));
            return li;
        }),
    );
    c.legend.hidden = entries.length === 0;
}
