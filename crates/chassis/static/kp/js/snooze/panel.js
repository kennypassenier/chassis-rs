// A snooze picker's state and its date and time panel: opening it at a sensible moment, placing it on the top layer,
// closing it with the theme's motion, and checking what was typed before it is chosen.

import { Controller } from '../controller.js';
import { CHART_TIME_ZONE, wallTime, zonedTime } from '../chart.js';
import { datePicker } from '../datepicker.js';
import { arriveShown, playClose, stopClose } from '../motion.js';
import { parseTime, presetMs } from '../range.js';
import { placeBlockSide, raiseOverlay } from '../top-layer.js';
import { buildBar, buildPanel } from './build.js';
import { MINUTE, SNOOZE_CHOICES, clock, dayAt, snoozeWords, two } from './choices.js';

/** Numbers the pickers of a page, for the ids of their parts. */
let seq = 0;
/** A day [ms]. */
const DAY_MS = 86400000;
/** The panel keeps this far from the viewport's edges, and stands this far under its anchor [px]. */
const EDGE_PX = 8;
const GAP_PX = 6;
/** The latest a pick may be when the picker names no `data-kp-snooze-max`. */
const MAX_DEFAULT = '7d';

export class SnoozePanel extends Controller {
    /** @param {HTMLElement} el @param {{ now?: () => number }} [options] */
    constructor(el, options = {}) {
        super(el, options);
        this.s = snoozeWords(el);
        this.doc = el.ownerDocument;
        this.id = `kp-snooze-${++seq}`;
        this.zone = el.dataset.kpTimeZone || CHART_TIME_ZONE;
        this.locale = el.lang || undefined;
        this.choiceKeys = (el.dataset.kpSnoozeChoices ?? SNOOZE_CHOICES.join(' ')).split(/[\s,]+/).filter(Boolean);
        this.morning = el.dataset.kpSnoozeMorning;
        this.evening = el.dataset.kpSnoozeEvening;
        this.max = el.dataset.kpSnoozeMax ?? MAX_DEFAULT;
        this.chips = el.getAttribute('data-kp-look') !== 'menu';
        this.fixed = Date.parse(el.dataset.kpNow ?? '');
        this.nowGiven = options.now;
        const fixed = this.fixed;
        /** The clock: the page's, else the picker's own fixed moment, else now. */
        this.now = options.now ?? (Number.isFinite(fixed) ? () => fixed : () => Date.now());
        this.memory = el.dataset.kpRemember ? `kp-remember:snooze:${el.dataset.kpRemember}` : '';
        /** The moment snoozed until, the last moment picked, and whether the page is saving. @type {number | null} */
        this.until = null;
        /** @type {number | null} */
        this.last = null;
        this.busy = false;
        /** Lowers the panel from the top layer. @type {(() => void) | null} */
        this.lower = null;
        this.bar = buildBar(this.doc, this.s, this.id, this.chips);
        this.p = buildPanel(this.doc, this.s, this.id);
    }

    /**
     * Take a `data-kp-look` changed at runtime: rebuild the bar as chips or a menu button and put it where the old one stood
     * [homelab 23]. The status line is rebuilt with it (same id); the panel stays.
     * @returns {boolean} whether the look changed
     */
    takeLook() {
        const chips = this.host.getAttribute('data-kp-look') !== 'menu';
        if (chips === this.chips) return false;
        const old = this.bar;
        this.chips = chips;
        this.bar = buildBar(this.doc, this.s, this.id, chips);
        old.bar.replaceWith(this.bar.bar);
        old.status.replaceWith(this.bar.status);
        return true;
    }

    /** The element the panel stands under: the menu button, or the picker. */
    anchor() {
        return this.bar.wrapper ? this.bar.trigger : this.host;
    }

    /** @param {HTMLElement} p */
    place(p) {
        const box = this.anchor().getBoundingClientRect();
        const left = Math.max(EDGE_PX, Math.min(box.left, this.doc.documentElement.clientWidth - p.offsetWidth - EDGE_PX));
        p.style.setProperty('left', `${left}px`);
        p.style.setProperty('top', `${box.bottom + GAP_PX}px`);
        placeBlockSide(p, box);
    }

    /** Open the panel at the last moment picked, else tomorrow morning. */
    openPanel() {
        const { panel, picker, date, time, error } = this.p;
        if (!panel.hidden) return;
        stopClose(panel);
        const now = this.now();
        const base = this.last !== null && this.last > now ? this.last : (dayAt(now, 1, clock(this.morning, '09:00'), this.zone) ?? now + DAY_MS);
        const w = wallTime(base, this.zone);
        datePicker(picker)?.set(`${w.year}-${two(w.month)}-${two(w.day)}`);
        time.value = `${two(w.hour)}:${two(w.minute)}`;
        error.textContent = '';
        this.markBad([]);
        panel.hidden = false;
        this.lower = raiseOverlay(panel, (p) => this.place(p));
        arriveShown(panel);
        date.focus();
    }

    /** @param {boolean} [refocus] */
    async closePanel(refocus = true) {
        const panel = this.p.panel;
        if (panel.hidden) return;
        datePicker(this.p.picker)?.close();
        if (!(await playClose(panel))) return;
        panel.hidden = true;
        this.lower?.();
        this.lower = null;
        stopClose(panel);
        if (refocus) (this.chips ? (this.bar.row?.querySelector('button') ?? this.host) : this.bar.trigger).focus();
    }

    /** Mark the fields that are wrong, and only those. @param {HTMLInputElement[]} bad */
    markBad(bad) {
        for (const input of [this.p.date, this.p.time]) {
            if (bad.includes(input)) {
                input.setAttribute('aria-invalid', 'true');
                input.setAttribute('aria-describedby', this.p.error.id);
            } else {
                input.removeAttribute('aria-invalid');
                input.removeAttribute('aria-describedby');
            }
        }
    }

    /**
     * The moment the panel says, or what is wrong with it: no date, no time, in the past, or beyond the picker's longest.
     * @returns {{ ms: number } | { bad: HTMLInputElement[], words: string[] }}
     */
    readPanel() {
        const { date, time } = this.p;
        const s = this.s;
        const day = datePicker(this.p.picker)?.get() ?? null;
        const t = parseTime(time.value);
        if (!day || !t) return { bad: [...(day ? [] : [date]), ...(t ? [] : [time])], words: [...(day ? [] : [s.snoozeErrorDate]), ...(t ? [] : [s.snoozeErrorTime])] };
        const ms = zonedTime(day.getFullYear(), day.getMonth() + 1, day.getDate(), t.hour, t.minute, this.zone);
        const longest = presetMs(this.max) || presetMs(MAX_DEFAULT);
        if (ms === null) return { bad: [time], words: [s.snoozeErrorTime] };
        if (ms <= this.now() + MINUTE) return { bad: [date, time], words: [s.snoozeErrorPast] };
        if (ms - this.now() > longest) return { bad: [date], words: [s.snoozeErrorMax(Math.round(longest / DAY_MS))] };
        return { ms };
    }
}
