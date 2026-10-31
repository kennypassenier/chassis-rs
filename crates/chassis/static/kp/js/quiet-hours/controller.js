// One wired control: the fields it composes, the presses and picks of its parts, and the way it is taken down.

import { attachTimes, TIME_EVENT } from '../timefield.js';
import { attachWeekdays, WEEKDAYS_EVENT } from '../weekdays.js';
import { QuietCore } from './core.js';
import { readQuiet } from './value.js';
import { DEFAULT_STEP, WATCHED_OPTIONS } from './values.js';

export class QuietHours extends QuietCore {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** What the page gets back, the same object every time. @type {{ value: () => import('./values.js').QuietValue, set: (next: unknown) => void }} */
        this.handle = {
            value: () => ({ ...this.value, days: [...this.value.days], through: [...this.value.through] }),
            set: (/** @type {unknown} */ next) => this.write(readQuiet(next), false),
        };
    }

    connect() {
        const root = this.host;
        const { s } = this;
        const { onLabel, body, summary, reason, wait, fromBox, toBox, dayBox, onInput, through } = this.parts;
        if (!root.id) root.id = this.id;
        root.classList.add('kp-quiet');
        root.setAttribute('role', 'group');
        root.replaceChildren(onLabel, body, summary, reason, wait);
        // Registered first, so it runs last on detach: the control is emptied.
        this.own(() => root.replaceChildren());
        this.drawSeverities();
        attachTimes(body);
        attachWeekdays(body);
        for (const box of [fromBox, toBox]) box.setAttribute('data-kp-time-step', root.getAttribute('data-kp-quiet-step') || DEFAULT_STEP);
        fromBox.setAttribute('data-kp-label', s.quietFrom);
        toBox.setAttribute('data-kp-label', s.quietTo);
        dayBox.setAttribute('aria-label', s.quietDays);
        this.write(this.value, false);
        this.listen(root, TIME_EVENT, (event) => this.onTime(event));
        this.listen(root, WEEKDAYS_EVENT, (event) => this.onDays(event));
        this.listen(onInput, 'change', () => this.changed());
        this.listen(through, 'change', () => this.changed());
        this.observe(
            new MutationObserver(() => {
                this.drawSeverities();
                this.paint();
            }),
        ).observe(root, { attributes: true, attributeFilter: WATCHED_OPTIONS });
    }

    /** The switch or a severity tick changed. */
    changed() {
        this.change({ on: this.parts.onInput.checked, through: this.checks().filter((b) => b.checked).map((b) => b.value) });
    }

    /** @param {Event} event */
    onTime(event) {
        const { fromBox, toBox } = this.parts;
        const target = /** @type {HTMLElement} */ (event.target);
        const detail = /** @type {CustomEvent<{ value: string }>} */ (event).detail;
        if (!detail || typeof detail.value !== 'string' || detail.value === '') return;
        if (target === fromBox || fromBox.contains(target)) this.change({ from: detail.value });
        else if (target === toBox || toBox.contains(target)) this.change({ to: detail.value });
    }

    /** @param {Event} event */
    onDays(event) {
        const detail = /** @type {CustomEvent<{ values: (number | 'last')[] }>} */ (event).detail;
        this.change({ days: (detail?.values ?? []).filter((d) => typeof d === 'number') });
    }
}
