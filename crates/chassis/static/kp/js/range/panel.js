// The custom panel of one range picker: opening and closing it, filling and reading its two bounds, and checking the window before Apply.

import { wallTime, zonedTime } from '../chart.js';
import { attachDatePickers, datePicker } from '../datepicker.js';
import { raiseOverlay, placeBlockSide } from '../top-layer.js';
import { arriveShown, playClose, stopClose } from '../motion.js';
import { buildCustomButton, buildPanel } from './build.js';
import { parseTime, rangeFaults, two } from './values.js';

/** @typedef {import('./build.js').RangeBound} RangeBound */
/** @typedef {import('./core.js').RangeCore} RangeCore */

/** The least space kept between the panel and the page's edge, and the gap under the control, in px. */
const EDGE_PX = 8;
const GAP_PX = 6;

export class RangePanel {
    /** @param {RangeCore} range the picker this panel belongs to */
    constructor(range) {
        this.range = range;
        const { s, doc, id, disabled } = range;
        this.button = buildCustomButton(doc, s, id, disabled);
        const parts = buildPanel(doc, s, id);
        this.panel = parts.panel;
        this.from = parts.from;
        this.to = parts.to;
        this.error = parts.error;
        this.cancel = parts.cancel;
        this.apply = parts.apply;
        /** Lowers the overlay while the panel is open. @type {(() => void) | null} */
        this.lower = null;
    }

    /** Add the button and the panel to the picker and wire them. */
    connect() {
        const { range, panel, button } = this;
        range.custom = button;
        range.bar.append(button);
        range.host.append(panel);
        range.listen(range.doc, 'pointerdown', (event) => this.onOutside(/** @type {PointerEvent} */ (event)), true);
        range.own(attachDatePickers(panel));
        range.own(() => this.lower?.());
        range.listen(button, 'click', () => (panel.hidden ? this.open() : void this.close()));
        range.listen(this.cancel, 'click', () => void this.close());
        range.listen(this.apply, 'click', () => this.onApply());
        range.listen(panel, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
    }

    /** @param {RangeBound} b @param {number} ms */
    fill(b, ms) {
        const w = wallTime(ms, this.range.zone);
        datePicker(b.picker)?.set(`${w.year}-${two(w.month)}-${two(w.day)}`);
        b.time.value = `${two(w.hour)}:${two(w.minute)}`;
    }

    /** A bound as a moment, or the word of what is not whole. @param {RangeBound} b @returns {number | null | 'date' | 'time'} */
    read(b) {
        const day = datePicker(b.picker)?.get() ?? null;
        if (!day) return 'date';
        const t = parseTime(b.time.value);
        if (!t) return 'time';
        return zonedTime(day.getFullYear(), day.getMonth() + 1, day.getDate(), t.hour, t.minute, this.range.zone);
    }

    /** Mark the given inputs wrong and the others right. @param {HTMLInputElement[]} bad */
    mark(bad) {
        const { from, to, error } = this;
        for (const input of [from.date, from.time, to.date, to.time]) {
            if (bad.includes(input)) {
                input.setAttribute('aria-invalid', 'true');
                input.setAttribute('aria-describedby', error.id);
            } else {
                input.removeAttribute('aria-invalid');
                input.removeAttribute('aria-describedby');
            }
        }
    }

    /** Put the panel under the control, kept inside the page. @param {HTMLElement} p */
    place(p) {
        const box = this.range.host.getBoundingClientRect();
        const width = p.offsetWidth;
        const left = Math.max(EDGE_PX, Math.min(box.left, this.range.doc.documentElement.clientWidth - width - EDGE_PX));
        p.style.setProperty('left', `${left}px`);
        p.style.setProperty('top', `${box.bottom + GAP_PX}px`);
        placeBlockSide(p, box);
    }

    open() {
        const { panel, range } = this;
        if (!panel.hidden || range.disabled) return;
        stopClose(panel);
        this.fill(this.from, range.value.start);
        this.fill(this.to, range.value.end);
        this.error.textContent = '';
        this.mark([]);
        panel.hidden = false;
        this.lower = raiseOverlay(panel, (p) => this.place(p));
        this.button.setAttribute('aria-expanded', 'true');
        arriveShown(panel);
        this.from.date.focus();
    }

    /** @param {boolean} [refocus] */
    async close(refocus = true) {
        const { panel } = this;
        if (panel.hidden) return;
        this.button.setAttribute('aria-expanded', 'false');
        for (const b of [this.from, this.to]) datePicker(b.picker)?.close();
        const done = await playClose(panel);
        if (!done) return;
        panel.hidden = true;
        this.lower?.();
        this.lower = null;
        stopClose(panel);
        if (refocus) this.button.focus();
    }

    /** Every fault of the two bounds as the words to show and the inputs to mark, in the order they are found. @param {number | null | 'date' | 'time'} a @param {number | null | 'date' | 'time'} b */
    faults(a, b) {
        const { s, future, maxDays } = this.range;
        const { from, to } = this;
        /** @type {HTMLInputElement[]} */
        const bad = [];
        /** @type {string[]} */
        const words = [];
        /** @param {string} word @param {...HTMLInputElement} inputs */
        const wrong = (word, ...inputs) => {
            bad.push(...inputs);
            words.push(word);
        };
        // A time the clock skips (the hour lost when summer time starts) reads as a wrong time.
        if (a === 'date') wrong(s.rangeErrorDate(s.rangeFrom), from.date);
        if (a === 'time' || a === null) wrong(s.rangeErrorTime(s.rangeFrom), from.time);
        if (b === 'date') wrong(s.rangeErrorDate(s.rangeTo), to.date);
        if (b === 'time' || b === null) wrong(s.rangeErrorTime(s.rangeTo), to.time);
        if (typeof a === 'number' && typeof b === 'number') {
            for (const fault of rangeFaults(a, b, { now: this.range.now(), future, maxDays })) {
                if (fault === 'order') wrong(s.rangeErrorOrder, from.date, from.time, to.date, to.time);
                if (fault === 'future') wrong(s.rangeErrorFuture, to.date, to.time);
                if (fault === 'span') wrong(s.rangeErrorSpan(maxDays), from.date, to.date);
            }
        }
        return { bad, words };
    }

    onApply() {
        const a = this.read(this.from);
        const b = this.read(this.to);
        const { bad, words } = this.faults(a, b);
        if (words.length > 0) {
            this.error.textContent = words.join(' ');
            this.mark(bad);
            bad[0]?.focus();
            return;
        }
        this.range.set({ preset: null, start: /** @type {number} */ (a), end: /** @type {number} */ (b) }, true);
        void this.close();
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const { panel } = this;
        if (event.key === 'Escape' && !panel.hidden) {
            // A calendar that is open closes first, by its own Escape.
            if (panel.querySelector('[data-kp-date-panel]:not([hidden])')) return;
            event.preventDefault();
            void this.close();
        } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.classList.contains('kp-range__time')) {
            event.preventDefault();
            this.onApply();
        }
    }

    /** @param {PointerEvent} event */
    onOutside(event) {
        if (this.panel.hidden) return;
        const target = /** @type {Node} */ (event.target);
        if (this.panel.contains(target) || this.button.contains(target)) return;
        void this.close(false);
    }
}
