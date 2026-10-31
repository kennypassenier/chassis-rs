// One picker's state and its reading: the options it read, its parts, the picked days in order and in words, and the paint that follows them.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { getSegmentedValues } from '../segmented.js';
import { readWeekdaysOptions } from './options.js';
import { buildChips, buildLines, buildQuick, chipItems } from './parts.js';
import { dayNames } from './names.js';
import { monthSummary, weekdaySummary } from './summary.js';
import { SETS, WEEK } from './values.js';

/** Gives each picker its own ids. */
let seq = 0;

export class WeekdaysCore extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {{ locale?: string, weekStartsOn?: number }} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        const s = getStrings();
        const doc = host.ownerDocument;
        this.s = s;
        this.id = `kp-weekdays-${++seq}`;
        this.o = readWeekdaysOptions(host, options);
        this.label = host.getAttribute('aria-label') ?? s.weekdaysGroup;
        this.group = buildChips(doc, this.o, this.label);
        this.items = chipItems(this.o, s);
        this.lines = buildLines(host, this.o, this.id);
        this.quick = buildQuick(doc, this.o, s);
    }

    /** The picked values, in the order the chips stand. @returns {string[]} */
    picked() {
        return getSegmentedValues(this.group);
    }

    /** @returns {(number | 'last')[]} */
    values() {
        const { month, firstDay } = this.o;
        if (month) {
            return /** @type {(number | 'last')[]} */ (
                this.picked()
                    .map((v) => (v === 'last' ? 'last' : Number(v)))
                    .sort((a, b) => (a === 'last' ? 1 : b === 'last' ? -1 : a - b))
            );
        }
        return this.picked()
            .map(Number)
            .sort((a, b) => ((a - firstDay + WEEK) % WEEK) - ((b - firstDay + WEEK) % WEEK));
    }

    words() {
        const { month, firstDay, locale } = this.o;
        return month ? monthSummary(this.values()) : weekdaySummary(/** @type {number[]} */ (this.values()), { firstDay, names: dayNames('short', locale) });
    }

    valid() {
        return this.values().length >= this.o.min;
    }

    /** Bring the line, the error and the quick picks in step with the chips. */
    paint() {
        const el = this.host;
        const { summary, why, reason } = this.lines;
        const have = this.values();
        summary.textContent = this.words();
        const ok = have.length >= this.o.min;
        why.hidden = ok;
        why.textContent = ok ? '' : this.s.weekdaysMin(this.o.min);
        const described = [this.o.showSummary ? summary.id : '', ok ? '' : why.id, reason.hidden ? '' : reason.id].filter(Boolean).join(' ');
        if (described) el.setAttribute('aria-describedby', described);
        else el.removeAttribute('aria-describedby');
        el.toggleAttribute('data-kp-invalid', !ok);
        if (!ok) el.setAttribute('aria-invalid', 'true');
        else el.removeAttribute('aria-invalid');
        for (const [name, button] of this.quick.buttons) {
            const set = SETS[/** @type {keyof typeof SETS} */ (name)];
            button.setAttribute('aria-pressed', String(!this.o.month && set.length === have.length && set.every((d) => have.includes(d))));
        }
    }
}
