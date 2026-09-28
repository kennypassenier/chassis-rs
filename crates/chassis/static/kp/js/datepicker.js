// Date picker, framework-free [TH43].
//
// The classic place where keyboard access dies. Two rules decide whether
// this is usable, and both are about not trapping anyone in the grid:
//
//   1. **Typing always works.** The text input is the control; the
//      calendar is an aid. Someone who knows the date types it and never
//      opens the grid, and someone using a screen reader is not forced
//      through 31 buttons to say "the fourth".
//   2. **The grid is a real grid.** Arrows move by day, PageUp/PageDown
//      by month, Home/End to the ends of the week, and exactly one day is
//      in the tab order at a time.
//
//   <div class="kp-datepicker" data-kp-datepicker data-kp-min="2026-01-01" data-kp-disabled-days="0,6">
//     <label class="kp-field__label" for="from">From</label>
//     <input class="kp-field__input" id="from" type="text" inputmode="numeric" data-kp-date-input />
//     <button type="button" data-kp-date-open aria-label="Open the calendar">📅</button>
//     <div class="kp-datepicker__panel" data-kp-date-panel hidden></div>
//   </div>
//
// The panel is built here rather than written by the server, and that is
// the one place this package departs from "the server writes the markup":
// a month grid is derived from a date, so writing it by hand would mean
// writing twelve of them and keeping them in step.
//
// ISO in the value attribute, the locale on screen. A consumer reads
// `input.dataset.kpDateValue` and gets `2026-09-04` whatever the display
// format is, because parsing a localised string on the server is how off-
// by-one-day bugs are born.
//
// Since 3.0.0 [KT6, D5]: the display format, the parsing order and the
// first day of the week come from the locale — the nearest `lang`, the
// browser's, or `data-kp-locale` — instead of being Dutch; the first
// version also set the placeholder hint from a string that nothing
// formatted by, so changing it made the hint lie. A minimum, a maximum
// and disabled weekdays exist; the date is settable through the handle;
// the day cells can be decorated; and the panel's glyphs are attributes.

import { DEFAULT_STRINGS, getStrings } from './strings.js';
import { placeBlockSide, raiseOverlay, raised } from './top-layer.js';
import { calendarNames, datePattern, formatDate, parseDate as parseLocale, resolveLocale, weekStartsOn } from './locale.js';

const PICKER = '[data-kp-datepicker]';

/** Fired when a date is chosen, typed or set. A contract value [TH26]: `{ iso, date, source }`. */
export const DATE_EVENT = 'kp-date-change';
/** Fired when the panel opens or closes: `{ open }`. */
export const OPEN_EVENT = 'kp-date-open';
/** Fired when the visible month changes: `{ year, month }` (month 0-11). */
export const MONTH_EVENT = 'kp-date-month';

/** @param {Date} date */
export function toISO(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A date as a locale writes it. `toDutch` remains for the consumers that
 * imported it in 1.x; it is `formatDate(date, 'nl-NL')`.
 *
 * @param {Date} date
 * @param {string} [locale]
 */
export function formatLocalDate(date, locale) {
    return formatDate(date, locale);
}
/** @deprecated since 3.0.0 — `formatLocalDate(date, 'nl-NL')`. @param {Date} date */
export function toDutch(date) {
    return formatDate(date, 'nl-NL');
}

/**
 * Read what someone typed: ISO always, and the locale's own order for
 * the numeric form. "31-02-2026" is refused rather than rounded to 3
 * March, in every locale.
 *
 * @param {string} text
 * @param {string} [locale]
 * @returns {Date | null}
 */
export function parseDate(text, locale) {
    if (text.trim() === '') return null;
    return parseLocale(text, locale);
}

/**
 * @typedef {object} DatePickerHandle
 * @property {HTMLElement} element
 * @property {() => Date | null} get
 * @property {(date: Date | string | null) => void} set a Date, an ISO string, or null to clear
 * @property {() => void} open
 * @property {() => void} close
 */

/**
 * Keep an open calendar inside the window [Kenny's note of 2026-09-13]. The
 * panel hangs from the picker's inline start, so a picker near the inline
 * end of the window — the last filter of a data table — opened its calendar
 * past the edge: measured at x=1374 of a 1280px page. When it would cross
 * that edge it hangs from the picker's inline end instead and opens toward
 * the inline start; when that is worse (a picker narrower than its calendar
 * in a window narrower than both), the side that overflows less is kept.
 * `data-kp-align="end"` says which side was taken. A panel in the top layer
 * (js/top-layer.js) is placed in window coordinates under its picker; one
 * that is not keeps hanging from the picker and only the side changes.
 *
 * @param {HTMLElement} panel an open `.kp-datepicker__panel`
 */
export function placeDatePanel(panel) {
    delete panel.dataset.kpAlign;
    const width = document.documentElement.clientWidth;
    const rtl = getComputedStyle(panel).direction === 'rtl';
    /** How far past the window's inline-end edge a panel starting at x runs. @param {number} x @param {number} w */
    const pastEnd = (x, w) => (rtl ? -x : x + w - width);
    /** @param {number} x @param {number} w */
    const pastStart = (x, w) => (rtl ? x + w - width : -x);

    if (raised(panel)) {
        const anchor = (panel.closest('[data-kp-datepicker]') ?? panel.parentElement ?? panel).getBoundingClientRect();
        const w = panel.offsetWidth;
        const fromStart = rtl ? anchor.right - w : anchor.left;
        const fromEnd = rtl ? anchor.left : anchor.right - w;
        let x = fromStart;
        if (pastEnd(fromStart, w) > 0 && Math.max(0, pastStart(fromEnd, w)) <= pastEnd(fromStart, w)) {
            x = fromEnd;
            panel.dataset.kpAlign = 'end';
        }
        panel.style.left = `${Math.round(x)}px`;
        panel.style.top = `${Math.round(anchor.bottom)}px`;
        // Above the picker when the window has no room under it [fix-30].
        placeBlockSide(panel, anchor);
        return;
    }

    const start = panel.getBoundingClientRect();
    if (pastEnd(start.left, start.width) <= 0) return;
    panel.dataset.kpAlign = 'end';
    const end = panel.getBoundingClientRect();
    if (Math.max(0, pastStart(end.left, end.width)) > pastEnd(start.left, start.width)) delete panel.dataset.kpAlign;
}

/**
 * Open a calendar above every container it sits in (js/top-layer.js: a
 * card's clip-path cut every day of it away in four themes), inside the
 * window, and following its field while it is open. Both channels open
 * with it. Returns the way back down.
 *
 * @param {HTMLElement} panel an open `.kp-datepicker__panel`
 * @returns {() => void} lower
 */
export function raiseDatePanel(panel) {
    const lower = raiseOverlay(panel, placeDatePanel);
    return () => {
        lower();
        panel.style.removeProperty('left');
        panel.style.removeProperty('top');
        delete panel.dataset.kpAlign;
    };
}

// ── The month and year grids [scope-89] ──────────────────────────────────
//
// The title opens the twelve months of the shown year, and in that view the
// year opens twelve years. Both grids are three cells a row and draw their
// cells with the day's class, so every register that paints a day paints a
// month and a year without knowing they exist. The helpers below are shared
// by both channels: two implementations of "which months does a maximum
// leave" is how the channels come to disagree.

/** @typedef {'days' | 'months' | 'years'} DateView */

/** Cells a row in the month and year grids. */
const JUMP_COLUMNS = 3;

/** The first year of the block of twelve that holds `year`. @param {number} year */
export function yearBlockStart(year) {
    return Math.floor(year / 12) * 12;
}

/**
 * A day of a month, the day kept where the month has it and the month's last
 * day otherwise: 31 January to February lands on the 28th, not in March.
 *
 * @param {number} year @param {number} month may run past 0-11 @param {number} day
 */
export function clampToMonth(year, month, day) {
    const first = new Date(year, month, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return new Date(first.getFullYear(), first.getMonth(), Math.min(day, last));
}

/**
 * Whether a span of days lies wholly before the minimum or after the maximum:
 * a month or a year that still holds one day to choose stays a way in.
 *
 * @param {Date} from first day @param {Date} to last day @param {Date | null} min @param {Date | null} max
 */
export function outsideRange(from, to, min, max) {
    return (min !== null && to < min) || (max !== null && from > max);
}

/**
 * How far a key moves the focus in a month or year grid, in cells; null for a
 * key the grid does not take. Arrows by a cell and a row, Home and End to the
 * ends of the row, PageUp and PageDown by twelve — the day grid's keys, one
 * size up. A move past the drawn grid crosses into the next year or block.
 *
 * @param {string} key @param {number} index the focused cell, 0-11
 * @returns {number | null}
 */
export function jumpMove(key, index) {
    const column = index % JUMP_COLUMNS;
    /** @type {Record<string, number>} */
    const moves = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: JUMP_COLUMNS,
        ArrowUp: -JUMP_COLUMNS,
        Home: -column,
        End: JUMP_COLUMNS - 1 - column,
        PageDown: 12,
        PageUp: -12,
    };
    return moves[key] ?? null;
}

/**
 * The size of the day view, to hold while the month or year grid shows, so
 * the panel does not jump under the pointer. Read as the computed sizes, in
 * each element's own box-sizing, so writing them back as minimums lands on
 * the same box whatever a register set.
 *
 * @param {HTMLElement} panel an open `.kp-datepicker__panel` showing days
 * @returns {{ inline: string, block: string, gridInline: string, gridBlock: string }}
 */
export function measureDateView(panel) {
    const grid = panel.querySelector('.kp-datepicker__grid');
    const own = getComputedStyle(panel);
    const cells = grid === null ? null : getComputedStyle(grid);
    return {
        inline: own.width,
        block: own.height,
        gridInline: cells?.width ?? 'auto',
        gridBlock: cells?.height ?? 'auto',
    };
}

/** @type {WeakMap<Element, DatePickerHandle>} */
const handles = new WeakMap();
/** The handle for an attached picker. @param {Element} element */
export function datePicker(element) {
    return handles.get(element) ?? null;
}

/**
 * @param {ParentNode} root
 * @param {{ locale?: string, weekStartsOn?: number, closeOnSelect?: boolean, refocus?: boolean, isDateDisabled?: (date: Date) => boolean, renderDay?: (button: HTMLButtonElement, date: Date) => void, previousGlyph?: string, nextGlyph?: string }} [options]
 *   Defaults; per picker: `data-kp-locale`, `data-kp-week-starts-on`, `data-kp-min`, `data-kp-max` (ISO), `data-kp-disabled-days` (0-6, comma-separated), `data-kp-close-on-select="false"`, `data-kp-previous-glyph`, `data-kp-next-glyph`.
 * @returns {(() => void) & { handles: DatePickerHandle[] }} detach
 */
export function attachDatePickers(
    root = document,
    {
        locale: localeOption,
        weekStartsOn: weekOption,
        closeOnSelect = true,
        refocus = true,
        isDateDisabled,
        renderDay,
        previousGlyph = '‹',
        nextGlyph = '›',
    } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {DatePickerHandle[]} */
    const created = [];

    for (const element of root.querySelectorAll(PICKER)) {
        const picker = /** @type {HTMLElement} */ (element);
        if (picker.dataset.kpDatepickerAttached !== undefined) continue;
        const input = /** @type {HTMLInputElement | null} */ (picker.querySelector('[data-kp-date-input]'));
        const open = /** @type {HTMLButtonElement | null} */ (picker.querySelector('[data-kp-date-open]'));
        const panel = /** @type {HTMLElement | null} */ (picker.querySelector('[data-kp-date-panel]'));
        if (input === null || open === null || panel === null) continue;
        picker.dataset.kpDatepickerAttached = '';

        const locale = resolveLocale(picker.dataset.kpLocale ?? localeOption, picker);
        const firstDay = weekStartsOn(locale, picker.dataset.kpWeekStartsOn === undefined ? weekOption : Number(picker.dataset.kpWeekStartsOn));
        const min = picker.dataset.kpMin ? parseLocale(picker.dataset.kpMin, locale) : null;
        const max = picker.dataset.kpMax ? parseLocale(picker.dataset.kpMax, locale) : null;
        const disabledDays = (picker.dataset.kpDisabledDays ?? '')
            .split(',')
            .map((d) => Number.parseInt(d, 10))
            .filter((d) => !Number.isNaN(d));
        const closes = picker.dataset.kpCloseOnSelect === undefined ? closeOnSelect : picker.dataset.kpCloseOnSelect !== 'false';
        const before = {
            placeholder: input.placeholder,
            value: input.dataset.kpDateValue,
            expanded: open.getAttribute('aria-expanded'),
            panelHidden: panel.hidden,
        };

        // The hint follows the locale, so it cannot lie about the format.
        if (input.placeholder === '') input.placeholder = datePattern(locale).hint;

        /** @param {Date} date */
        const disabled = (date) => {
            if (min !== null && date < min) return true;
            if (max !== null && date > max) return true;
            if (disabledDays.includes(date.getDay())) return true;
            return isDateDisabled?.(date) ?? false;
        };
        const read = () => parseDate(input.value, locale);
        let cursor = read() ?? new Date();
        /** Which grid the panel shows [scope-89]. @type {DateView} */
        let view = 'days';
        /** Where Escape steps back to: the cursor as it was when each view opened. @type {Date[]} */
        let back = [];
        /** The day view's size, held while the month or year grid shows. @type {ReturnType<typeof measureDateView> | null} */
        let pin = null;
        /** The month the day grid last drew, so the month event fires on a change only. */
        let shown = '';
        // Says which grid opened. One element kept across redraws: a live
        // region created together with its text is one a screen reader may
        // never read.
        const live = document.createElement('span');
        live.className = 'kp-sr-only';
        live.setAttribute('aria-live', 'polite');

        const draw = () => {
            const year = cursor.getFullYear();
            const month = cursor.getMonth();
            const chosen = read();
            const s = getStrings();
            // The names follow the picker's locale; a consumer's own dictionary still wins [gap-11].
            const names = calendarNames(s, DEFAULT_STRINGS, locale);
            const from = yearBlockStart(year);

            for (const child of [...panel.children]) if (child !== live) child.remove();
            const head = document.createElement('div');
            head.className = 'kp-datepicker__head';
            /** @param {string} label @param {string} glyph @param {() => Date} to @param {number} slot */
            const step = (label, glyph, to, slot) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'kp-button kp-button--ghost';
                button.setAttribute('aria-label', label);
                button.textContent = glyph;
                button.addEventListener('click', () => {
                    cursor = to();
                    redraw();
                    // The redraw replaced the button; the focus stays on its successor.
                    /** @type {HTMLElement | undefined} */ (panel.querySelector('.kp-datepicker__head')?.children[slot])?.focus();
                });
                return button;
            };
            const day = cursor.getDate();
            const moves = {
                days: [s.previousMonth, s.nextMonth, () => new Date(year, month - 1, 1), () => new Date(year, month + 1, 1)],
                months: [s.previousYear, s.nextYear, () => clampToMonth(year - 1, month, day), () => clampToMonth(year + 1, month, day)],
                years: [s.previousYears, s.nextYears, () => clampToMonth(year - 12, month, day), () => clampToMonth(year + 12, month, day)],
            }[view];
            const previous = step(
                /** @type {string} */ (moves[0]),
                picker.dataset.kpPreviousGlyph ?? previousGlyph,
                /** @type {() => Date} */ (moves[2]),
                0,
            );
            const next = step(/** @type {string} */ (moves[1]), picker.dataset.kpNextGlyph ?? nextGlyph, /** @type {() => Date} */ (moves[3]), 2);

            // The title opens the next grid up; the year grid is the top, so its title is only a title.
            const title = document.createElement(view === 'years' ? 'span' : 'button');
            title.className = 'kp-datepicker__title';
            title.id = `${input.id || 'kp-date'}-title`;
            const monthTitle = s.monthTitle(names.months[month] ?? '', year);
            title.textContent = view === 'days' ? monthTitle : view === 'months' ? String(year) : s.yearRange(from, from + 11);
            if (title instanceof HTMLButtonElement) {
                title.type = 'button';
                title.setAttribute('aria-label', view === 'days' ? s.chooseMonth(monthTitle) : s.chooseYear(year));
                title.addEventListener('click', () => go(view === 'days' ? 'months' : 'years'));
            }
            head.append(previous, title, next);

            const grid = document.createElement('div');
            grid.className = 'kp-datepicker__grid';
            grid.dataset.kpView = view;
            grid.setAttribute('role', 'grid');
            if (view !== 'days' && pin !== null) {
                panel.style.minInlineSize = pin.inline;
                panel.style.minBlockSize = pin.block;
                // The width exactly: a grid of fractions in a panel that sizes to its content would otherwise grow to its longest month name.
                grid.style.inlineSize = pin.gridInline;
                grid.style.minBlockSize = pin.gridBlock;
            } else {
                panel.style.removeProperty('min-inline-size');
                panel.style.removeProperty('min-block-size');
            }

            /** A month or a year: a day cell to every register. @param {string} text @param {boolean} current @param {boolean} off */
            const jumpCell = (text, current, off) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'kp-datepicker__day';
                button.setAttribute('role', 'gridcell');
                button.setAttribute('aria-selected', String(current));
                if (off) {
                    button.setAttribute('aria-disabled', 'true');
                    button.dataset.kpDisabled = '';
                }
                button.tabIndex = current ? 0 : -1;
                button.textContent = text;
                return button;
            };

            if (view === 'months') {
                grid.setAttribute('aria-label', s.monthGrid(year));
                for (let m = 0; m < 12; m += 1) {
                    const cell = jumpCell(
                        names.monthsShort[m] ?? '',
                        m === month,
                        outsideRange(new Date(year, m, 1), new Date(year, m + 1, 0), min, max),
                    );
                    cell.dataset.kpMonth = `${year}-${String(m + 1).padStart(2, '0')}`;
                    cell.setAttribute('aria-label', s.monthTitle(names.months[m] ?? '', year));
                    grid.append(cell);
                }
                panel.prepend(head, grid);
                return;
            }
            if (view === 'years') {
                grid.setAttribute('aria-label', s.yearGrid(from, from + 11));
                for (let y = from; y < from + 12; y += 1) {
                    const cell = jumpCell(String(y), y === year, outsideRange(new Date(y, 0, 1), new Date(y, 11, 31), min, max));
                    cell.dataset.kpYear = String(y);
                    grid.append(cell);
                }
                panel.prepend(head, grid);
                return;
            }

            shown = `${year}-${month}`;
            const lead = (new Date(year, month, 1).getDay() - firstDay + 7) % 7;
            const days = new Date(year, month + 1, 0).getDate();
            // Named by what the title shows; the title's own name now also says what it opens.
            grid.setAttribute('aria-label', monthTitle);
            // The weekday headings rotate with the first day: Sunday first
            // for a locale that starts there, Monday for one that does not.
            // Column i holds the days whose getDay() is (firstDay + i) % 7,
            // so the names are counted the same way — the dictionary is
            // Monday first, and indexing it with a Sunday-zero day put every
            // heading one column off [gap-11].
            for (let i = 0; i < 7; i += 1) {
                const weekday = names.weekdays[(firstDay + i) % 7] ?? '';
                const cell = document.createElement('span');
                cell.className = 'kp-datepicker__weekday';
                cell.setAttribute('role', 'columnheader');
                cell.setAttribute('aria-label', weekday);
                cell.textContent = weekday;
                grid.append(cell);
            }
            for (let i = 0; i < lead; i += 1) {
                const blank = document.createElement('span');
                blank.className = 'kp-datepicker__blank';
                grid.append(blank);
            }
            for (let d = 1; d <= days; d += 1) {
                const date = new Date(year, month, d);
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'kp-datepicker__day';
                button.dataset.kpDay = toISO(date);
                button.setAttribute('role', 'gridcell');
                // The full date as the name: "4" alone tells a screen
                // reader nothing about which month it is in.
                button.setAttribute('aria-label', s.dayLabel(d, names.months[month] ?? '', year));
                button.textContent = String(d);
                const isChosen = chosen !== null && toISO(chosen) === toISO(date);
                button.setAttribute('aria-selected', String(isChosen));
                if (disabled(date)) {
                    // Disabled, and said so, rather than absent: a gap in
                    // the grid reads as a broken calendar.
                    button.setAttribute('aria-disabled', 'true');
                    button.dataset.kpDisabled = '';
                }
                // Exactly one day in the tab order, so Tab leaves the grid
                // instead of walking 31 buttons.
                button.tabIndex = d === day ? 0 : -1;
                renderDay?.(button, date);
                grid.append(button);
            }
            panel.prepend(head, grid);
        };

        /** Draw, and say so when the day grid now shows another month. */
        const redraw = () => {
            const before = shown;
            draw();
            if (view === 'days' && shown !== before)
                picker.dispatchEvent(
                    new CustomEvent(MONTH_EVENT, { bubbles: true, detail: { year: cursor.getFullYear(), month: cursor.getMonth() } }),
                );
        };
        const focusCurrent = () => /** @type {HTMLElement | null} */ (panel.querySelector('.kp-datepicker__grid [tabindex="0"]'))?.focus();
        /** Redraw after the view changed, say which grid shows, and put the focus in it. */
        const settle = () => {
            if (view === 'days') pin = null;
            redraw();
            const s = getStrings();
            const year = cursor.getFullYear();
            const from = yearBlockStart(year);
            live.textContent =
                view === 'days'
                    ? s.monthTitle(calendarNames(s, DEFAULT_STRINGS, locale).months[cursor.getMonth()] ?? '', year)
                    : view === 'months'
                      ? s.monthGrid(year)
                      : s.yearGrid(from, from + 11);
            focusCurrent();
        };
        /** Open the month or year grid over the current one. @param {DateView} next */
        const go = (next) => {
            if (view === 'days') pin = measureDateView(panel);
            back.push(cursor);
            view = next;
            settle();
        };
        /** Escape in the month or year grid: the grid below, where it was. */
        const stepBack = () => {
            cursor = back.pop() ?? cursor;
            view = view === 'years' ? 'months' : 'days';
            settle();
        };
        /** A month or year cell chosen: the grid below, on that month or year. @param {HTMLElement} cell */
        const pick = (cell) => {
            if (cell.getAttribute('aria-disabled') === 'true') return;
            if (cell.dataset.kpMonth !== undefined) {
                const [y, m] = cell.dataset.kpMonth.split('-').map(Number);
                cursor = clampToMonth(y ?? cursor.getFullYear(), (m ?? 1) - 1, cursor.getDate());
                view = 'days';
            } else {
                cursor = clampToMonth(Number(cell.dataset.kpYear), cursor.getMonth(), cursor.getDate());
                view = 'months';
            }
            back.pop();
            settle();
        };

        /** Takes the open panel out of the top layer again. */
        let lower = () => {};
        /** @param {boolean} next */
        const setOpen = (next) => {
            if (panel.hidden === !next) return;
            // Every opening starts on the days.
            view = 'days';
            back = [];
            pin = null;
            live.textContent = '';
            if (next) {
                cursor = read() ?? new Date();
                if (!panel.contains(live)) panel.append(live);
                draw();
            } else {
                panel.style.removeProperty('min-inline-size');
                panel.style.removeProperty('min-block-size');
            }
            panel.hidden = !next;
            if (next) lower = raiseDatePanel(panel);
            else {
                lower();
                lower = () => {};
            }
            open.setAttribute('aria-expanded', String(next));
            if (next) focusCurrent();
            picker.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: next } }));
        };
        const show = () => setOpen(true);
        const hide = () => setOpen(false);

        /** @param {Date | null} date @param {'typed' | 'chosen' | 'set'} source */
        const commit = (date, source) => {
            if (date === null) {
                delete input.dataset.kpDateValue;
                if (source !== 'typed') input.value = '';
            } else {
                if (source !== 'typed') input.value = formatDate(date, locale);
                input.dataset.kpDateValue = toISO(date);
            }
            picker.dispatchEvent(new CustomEvent(DATE_EVENT, { bubbles: true, detail: { iso: date === null ? null : toISO(date), date, source } }));
        };
        /** @param {Date} date */
        const choose = (date) => {
            if (disabled(date)) return;
            commit(date, 'chosen');
            if (closes) hide();
            if (refocus) input.focus();
        };

        const onOpen = () => (panel.hidden ? show() : hide());

        /** Typing is the primary path, so it updates the value on its own. */
        const onInput = () => commit(read(), 'typed');

        /** @param {KeyboardEvent} event */
        const onPanelKey = (event) => {
            // Escape steps back one grid, and closes from the days.
            if (event.key === 'Escape') {
                event.preventDefault();
                if (view === 'days') {
                    hide();
                    open.focus();
                } else stepBack();
                return;
            }
            const target = /** @type {HTMLElement} */ (event.target);
            const jump = /** @type {HTMLElement | null} */ (target.closest('[data-kp-month], [data-kp-year]'));
            if (jump !== null) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pick(jump);
                    return;
                }
                const year = cursor.getFullYear();
                const month = cursor.getMonth();
                const delta = jumpMove(event.key, jump.dataset.kpMonth !== undefined ? month : year - yearBlockStart(year));
                if (delta === null) return;
                event.preventDefault();
                cursor =
                    jump.dataset.kpMonth !== undefined
                        ? clampToMonth(year, month + delta, cursor.getDate())
                        : clampToMonth(year + delta, month, cursor.getDate());
                redraw();
                focusCurrent();
                return;
            }
            const day = /** @type {HTMLElement | null} */ (target.closest('[data-kp-day]'));
            if (day === null) return;
            const current = new Date(`${day.dataset.kpDay}T00:00:00`);
            const y = current.getFullYear();
            const m = current.getMonth();
            const d = current.getDate();
            const offset = (current.getDay() - firstDay + 7) % 7;
            /** @type {Record<string, Date>} */
            const moves = {
                ArrowRight: new Date(y, m, d + 1),
                ArrowLeft: new Date(y, m, d - 1),
                ArrowDown: new Date(y, m, d + 7),
                ArrowUp: new Date(y, m, d - 7),
                PageDown: new Date(y, m + 1, d),
                PageUp: new Date(y, m - 1, d),
                Home: new Date(y, m, d - offset),
                End: new Date(y, m, d + (6 - offset)),
            };
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                choose(current);
                return;
            }
            const moved = moves[event.key];
            if (moved === undefined) return;
            event.preventDefault();
            cursor = moved;
            redraw();
            /** @type {HTMLElement | null} */ (panel.querySelector(`[data-kp-day="${toISO(moved)}"]`))?.focus();
        };

        /** @param {MouseEvent} event */
        const onPanelClick = (event) => {
            const target = /** @type {HTMLElement} */ (event.target);
            const jump = /** @type {HTMLElement | null} */ (target.closest('[data-kp-month], [data-kp-year]'));
            if (jump !== null) {
                pick(jump);
                return;
            }
            const day = /** @type {HTMLElement | null} */ (target.closest('[data-kp-day]'));
            if (day === null) return;
            choose(new Date(`${day.dataset.kpDay}T00:00:00`));
        };

        const onFocusOut = () => {
            setTimeout(() => {
                if (!picker.contains(document.activeElement)) hide();
            }, 0);
        };

        open.setAttribute('aria-expanded', 'false');
        open.addEventListener('click', onOpen);
        input.addEventListener('input', onInput);
        panel.addEventListener('keydown', onPanelKey);
        panel.addEventListener('click', onPanelClick);
        picker.addEventListener('focusout', onFocusOut);
        // The value attribute reflects what is in the field, silently.
        const initial = read();
        if (initial !== null) input.dataset.kpDateValue = toISO(initial);

        /** @type {DatePickerHandle} */
        const handle = {
            element: picker,
            get: read,
            set: (date) => {
                const parsed = date === null ? null : typeof date === 'string' ? parseLocale(date, locale) : date;
                commit(parsed, 'set');
                if (parsed !== null) cursor = parsed;
                if (!panel.hidden) draw();
            },
            open: show,
            close: hide,
        };
        handles.set(picker, handle);
        created.push(handle);

        cleanups.push(() => {
            open.removeEventListener('click', onOpen);
            input.removeEventListener('input', onInput);
            panel.removeEventListener('keydown', onPanelKey);
            panel.removeEventListener('click', onPanelClick);
            picker.removeEventListener('focusout', onFocusOut);
            lower();
            panel.textContent = '';
            panel.style.removeProperty('min-inline-size');
            panel.style.removeProperty('min-block-size');
            panel.hidden = before.panelHidden;
            input.placeholder = before.placeholder;
            if (before.value === undefined) delete input.dataset.kpDateValue;
            else input.dataset.kpDateValue = before.value;
            if (before.expanded === null) open.removeAttribute('aria-expanded');
            else open.setAttribute('aria-expanded', before.expanded);
            handles.delete(picker);
            delete picker.dataset.kpDatepickerAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
