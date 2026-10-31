// Builds the calendar's elements once: the navigation, the state line, the six-week grid of buttons, the busy layer and the legend.

import { DAY_MS, DAYS_PER_WEEK, GRID_WEEKS, SUNDAY_REFERENCE } from './constants.js';
import { make } from './dom.js';
import { nextTitleNumber } from './state.js';

/** @typedef {import('../strings.js').Strings} Strings */

/** The Previous, Next and Today buttons around the month's title. @param {HTMLElement} el @param {Strings} s */
function buildNav(el, s) {
    const doc = el.ownerDocument;
    const nav = make(doc, 'div', 'kp-calendar__nav');
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', s.calendarNav);
    const prev = make(doc, 'button', 'kp-button kp-button--sm', s.calendarPrev);
    prev.type = 'button';
    prev.setAttribute('aria-label', s.previousMonth);
    prev.title = s.previousMonth;
    prev.dataset.kpCalendarPrev = '';
    const title = make(doc, /** @type {'h2'} */ (`h${el.dataset.kpHeadingLevel ?? '2'}`), 'kp-calendar__title');
    title.id = `kp-calendar-title-${nextTitleNumber()}`;
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
    return { nav, prev, title, next, todayButton };
}

/** The weekday headings, rotated to the first day of the week. @param {Document} doc @param {string} locale @param {number} firstDay */
function buildHead(doc, locale, firstDay) {
    const head = make(doc, 'thead');
    const headRow = make(doc, 'tr');
    // 4 January 2026 was a Sunday, so day `firstDay + d` of that week is the d-th column.
    const long = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
    const short = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    for (let d = 0; d < DAYS_PER_WEEK; d += 1) {
        const at = SUNDAY_REFERENCE + ((firstDay + d) % DAYS_PER_WEEK) * DAY_MS;
        const th = make(doc, 'th', '', short.format(at));
        th.scope = 'col';
        th.abbr = long.format(at);
        headRow.append(th);
    }
    head.append(headRow);
    return head;
}

/** One day's cell: a button with its number, count and busy spinner, and the quiet pad that stands in for a neighbouring month's day. @param {Document} doc */
function buildCell(doc) {
    const td = make(doc, 'td');
    const button = make(doc, 'button', 'kp-calendar__day');
    button.type = 'button';
    const num = make(doc, 'span', 'kp-calendar__num');
    const count = make(doc, 'span', 'kp-calendar__count', ' ');
    // A spinner for a loading day, shown only by `.kp-calendar--busy-days`.
    const busy = make(doc, 'span', 'kp-calendar__day-busy');
    busy.setAttribute('aria-hidden', 'true');
    busy.append(make(doc, 'span', 'kp-spinner'));
    button.append(num, count, busy);
    const pad = make(doc, 'span', 'kp-calendar__pad');
    pad.setAttribute('aria-hidden', 'true');
    td.append(button, pad);
    return { td, button, num, count, pad };
}

/** The body of six week rows. @param {Document} doc */
function buildBody(doc) {
    const body = make(doc, 'tbody');
    /** @type {{ td: HTMLTableCellElement, button: HTMLButtonElement, num: HTMLElement, count: HTMLElement, pad: HTMLElement }[]} */
    const cells = [];
    for (let w = 0; w < GRID_WEEKS; w += 1) {
        const tr = make(doc, 'tr');
        for (let d = 0; d < DAYS_PER_WEEK; d += 1) {
            const cell = buildCell(doc);
            tr.append(cell.td);
            cells.push(cell);
        }
        body.append(tr);
    }
    return { body, cells };
}

/**
 * Build the calendar into `el`: nothing is wired here.
 * @param {HTMLElement} el @param {Strings} s @param {string} locale @param {number} firstDay
 */
export function buildCalendar(el, s, locale, firstDay) {
    const doc = el.ownerDocument;
    const { nav, prev, title, next, todayButton } = buildNav(el, s);
    const stateLine = make(doc, 'p', 'kp-calendar__state');
    stateLine.setAttribute('role', 'status');
    const grid = make(doc, 'table', 'kp-calendar__grid');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-labelledby', title.id);
    const { body, cells } = buildBody(doc);
    grid.append(buildHead(doc, locale, firstDay), body);
    const legend = make(doc, 'ul', 'kp-calendar__legend');
    legend.hidden = true;
    // One spinner over the whole grid while it loads, shown only by `.kp-calendar--busy-whole`.
    const busy = make(doc, 'div', 'kp-calendar__busy');
    busy.setAttribute('aria-hidden', 'true');
    const busyText = make(doc, 'span', 'kp-calendar__busy-text');
    busyText.textContent = s.loading ?? 'Loading…';
    busy.append(busyText, make(doc, 'span', 'kp-spinner'));
    const caption = make(doc, 'p', 'kp-calendar__caption');
    caption.hidden = true;
    el.replaceChildren(nav, stateLine, grid, busy, caption, legend);
    if (!el.hasAttribute('aria-labelledby') && !el.hasAttribute('aria-label')) el.setAttribute('aria-labelledby', title.id);
    return { prev, next, todayButton, title, stateLine, grid, body, cells, legend, busyText };
}
