// Which grid the panel shows (days, months or years): redraws, the steps in and out of the month and year grids, and the focus.

import { DEFAULT_STRINGS, getStrings } from '../strings.js';
import { calendarNames } from '../locale.js';
import { MONTH_EVENT, YEARS_PER_BLOCK } from './constants.js';
import { clampToMonth, yearBlockStart } from './dates.js';
import { drawPanel } from './grid.js';
import { measureDateView } from './place.js';

/** The shown grid of one picker and the way back out of it [scope-89]. */
export class DateViews {
    /** @param {import('./controller.js').DatePickerController} ctl */
    constructor(ctl) {
        this.ctl = ctl;
        /** Which grid the panel shows. @type {import('./constants.js').DateView} */
        this.view = 'days';
        /** Where Escape steps back to: the cursor as it was when each view opened. @type {Date[]} */
        this.back = [];
        /** The day view's size, held while the month or year grid shows. @type {ReturnType<typeof measureDateView> | null} */
        this.pin = null;
        /** The month the day grid last drew, so the month event fires on a change only. */
        this.shown = '';
    }

    /** Every opening starts on the days. */
    reset() {
        this.view = 'days';
        this.back = [];
        this.pin = null;
    }

    /** Draw, and say so when the day grid now shows another month. */
    redraw() {
        const before = this.shown;
        drawPanel(this.ctl);
        if (this.view === 'days' && this.shown !== before) {
            const { picker, cursor } = this.ctl;
            picker.dispatchEvent(new CustomEvent(MONTH_EVENT, { bubbles: true, detail: { year: cursor.getFullYear(), month: cursor.getMonth() } }));
        }
    }

    focusCurrent() {
        /** @type {HTMLElement | null} */ (this.ctl.panel.querySelector('.kp-datepicker__grid [tabindex="0"]'))?.focus();
    }

    /** Redraw after the view changed, say which grid shows, and put the focus in it. */
    settle() {
        const { cursor, live, settings } = this.ctl;
        if (this.view === 'days') this.pin = null;
        this.redraw();
        const s = getStrings();
        const year = cursor.getFullYear();
        const from = yearBlockStart(year);
        live.textContent =
            this.view === 'days'
                ? s.monthTitle(calendarNames(s, DEFAULT_STRINGS, settings.locale).months[cursor.getMonth()] ?? '', year)
                : this.view === 'months'
                  ? s.monthGrid(year)
                  : s.yearGrid(from, from + YEARS_PER_BLOCK - 1);
        this.focusCurrent();
    }

    /** Open the month or year grid over the current one. @param {import('./constants.js').DateView} next */
    go(next) {
        if (this.view === 'days') this.pin = measureDateView(this.ctl.panel);
        this.back.push(this.ctl.cursor);
        this.view = next;
        this.settle();
    }

    /** Escape in the month or year grid: the grid below, where it was. */
    stepBack() {
        this.ctl.cursor = this.back.pop() ?? this.ctl.cursor;
        this.view = this.view === 'years' ? 'months' : 'days';
        this.settle();
    }

    /** A month or year cell chosen: the grid below, on that month or year. @param {HTMLElement} cell */
    pick(cell) {
        if (cell.getAttribute('aria-disabled') === 'true') return;
        const { cursor } = this.ctl;
        if (cell.dataset.kpMonth !== undefined) {
            const [y, m] = cell.dataset.kpMonth.split('-').map(Number);
            this.ctl.cursor = clampToMonth(y ?? cursor.getFullYear(), (m ?? 1) - 1, cursor.getDate());
            this.view = 'days';
        } else {
            this.ctl.cursor = clampToMonth(Number(cell.dataset.kpYear), cursor.getMonth(), cursor.getDate());
            this.view = 'months';
        }
        this.back.pop();
        this.settle();
    }
}
