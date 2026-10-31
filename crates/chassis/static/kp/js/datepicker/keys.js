// The panel's keyboard and pointer: Escape steps back, arrows move the focus, Enter chooses, a click picks a day, month or year.

import { DAYS_PER_WEEK, LAST_WEEKDAY } from './constants.js';
import { clampToMonth, jumpMove, toISO, yearBlockStart } from './dates.js';

/** @typedef {import('./controller.js').DatePickerController} Ctl */

/** The cell of a month or year grid under an event target, if any. @param {HTMLElement} target */
const jumpCellOf = (target) => /** @type {HTMLElement | null} */ (target.closest('[data-kp-month], [data-kp-year]'));
/** The day button under an event target, if any. @param {HTMLElement} target */
const dayCellOf = (target) => /** @type {HTMLElement | null} */ (target.closest('[data-kp-day]'));
/** Whether a key chooses the focused cell. @param {KeyboardEvent} event */
const isChoose = (event) => event.key === 'Enter' || event.key === ' ';

/** A key in the month or year grid: Enter picks, the other keys move the focus. @param {Ctl} ctl @param {KeyboardEvent} event @param {HTMLElement} jump */
function onJumpKey(ctl, event, jump) {
    if (isChoose(event)) {
        event.preventDefault();
        ctl.views.pick(jump);
        return;
    }
    const year = ctl.cursor.getFullYear();
    const month = ctl.cursor.getMonth();
    const delta = jumpMove(event.key, jump.dataset.kpMonth !== undefined ? month : year - yearBlockStart(year));
    if (delta === null) return;
    event.preventDefault();
    ctl.cursor =
        jump.dataset.kpMonth !== undefined
            ? clampToMonth(year, month + delta, ctl.cursor.getDate())
            : clampToMonth(year + delta, month, ctl.cursor.getDate());
    ctl.views.redraw();
    ctl.views.focusCurrent();
}

/** The date each key moves to from `current`. @param {Date} current @param {number} firstDay @returns {Record<string, Date>} */
function dayMoves(current, firstDay) {
    const y = current.getFullYear();
    const m = current.getMonth();
    const d = current.getDate();
    const offset = (current.getDay() - firstDay + DAYS_PER_WEEK) % DAYS_PER_WEEK;
    return {
        ArrowRight: new Date(y, m, d + 1),
        ArrowLeft: new Date(y, m, d - 1),
        ArrowDown: new Date(y, m, d + DAYS_PER_WEEK),
        ArrowUp: new Date(y, m, d - DAYS_PER_WEEK),
        PageDown: new Date(y, m + 1, d),
        PageUp: new Date(y, m - 1, d),
        Home: new Date(y, m, d - offset),
        End: new Date(y, m, d + (LAST_WEEKDAY - offset)),
    };
}

/** A key on a day: Enter chooses, the other keys move the cursor. @param {Ctl} ctl @param {KeyboardEvent} event @param {HTMLElement} day */
function onDayKey(ctl, event, day) {
    const current = new Date(`${day.dataset.kpDay}T00:00:00`);
    const moves = dayMoves(current, ctl.settings.firstDay);
    if (isChoose(event)) {
        event.preventDefault();
        ctl.choose(current);
        return;
    }
    const moved = moves[event.key];
    if (moved === undefined) return;
    event.preventDefault();
    ctl.cursor = moved;
    ctl.views.redraw();
    /** @type {HTMLElement | null} */ (ctl.panel.querySelector(`[data-kp-day="${toISO(moved)}"]`))?.focus();
}

/** @param {Ctl} ctl @param {KeyboardEvent} event */
export function onPanelKey(ctl, event) {
    // Escape steps back one grid, and closes from the days.
    if (event.key === 'Escape') {
        event.preventDefault();
        if (ctl.views.view === 'days') {
            ctl.hide();
            ctl.opening.refocusAfterClose(ctl.open);
        } else ctl.views.stepBack();
        return;
    }
    const target = /** @type {HTMLElement} */ (event.target);
    const jump = jumpCellOf(target);
    if (jump !== null) return onJumpKey(ctl, event, jump);
    const day = dayCellOf(target);
    if (day !== null) onDayKey(ctl, event, day);
}

/** @param {Ctl} ctl @param {MouseEvent} event */
export function onPanelClick(ctl, event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const jump = jumpCellOf(target);
    if (jump !== null) {
        ctl.views.pick(jump);
        return;
    }
    const day = dayCellOf(target);
    if (day === null) return;
    ctl.choose(new Date(`${day.dataset.kpDay}T00:00:00`));
}
