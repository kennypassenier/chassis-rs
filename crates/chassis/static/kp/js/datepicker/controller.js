// One date picker: the field, the open button and the panel; typing, choosing, setting, and the handle a page gets back.

import { formatDate, datePattern, parseDate as parseLocale } from '../locale.js';
import { Controller } from '../controller.js';
import { stopClose } from '../motion.js';
import { DATE_EVENT } from './constants.js';
import { toISO } from './dates.js';
import { drawPanel } from './grid.js';
import { onPanelClick, onPanelKey } from './keys.js';
import { PanelOpening } from './opening.js';
import { readSettings } from './settings.js';
import { DateViews } from './views.js';

/** The parts a picker is made of, or null when its markup lacks one. @param {HTMLElement} picker */
export function partsOf(picker) {
    const input = /** @type {HTMLInputElement | null} */ (picker.querySelector('[data-kp-date-input]'));
    const open = /** @type {HTMLButtonElement | null} */ (picker.querySelector('[data-kp-date-open]'));
    const panel = /** @type {HTMLElement | null} */ (picker.querySelector('[data-kp-date-panel]'));
    return input === null || open === null || panel === null ? null : { input, open, panel };
}

/** A date picker. */
export class DatePickerController extends Controller {
    /**
     * @param {HTMLElement} host the picker
     * @param {import('./constants.js').DatePickerOptions} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.picker = host;
        const parts = /** @type {NonNullable<ReturnType<typeof partsOf>>} */ (partsOf(host));
        this.input = parts.input;
        this.open = parts.open;
        this.panel = parts.panel;
        this.settings = readSettings(host, options);
        /** The day the panel is on and that has the focus in the day grid. */
        this.cursor = new Date();
        /** Says which grid opened. One element kept across redraws: a live region created together with its text is one a screen reader may never read. */
        this.live = document.createElement('span');
        this.views = new DateViews(this);
        this.opening = new PanelOpening(this);
        /** What the markup held before the picker touched it, for the way back out. */
        /** @type {{ placeholder: string, value: string | undefined, expanded: string | null, panelHidden: boolean | 'until-found' }} */
        this.before = { placeholder: '', value: undefined, expanded: null, panelHidden: false };
        /** @type {import('./constants.js').DatePickerHandle | null} */
        this.handle = null;
    }

    connect() {
        const { picker, input, open, panel, settings } = this;
        picker.dataset.kpDatepickerAttached = '';
        // The panel redraws its days, months and years on every move; only opening it is an arrival
        // (the theme's own entrance), so a redraw must not play the arrival of what was drawn.
        panel.dataset.kpArrive = 'none';
        this.before = {
            placeholder: input.placeholder,
            value: input.dataset.kpDateValue,
            expanded: open.getAttribute('aria-expanded'),
            panelHidden: panel.hidden,
        };
        this.opening.wanted = !panel.hidden;
        // The hint follows the locale, so it cannot lie about the format.
        if (input.placeholder === '') input.placeholder = datePattern(settings.locale, settings.numeric).hint;
        this.cursor = this.read() ?? new Date();
        this.live.className = 'kp-sr-only';
        this.live.setAttribute('aria-live', 'polite');
        this.own(() => this.restore());
        open.setAttribute('aria-expanded', 'false');
        this.listen(open, 'click', () => (this.opening.wanted ? this.hide() : this.show()));
        // Typing is the primary path, so it updates the value on its own.
        this.listen(input, 'input', () => this.commit(this.read(), 'typed'));
        this.listen(input, 'change', () => this.tidy());
        this.listen(panel, 'keydown', (event) => onPanelKey(this, /** @type {KeyboardEvent} */ (event)));
        this.listen(panel, 'click', (event) => onPanelClick(this, /** @type {MouseEvent} */ (event)));
        this.listen(picker, 'focusout', () => this.onFocusOut());
        // The value attribute reflects what is in the field, silently.
        const initial = this.read();
        if (initial !== null) input.dataset.kpDateValue = toISO(initial);
        // No rewrite at attach: the page's text stays until the field is left or the calendar opens (tidy).
        this.handle = this.makeHandle();
    }

    /** Put back what the picker changed on its markup. */
    restore() {
        const { picker, input, open, panel, before } = this;
        stopClose(panel);
        panel.inert = false;
        this.opening.lower();
        panel.textContent = '';
        panel.style.removeProperty('min-inline-size');
        panel.style.removeProperty('min-block-size');
        panel.hidden = before.panelHidden;
        input.placeholder = before.placeholder;
        if (before.value === undefined) delete input.dataset.kpDateValue;
        else input.dataset.kpDateValue = before.value;
        if (before.expanded === null) open.removeAttribute('aria-expanded');
        else open.setAttribute('aria-expanded', before.expanded);
        delete picker.dataset.kpDatepickerAttached;
    }

    /** The date in the field, or null when it is empty or not a date. */
    read() {
        return this.input.value.trim() === '' ? null : parseLocale(this.input.value, this.settings.locale, this.settings.numeric);
    }

    /** Whether a day may not be chosen: outside the range, on a disabled weekday, or refused by the page. @param {Date} date */
    disabled(date) {
        const { min, max, disabledDays, isDateDisabled } = this.settings;
        if (min !== null && date < min) return true;
        if (max !== null && date > max) return true;
        if (disabledDays.includes(date.getDay())) return true;
        return isDateDisabled?.(date) ?? false;
    }

    draw() {
        drawPanel(this);
    }

    show() {
        this.opening.setOpen(true);
    }

    hide() {
        this.opening.setOpen(false);
    }

    /** @param {Date | null} date @param {'typed' | 'chosen' | 'set'} source */
    commit(date, source) {
        const { input, picker, settings } = this;
        if (date === null) {
            delete input.dataset.kpDateValue;
            if (source !== 'typed') input.value = '';
        } else {
            if (source !== 'typed') input.value = formatDate(date, settings.locale, settings.numeric);
            input.dataset.kpDateValue = toISO(date);
        }
        picker.dispatchEvent(new CustomEvent(DATE_EVENT, { bubbles: true, detail: { iso: date === null ? null : toISO(date), date, source } }));
    }

    /** @param {Date} date */
    choose(date) {
        if (this.disabled(date)) return;
        const { closes, refocus } = this.settings;
        this.commit(date, 'chosen');
        if (closes) this.hide();
        if (refocus && closes) this.opening.refocusAfterClose(this.input);
        else if (refocus) this.input.focus();
    }

    /**
     * A typed date that reads as a date is written the way the field shows a date
     * (13-09-2026 becomes 13/09/2026), once the person leaves the field or opens the
     * calendar; never while they type, and never a text that is not a date [scope-143].
     */
    tidy() {
        const date = this.read();
        if (date === null) return;
        const shown = formatDate(date, this.settings.locale, this.settings.numeric);
        if (this.input.value !== shown) this.input.value = shown;
    }

    onFocusOut() {
        setTimeout(() => {
            if (!this.picker.contains(document.activeElement)) this.hide();
        }, 0);
    }

    /** @returns {import('./constants.js').DatePickerHandle} */
    makeHandle() {
        return {
            element: this.picker,
            get: () => this.read(),
            set: (date) => {
                const parsed =
                    date === null ? null : typeof date === 'string' ? parseLocale(date, this.settings.locale, this.settings.numeric) : date;
                this.commit(parsed, 'set');
                if (parsed !== null) this.cursor = parsed;
                if (!this.panel.hidden) this.draw();
            },
            open: () => this.show(),
            close: () => this.hide(),
        };
    }
}
