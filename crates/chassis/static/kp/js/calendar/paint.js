// Repaints the grid in place: the month's title, each day's tone and words, the tab stop, and the busy layers that leave.

import { isCalmTones } from '../calm-tones.js';
import { BUSY_LAYERS, leaveBusyLayers } from './busy.js';
import { dayFor } from './day.js';
import { dayKey, formatDayKey, monthCells, two } from './dates.js';
import { keyOf } from './dom.js';
import { syncStatePlate } from './plate.js';

/** @typedef {import('./controller.js').CalendarController} Calendar */

/** The month the calendar shows, as `YYYY-MM`. @param {Calendar} c */
export const monthKey = (c) => `${c.year}-${two(c.month)}`;

/** The layers on screen now that a theme may let leave first (`--kp-calendar-busy-leave: hold`). @param {Calendar} c @param {boolean} busy */
function busyLayersToLeave(c, busy) {
    if (busy || c.grid.getAttribute('aria-busy') !== 'true') return [];
    return [...c.el.querySelectorAll(BUSY_LAYERS)].filter(
        (layer) => layer.getClientRects().length > 0 && getComputedStyle(layer).getPropertyValue('--kp-calendar-busy-leave').trim() === 'hold',
    );
}

/** Replay a cell's arrival when the month changed. @param {HTMLElement} target */
function replayArrival(target) {
    target.style.animation = 'none';
    void target.offsetHeight;
    target.style.animation = '';
}

/** One cell of the grid: a day of the shown month, or a quiet pad for a neighbour's. @param {Calendar} c @param {number} i @param {string} iso @param {string} today @param {string} stop @param {boolean} monthChanged */
function paintCell(c, i, iso, today, stop, monthChanged) {
    const cell = c.cells[i];
    if (!cell) return;
    const mine = !!iso && iso.startsWith(monthKey(c));
    cell.button.hidden = !mine;
    cell.pad.hidden = mine;
    cell.pad.textContent = mine ? '' : iso.slice(8, 10);
    cell.td.toggleAttribute('data-kp-pad', !mine);
    if (monthChanged) replayArrival(mine ? cell.button : cell.pad);
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
    // A calm cell prints a count on a logged day only, never on a quiet or a paused one.
    const counted = day.count && (isCalmTones(c.el) ? day.tone === 'logged' : !['future', 'before', 'loading'].includes(day.tone));
    // A no-break space keeps the count's line when there is none, so every day is one height.
    cell.count.textContent = counted ? /** @type {string} */ (day.count) : ' ';
    const words = day.label === '' ? formatDayKey(iso) : c.strings.calendarDay(formatDayKey(iso), day.label);
    cell.button.setAttribute('aria-label', words);
    cell.button.title = words;
    cell.td.setAttribute('aria-selected', String(iso === c.selected));
    cell.button.tabIndex = iso === stop ? 0 : -1;
    if (monthChanged) c.decorate?.(cell.button, { kind: 'day', host: c.el, key: keyOf(c.el), index: i, value: iso });
}

/** Repaint the grid in place: tones, words and the tab stop, never new buttons. @param {Calendar} c */
export function paintCalendar(c) {
    const busy = c.state === 'loading';
    const leaving = busyLayersToLeave(c, busy);
    // Loading again while they leave: they stay, as they arrive.
    if (busy) for (const layer of c.el.querySelectorAll(`:is(${BUSY_LAYERS})[data-kp-leaving]`)) layer.removeAttribute('data-kp-leaving');
    const ym = monthKey(c);
    const today = dayKey(c.now(), c.timeZone);
    const monthChanged = c.shownMonth !== ym;
    c.shownMonth = ym;
    c.title.textContent = c.strings.monthTitle(c.months[c.month - 1] ?? '', c.year);
    c.grid.setAttribute('aria-busy', String(busy));
    const inMonth = (/** @type {string | null} */ iso) => !!iso && iso.startsWith(ym);
    // One tab stop: the day last moved to, else the picked day, else today, else the 1st.
    const stop = [c.focus, c.selected, today].find(inMonth) ?? `${ym}-01`;
    monthCells(c.year, c.month, c.firstDay).forEach((iso, i) => paintCell(c, i, iso, today, stop, monthChanged));
    if (leaving.length > 0) leaveBusyLayers(leaving);
    syncStatePlate(c);
}
