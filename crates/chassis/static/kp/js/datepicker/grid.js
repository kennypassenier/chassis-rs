// Draws the panel: the head with its steps and title, and the day, month or year grid under it.

import { DEFAULT_STRINGS, getStrings } from '../strings.js';
import { calendarNames } from '../locale.js';
import { DAYS_PER_WEEK, MONTHS_PER_YEAR, YEARS_PER_BLOCK } from './constants.js';
import { clampToMonth, outsideRange, toISO, yearBlockStart } from './dates.js';

/** @typedef {import('./controller.js').DatePickerController} Ctl */
/** @typedef {import('../strings/types.js').Strings} Strings */
/** @typedef {ReturnType<typeof calendarNames>} Names */

/**
 * What the head's two steps say and do in the shown view: a month, a year or a block of years at a time.
 * @param {Ctl} ctl @param {Strings} s
 */
function stepsFor(ctl, s) {
    const year = ctl.cursor.getFullYear();
    const month = ctl.cursor.getMonth();
    const day = ctl.cursor.getDate();
    return {
        days: [s.previousMonth, s.nextMonth, () => new Date(year, month - 1, 1), () => new Date(year, month + 1, 1)],
        months: [s.previousYear, s.nextYear, () => clampToMonth(year - 1, month, day), () => clampToMonth(year + 1, month, day)],
        years: [
            s.previousYears,
            s.nextYears,
            () => clampToMonth(year - YEARS_PER_BLOCK, month, day),
            () => clampToMonth(year + YEARS_PER_BLOCK, month, day),
        ],
    }[ctl.views.view];
}

/** @param {Ctl} ctl @param {string} label @param {string} glyph @param {() => Date} to @param {number} slot */
function buildStep(ctl, label, glyph, to, slot) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kp-button kp-button--ghost';
    button.setAttribute('aria-label', label);
    button.textContent = glyph;
    button.addEventListener('click', () => {
        ctl.cursor = to();
        ctl.views.redraw();
        // The redraw replaced the button; the focus stays on its successor.
        /** @type {HTMLElement | undefined} */ (ctl.panel.querySelector('.kp-datepicker__head')?.children[slot])?.focus();
    });
    return button;
}

/** @param {Ctl} ctl @param {Strings} s @param {Names} names */
function buildHead(ctl, s, names) {
    const { view } = ctl.views;
    const year = ctl.cursor.getFullYear();
    const month = ctl.cursor.getMonth();
    const from = yearBlockStart(year);
    const head = document.createElement('div');
    head.className = 'kp-datepicker__head';
    const moves = stepsFor(ctl, s);
    const previous = buildStep(ctl, /** @type {string} */ (moves[0]), ctl.settings.previousGlyph, /** @type {() => Date} */ (moves[2]), 0);
    const next = buildStep(ctl, /** @type {string} */ (moves[1]), ctl.settings.nextGlyph, /** @type {() => Date} */ (moves[3]), 2);

    // The title opens the next grid up; the year grid is the top, so its title is only a title.
    const title = document.createElement(view === 'years' ? 'span' : 'button');
    title.className = 'kp-datepicker__title';
    title.id = `${ctl.input.id || 'kp-date'}-title`;
    const monthTitle = s.monthTitle(names.months[month] ?? '', year);
    title.textContent = view === 'days' ? monthTitle : view === 'months' ? String(year) : s.yearRange(from, from + YEARS_PER_BLOCK - 1);
    if (title instanceof HTMLButtonElement) {
        title.type = 'button';
        title.setAttribute('aria-label', view === 'days' ? s.chooseMonth(monthTitle) : s.chooseYear(year));
        title.addEventListener('click', () => ctl.views.go(view === 'days' ? 'months' : 'years'));
    }
    head.append(previous, title, next);
    return head;
}

/** Hold the day view's size while the month or year grid shows. @param {Ctl} ctl @param {HTMLElement} grid */
function holdSize(ctl, grid) {
    const { panel } = ctl;
    const { view, pin } = ctl.views;
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
}

/** A month or a year: a day cell to every register. @param {string} text @param {boolean} current @param {boolean} off */
function jumpCell(text, current, off) {
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
}

/** The twelve months of the shown year. @param {Ctl} ctl @param {HTMLElement} grid @param {Strings} s @param {Names} names */
function fillMonths(ctl, grid, s, names) {
    const { min, max } = ctl.settings;
    const year = ctl.cursor.getFullYear();
    grid.setAttribute('aria-label', s.monthGrid(year));
    for (let m = 0; m < MONTHS_PER_YEAR; m += 1) {
        const cell = jumpCell(
            names.monthsShort[m] ?? '',
            m === ctl.cursor.getMonth(),
            outsideRange(new Date(year, m, 1), new Date(year, m + 1, 0), min, max),
        );
        cell.dataset.kpMonth = `${year}-${String(m + 1).padStart(2, '0')}`;
        cell.setAttribute('aria-label', s.monthTitle(names.months[m] ?? '', year));
        grid.append(cell);
    }
}

/** The block of twelve years that holds the shown year. @param {Ctl} ctl @param {HTMLElement} grid @param {Strings} s */
function fillYears(ctl, grid, s) {
    const { min, max } = ctl.settings;
    const year = ctl.cursor.getFullYear();
    const from = yearBlockStart(year);
    grid.setAttribute('aria-label', s.yearGrid(from, from + YEARS_PER_BLOCK - 1));
    for (let y = from; y < from + YEARS_PER_BLOCK; y += 1) {
        const cell = jumpCell(String(y), y === year, outsideRange(new Date(y, 0, 1), new Date(y, 11, 31), min, max));
        cell.dataset.kpYear = String(y);
        grid.append(cell);
    }
}

/**
 * The weekday headings rotate with the first day: Sunday first for a locale that starts there, Monday for one that does not.
 * Column i holds the days whose getDay() is (firstDay + i) % 7, so the names are counted the same way — the dictionary is
 * Monday first, and indexing it with a Sunday-zero day put every heading one column off [gap-11].
 * @param {Ctl} ctl @param {HTMLElement} grid @param {Names} names
 */
function addWeekdays(ctl, grid, names) {
    for (let i = 0; i < DAYS_PER_WEEK; i += 1) {
        const weekday = names.weekdays[(ctl.settings.firstDay + i) % DAYS_PER_WEEK] ?? '';
        const cell = document.createElement('span');
        cell.className = 'kp-datepicker__weekday';
        cell.setAttribute('role', 'columnheader');
        cell.setAttribute('aria-label', weekday);
        cell.textContent = weekday;
        grid.append(cell);
    }
}

/** One day button. @param {Ctl} ctl @param {Strings} s @param {Names} names @param {Date} date @param {Date | null} chosen */
function dayCell(ctl, s, names, date, chosen) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kp-datepicker__day';
    button.dataset.kpDay = toISO(date);
    button.setAttribute('role', 'gridcell');
    // The full date as the name: "4" alone tells a screen reader nothing about which month it is in.
    button.setAttribute('aria-label', s.dayLabel(date.getDate(), names.months[date.getMonth()] ?? '', date.getFullYear()));
    button.textContent = String(date.getDate());
    button.setAttribute('aria-selected', String(chosen !== null && toISO(chosen) === toISO(date)));
    if (ctl.disabled(date)) {
        // Disabled, and said so, rather than absent: a gap in the grid reads as a broken calendar.
        button.setAttribute('aria-disabled', 'true');
        button.dataset.kpDisabled = '';
    }
    // Exactly one day in the tab order, so Tab leaves the grid instead of walking 31 buttons.
    button.tabIndex = date.getDate() === ctl.cursor.getDate() ? 0 : -1;
    ctl.settings.renderDay?.(button, date);
    return button;
}

/** The days of the shown month, led by blanks up to the first weekday. @param {Ctl} ctl @param {HTMLElement} grid @param {Strings} s @param {Names} names @param {Date | null} chosen */
function fillDays(ctl, grid, s, names, chosen) {
    const year = ctl.cursor.getFullYear();
    const month = ctl.cursor.getMonth();
    ctl.views.shown = `${year}-${month}`;
    const lead = (new Date(year, month, 1).getDay() - ctl.settings.firstDay + DAYS_PER_WEEK) % DAYS_PER_WEEK;
    const days = new Date(year, month + 1, 0).getDate();
    // Named by what the title shows; the title's own name now also says what it opens.
    grid.setAttribute('aria-label', s.monthTitle(names.months[month] ?? '', year));
    addWeekdays(ctl, grid, names);
    for (let i = 0; i < lead; i += 1) {
        const blank = document.createElement('span');
        blank.className = 'kp-datepicker__blank';
        grid.append(blank);
    }
    for (let d = 1; d <= days; d += 1) grid.append(dayCell(ctl, s, names, new Date(year, month, d), chosen));
}

/** Draw the panel for the shown view, replacing what it held (its live region stays). @param {Ctl} ctl */
export function drawPanel(ctl) {
    const { panel, live } = ctl;
    const { view } = ctl.views;
    const chosen = ctl.read();
    const s = getStrings();
    // The names follow the picker's locale; a consumer's own dictionary still wins [gap-11].
    const names = calendarNames(s, DEFAULT_STRINGS, ctl.settings.locale);
    for (const child of [...panel.children]) if (child !== live) child.remove();
    const head = buildHead(ctl, s, names);
    const grid = document.createElement('div');
    grid.className = 'kp-datepicker__grid';
    grid.dataset.kpView = view;
    grid.setAttribute('role', 'grid');
    holdSize(ctl, grid);
    if (view === 'months') fillMonths(ctl, grid, s, names);
    else if (view === 'years') fillYears(ctl, grid, s);
    else fillDays(ctl, grid, s, names, chosen);
    panel.prepend(head, grid);
}
