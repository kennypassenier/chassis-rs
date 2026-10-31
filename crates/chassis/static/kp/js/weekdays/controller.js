// One wired picker: placed and built, the days it is given, the chips and quick picks a person presses, and its first value.

import { attachSegmented, SEGMENTED_EVENT, setSegmentedItems, setSegmentedValues } from '../segmented.js';
import { WeekdaysCore } from './core.js';
import { dayNumber } from './names.js';
import { MONTH_DAYS, SETS, WEEKDAYS_EVENT } from './values.js';

export class WeekdayPicker extends WeekdaysCore {
    /**
     * @param {HTMLElement} host
     * @param {{ locale?: string, weekStartsOn?: number }} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** What the page gets back, the same object every time. @type {import('../weekdays.js').WeekdaysHandle} */
        this.handle = {
            element: host,
            values: () => this.values(),
            set: (next) => this.set(next),
            summary: () => this.words(),
            valid: () => this.valid(),
        };
    }

    connect() {
        const el = this.host;
        el.classList.add('kp-weekdays');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
        if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', this.label);
        const { summary, why, reason } = this.lines;
        el.replaceChildren(this.group, this.quick.quick, summary, why, reason);
        setSegmentedItems(this.group, this.items);
        // Registered first, so they run last on detach: the segmented control goes, then the host is emptied.
        this.own(() => {
            el.replaceChildren();
            el.removeAttribute('aria-describedby');
            el.removeAttribute('aria-invalid');
            el.removeAttribute('data-kp-invalid');
        });
        this.own(attachSegmented(el));
        this.listen(this.group, SEGMENTED_EVENT, (event) => this.onChips(event));
        this.listen(this.quick.quick, 'click', (event) => this.onPreset(/** @type {MouseEvent} */ (event)));
        this.set(
            (el.dataset.kpValue ?? '')
                .split(/[\s,]+/)
                .map((v) => v.trim())
                .filter(Boolean),
        );
        this.paint();
    }

    /** Replace the picked days, without the event. @param {readonly (number | string)[]} next */
    set(next) {
        const { month } = this.o;
        const wanted = new Set(
            next
                .map((v) => (month ? (String(v).toLowerCase() === 'last' ? 'last' : String(Math.round(Number(v)))) : String(dayNumber(v))))
                .filter((v) => (month ? v === 'last' || (Number(v) >= 1 && Number(v) <= MONTH_DAYS) : v !== 'null')),
        );
        setSegmentedValues(this.group, wanted);
        this.paint();
    }

    /** @param {boolean} fire */
    change(fire) {
        this.paint();
        if (fire) this.host.dispatchEvent(new CustomEvent(WEEKDAYS_EVENT, { bubbles: true, detail: { values: this.values(), summary: this.words(), valid: this.valid() } }));
    }

    /** @param {Event} event */
    onChips(event) {
        if (event.target !== this.group) return;
        this.change(true);
    }

    /** @param {MouseEvent} event */
    onPreset(event) {
        const quick = this.quick.quick;
        const button = event.target instanceof Element ? event.target.closest('[data-kp-weekdays-preset]') : null;
        if (!(button instanceof HTMLButtonElement) || button.disabled || !quick.contains(button)) return;
        const name = /** @type {keyof typeof SETS} */ (button.dataset.kpWeekdaysPreset);
        const same = button.getAttribute('aria-pressed') === 'true';
        // Pressing the set that is already picked lets it go again: a preset is a toggle, as a chip is.
        this.set(same ? [] : SETS[name]);
        this.change(true);
    }
}
