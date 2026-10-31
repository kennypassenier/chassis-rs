// One snooze picker: its parts put in, the status and the choices kept in step with the clock, a choice made from the
// chips, the menu or the panel, End snooze, and the handle a page gets.

import { attachDatePickers } from '../datepicker.js';
import { MENU_SELECT_EVENT, attachMenuButtons, setMenu } from '../menu-button.js';
import { runMoment, runsRelative } from '../runs.js';
import { SNOOZE_END_EVENT, SNOOZE_EVENT, snoozeChoices } from './choices.js';
import { SnoozePanel } from './panel.js';

/** @typedef {import('../snooze.js').SnoozeHandle} SnoozeHandle */

/** How often an open page looks whether a reminder has ended [ms]. */
const TICK_MS = 30000;

export class SnoozePicker extends SnoozePanel {
    /** @param {HTMLElement} el @param {{ now?: () => number }} [options] */
    constructor(el, options = {}) {
        super(el, options);
        /** Takes the menu button of the bar now standing apart; a no-op for chips. @type {() => void} */
        this.barOff = () => undefined;
        /** @type {SnoozeHandle} */
        this.handle = {
            element: el,
            until: () => (this.until !== null && this.until > this.now() ? this.until : null),
            setUntil: (next) => this.setUntil(next),
            setBusy: (next) => this.setBusy(next),
            choices: () => this.offered(),
            openPanel: () => this.openPanel(),
            closePanel: () => void this.closePanel(false),
        };
    }

    connect() {
        const el = this.host;
        const { bar, status } = this.bar;
        const p = this.p;
        el.classList.add('kp-snooze');
        el.dataset.kpSnoozeAttached = '';
        this.readMemory();
        el.replaceChildren(bar, status, p.panel);
        this.own(() => {
            el.replaceChildren();
            el.removeAttribute('aria-busy');
            delete el.dataset.kpSnoozeAttached;
            delete el.dataset.kpSnoozedState;
        });
        this.own(attachDatePickers(p.panel));
        this.own(() => this.barOff());
        this.own(() => this.lower?.());
        this.wireBar();
        this.listen(p.cancel, 'click', () => void this.closePanel());
        this.listen(p.apply, 'click', () => this.onApply());
        this.listen(p.panel, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.doc, 'pointerdown', (event) => this.onOutside(event), true);
        // The look is switchable at runtime (DEMO_RULES ch. 7): the bar is rebuilt in place [homelab 23].
        this.observe(new MutationObserver(() => this.relook())).observe(el, { attributes: true, attributeFilter: ['data-kp-look'] });
        this.setUntil(el.dataset.kpSnoozedUntil ?? null);
        this.paintStatus();
        this.fill();
        // A reminder that has ended while the page stood open: the line goes back to "Not snoozed".
        if (!Number.isFinite(this.fixed) && !this.nowGiven) {
            const tick = window.setInterval(() => (this.paintStatus(), this.fill()), TICK_MS);
            this.own(() => clearInterval(tick));
        }
    }

    /** The listeners of the bar now standing: the menu button (its own teardown, kept for a change of look), the chips, End snooze. */
    wireBar() {
        const { end, wrapper, row } = this.bar;
        this.barOff = wrapper ? attachMenuButtons(this.bar.bar) : () => undefined;
        if (wrapper) {
            this.listen(wrapper, MENU_SELECT_EVENT, (event) => this.pick(String(/** @type {CustomEvent} */ (event).detail?.value ?? '')));
            // The moments are worked out as the menu is asked for, not when the page was drawn.
            this.listen(wrapper, 'pointerdown', () => this.fill(), true);
            this.listen(wrapper, 'keydown', () => this.fill(), true);
        }
        if (row) this.listen(row, 'click', (event) => this.onChip(event));
        this.listen(end, 'click', () => this.onEnd());
    }

    /** `data-kp-look` changed: close the panel (it stands under the old trigger), rebuild the bar and paint it. */
    relook() {
        if (!this.p.panel.hidden) void this.closePanel(false);
        const off = this.barOff;
        if (!this.takeLook()) return;
        off();
        this.wireBar();
        this.paintStatus();
        this.fill();
    }

    /** The last moment picked, kept across visits when the picker asks to be remembered. */
    readMemory() {
        if (!this.memory) return;
        try {
            const kept = Number(localStorage.getItem(this.memory));
            if (Number.isFinite(kept) && kept > 0) this.last = kept;
        } catch {
            // No storage: the last pick is kept for this visit only.
        }
    }

    offered() {
        const { morning, evening, max, zone, last, locale, s } = this;
        return snoozeChoices({ now: this.now(), choices: this.choiceKeys, morning, evening, max, zone, last, locale, strings: s });
    }

    /** The words on the trigger and under the bar, in step with what is snoozed. */
    paintStatus() {
        const { status, end, trigger } = this.bar;
        const s = this.s;
        const snoozed = this.until !== null && this.until > this.now();
        const when = snoozed && this.until !== null ? `${runMoment(this.until, this.zone, this.locale)} · ${runsRelative(this.until, this.now(), s)}` : '';
        status.textContent = snoozed ? s.snoozeUntil(when) : s.snoozeNone;
        status.dataset.kpSnoozed = String(snoozed);
        end.hidden = !snoozed;
        end.disabled = this.busy;
        this.host.dataset.kpSnoozedState = snoozed ? 'snoozed' : 'idle';
        if (this.chips) return;
        trigger.replaceChildren();
        const text = this.doc.createElement('span');
        text.className = 'kp-button__text';
        text.textContent = snoozed ? s.snoozeChange : s.snoozeTrigger;
        trigger.append(text);
        trigger.setAttribute('aria-describedby', status.id);
        if (this.busy) {
            const layer = this.doc.createElement('span');
            layer.className = 'kp-button__busy';
            layer.setAttribute('aria-hidden', 'true');
            const spin = this.doc.createElement('span');
            spin.className = 'kp-spinner';
            layer.append(spin);
            trigger.append(layer);
        }
        trigger.toggleAttribute('data-kp-busy', this.busy);
        trigger.toggleAttribute('aria-busy', this.busy);
        trigger.setAttribute('aria-disabled', String(this.busy));
    }

    /** Fill the menu or the chips with what is offered now. */
    fill() {
        const list = this.offered();
        const s = this.s;
        const { wrapper, row } = this.bar;
        if (wrapper) {
            const items = list.map((c) => ({ label: c.label, hint: c.at === null ? s.snoozePickHint : c.hint, value: c.key, disabled: this.busy ? s.snoozeSaving : null }));
            setMenu(wrapper, [{ group: '', items }]);
        } else if (row) row.replaceChildren(...list.map((c) => this.chip(c)));
    }

    /** @param {import('./choices.js').SnoozeChoice} c */
    chip(c) {
        const chip = this.doc.createElement('button');
        chip.type = 'button';
        chip.className = 'kp-segmented__item kp-snooze__chip';
        chip.dataset.value = c.key;
        chip.disabled = this.busy;
        const label = this.doc.createElement('span');
        label.className = 'kp-snooze__chip-label';
        label.textContent = c.label;
        const when = this.doc.createElement('span');
        when.className = 'kp-snooze__chip-when';
        when.textContent = c.at === null ? this.s.snoozePickHint : c.moment;
        chip.append(label, when);
        return chip;
    }

    /** @param {number} ms @param {string} key */
    choose(ms, key) {
        this.until = ms;
        if (key === 'pick') {
            this.last = ms;
            if (this.memory) {
                try {
                    localStorage.setItem(this.memory, String(ms));
                } catch {
                    // No storage.
                }
            }
        }
        this.paintStatus();
        this.fill();
        this.host.dispatchEvent(new CustomEvent(SNOOZE_EVENT, { bubbles: true, detail: { until: new Date(ms).toISOString(), choice: key } }));
    }

    onApply() {
        const read = this.readPanel();
        if ('ms' in read) {
            void this.closePanel();
            return this.choose(read.ms, 'pick');
        }
        this.p.error.textContent = read.words.join(' ');
        this.markBad(read.bad);
        read.bad[0]?.focus();
    }

    /** Esc closes the panel (unless the calendar in it is open); Enter in the time applies. @param {KeyboardEvent} event */
    onKey(event) {
        const panel = this.p.panel;
        if (event.key === 'Escape' && !panel.hidden) {
            if (panel.querySelector('[data-kp-date-panel]:not([hidden])')) return;
            event.preventDefault();
            void this.closePanel();
        } else if (event.key === 'Enter' && event.target === this.p.time) {
            event.preventDefault();
            this.onApply();
        }
    }

    /** @param {Event} event */
    onOutside(event) {
        const panel = this.p.panel;
        if (panel.hidden) return;
        const target = /** @type {Node} */ (event.target);
        if (panel.contains(target) || this.anchor().contains(target)) return;
        void this.closePanel(false);
    }

    /** @param {string} key */
    pick(key) {
        if (this.busy) return;
        if (key === 'pick') return this.openPanel();
        const match = this.offered().find((c) => c.key === key);
        if (match?.at != null) this.choose(match.at, key);
    }

    /** @param {Event} event */
    onChip(event) {
        const chip = event.target instanceof Element ? event.target.closest('.kp-snooze__chip') : null;
        if (chip instanceof HTMLElement && this.bar.row?.contains(chip)) this.pick(chip.dataset.value ?? '');
    }

    onEnd() {
        if (this.busy) return;
        this.until = null;
        this.paintStatus();
        this.fill();
        this.host.dispatchEvent(new CustomEvent(SNOOZE_END_EVENT, { bubbles: true, detail: {} }));
    }

    /** @param {number | string | Date | null} next */
    setUntil(next) {
        const ms = next === null ? NaN : next instanceof Date ? next.getTime() : typeof next === 'number' ? next : Date.parse(next);
        this.until = Number.isFinite(ms) ? ms : null;
        this.paintStatus();
    }

    /** @param {boolean} next */
    setBusy(next) {
        this.busy = next;
        this.host.toggleAttribute('aria-busy', next);
        this.paintStatus();
        this.fill();
    }
}
