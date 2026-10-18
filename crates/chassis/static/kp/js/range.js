// The range picker: a preset or a custom from–to [kpadopt4-ideas, Kenny 2026-10-16].
//
// The time window of a metrics page: the presets as the package's segmented
// control, and a Custom… button that opens a panel with two date pickers (the
// package's, dd/mm/yyyy) and two times (HH:MM, 24 hours), checked before Apply:
//
//   <div class="kp-range" data-kp-range="24h" data-kp-range-presets="1h 6h 24h 7d 30d" aria-label="Time range"></div>
//
// Under the control one line says exactly which window is chosen: "Last 24
// hours · 15/10/2026 14:05 – 16/10/2026 14:05", in Europe/Brussels unless
// `data-kp-time-zone` names another. Choosing a preset, or applying a custom
// range, fires `kp-range-change` with `{ preset, start, end, label }`: the
// preset's key or null, the two moments as ISO strings (UTC), and the line.
//
// A preset is a length back from now ("1h", "6h", "24h", "7d", "30d"; any
// number with m, h, d or w). The custom panel opens under the control, on
// the theme's own popover plate, with the window that is chosen filled in; it
// checks that both dates and times are whole, that the start comes first,
// that the end is not in the future (unless `data-kp-range-future`) and that
// the span is at most `data-kp-range-max-days` (none by default), says what is
// wrong under the fields and marks them, and holds Apply's result until it is
// right. Cancel, Escape or a press outside closes it and keeps the window as
// it was. The control is one tab stop with arrow keys for the presets, then
// Custom…; the panel takes the focus and gives it back.
//
// `data-kp-range-disabled` turns everything off. setRange(el, …) sets the
// window from a script (without the event); rangeOf(el) reads it.
//
// Nothing runs on import; attachRanges(root, { now }) returns a detach.

import { getStrings } from './strings.js';
import { SEGMENTED_EVENT, attachSegmented, setSegmentedValues } from './segmented.js';
import { attachDatePickers, datePicker } from './datepicker.js';
import { CHART_TIME_ZONE, wallTime, zonedTime } from './chart.js';
import { raiseOverlay, placeBlockSide } from './top-layer.js';
import { arriveShown, playClose, stopClose } from './motion.js';

/** A range picker. */
export const RANGE = '[data-kp-range]';
/** Fired on the picker when the window changes by a person: `{ preset, start, end, label }`. */
export const RANGE_EVENT = 'kp-range-change';
/** The presets a picker offers when it does not say (`data-kp-range-presets`). */
export const RANGE_PRESETS = ['1h', '6h', '24h', '7d', '30d'];

const UNIT = { m: 60000, h: 3600000, d: 86400000, w: 604800000 };

/**
 * A preset's length in ms ("24h", "7d", "90m", "2w"); 0 when unreadable.
 * @param {string} key
 */
export function presetMs(key) {
    const m = /^(\d+)\s*([mhdw])$/.exec(key.trim().toLowerCase());
    return m ? Number(m[1]) * UNIT[/** @type {keyof typeof UNIT} */ (m[2])] : 0;
}

/** @param {number} n */
const two = (n) => String(n).padStart(2, '0');

/**
 * A moment as rule 52 writes it, in a zone: "16/10/2026 14:05".
 * @param {number} ms @param {string} [timeZone]
 */
export function rangeMoment(ms, timeZone = CHART_TIME_ZONE) {
    const w = wallTime(ms, timeZone);
    return `${two(w.day)}/${two(w.month)}/${w.year} ${two(w.hour)}:${two(w.minute)}`;
}

/**
 * A time typed as "14:05", "1405", "14.05" or "9"; null when it is not a time of day.
 * @param {string} text
 * @returns {{ hour: number, minute: number } | null}
 */
export function parseTime(text) {
    const t = text.trim();
    const m = /^(\d{1,2})(?:[:.h ]?(\d{2}))?$/.exec(t);
    if (!m) return null;
    const hour = Number(m[1]);
    const minute = m[2] === undefined ? 0 : Number(m[2]);
    return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * What is wrong with a custom window, as dictionary keys; empty when it is right.
 * @param {number | null} start @param {number | null} end @param {{ now: number, future?: boolean, maxDays?: number }} rules
 * @returns {('order' | 'future' | 'span')[]}
 */
export function rangeFaults(start, end, { now, future = false, maxDays = 0 }) {
    /** @type {('order' | 'future' | 'span')[]} */
    const faults = [];
    if (start === null || end === null) return faults;
    if (end <= start) faults.push('order');
    if (!future && end > now + 60000) faults.push('future');
    if (maxDays > 0 && end - start > maxDays * UNIT.d) faults.push('span');
    return faults;
}

/**
 * @typedef {object} RangeValue
 * @property {string | null} preset the preset's key, or null for a custom window
 * @property {number} start ms
 * @property {number} end ms
 */

/** @type {WeakMap<HTMLElement, { value: RangeValue, set: (value: RangeValue, fire: boolean) => void }>} */
const STATE = new WeakMap();

/**
 * The window a picker holds, as ISO strings.
 * @param {Element} el
 * @returns {{ preset: string | null, start: string, end: string } | null}
 */
export function rangeOf(el) {
    const st = STATE.get(/** @type {HTMLElement} */ (el));
    return st ? { preset: st.value.preset, start: new Date(st.value.start).toISOString(), end: new Date(st.value.end).toISOString() } : null;
}

/**
 * Set a picker's window from a script, without the event: a preset's key, or a start and an end (Date, ISO or ms).
 * @param {Element} el @param {{ preset?: string, start?: Date | string | number, end?: Date | string | number }} next
 */
export function setRange(el, next) {
    const st = STATE.get(/** @type {HTMLElement} */ (el));
    if (!st) return;
    const ms = (/** @type {Date | string | number | undefined} */ v) => (v === undefined ? NaN : new Date(v).getTime());
    if (next.preset) st.set({ preset: next.preset, start: 0, end: 0 }, false);
    else if (Number.isFinite(ms(next.start)) && Number.isFinite(ms(next.end)))
        st.set({ preset: null, start: ms(next.start), end: ms(next.end) }, false);
}

let seq = 0;

/**
 * Wire every range picker under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachRanges(root = document, { now = () => Date.now() } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const pickers = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(RANGE) ? [root] : []),
        ...root.querySelectorAll(RANGE),
    ]);
    for (const el of pickers) {
        if (STATE.has(el)) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const id = `kp-range-${++seq}`;
        const zone = el.dataset.kpTimeZone || CHART_TIME_ZONE;
        const presets = (el.dataset.kpRangePresets ?? RANGE_PRESETS.join(' ')).split(/\s+/).filter((k) => presetMs(k) > 0);
        const disabled = el.hasAttribute('data-kp-range-disabled');
        const future = el.hasAttribute('data-kp-range-future');
        const maxDays = Number(el.dataset.kpRangeMaxDays) || 0;
        el.classList.add('kp-range');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'group');

        // The control: the presets as a radio group, then Custom….
        const bar = doc.createElement('div');
        bar.className = 'kp-range__bar';
        const group = doc.createElement('div');
        group.className = 'kp-segmented kp-range__presets';
        group.dataset.kpSegmented = 'single';
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', s.rangePresets);
        if (disabled) group.setAttribute('aria-disabled', 'true');
        for (const key of presets) {
            const item = doc.createElement('button');
            item.type = 'button';
            item.className = 'kp-segmented__item';
            item.dataset.value = key;
            item.setAttribute('role', 'radio');
            item.setAttribute('aria-checked', 'false');
            item.title = s.rangePresetName(key);
            const label = doc.createElement('span');
            label.className = 'kp-segmented__label';
            label.textContent = s.rangePresetShort(key);
            item.append(label);
            group.append(item);
        }
        const custom = doc.createElement('button');
        custom.type = 'button';
        custom.className = 'kp-button kp-button--sm kp-range__custom';
        custom.setAttribute('aria-haspopup', 'dialog');
        custom.setAttribute('aria-expanded', 'false');
        custom.setAttribute('aria-pressed', 'false');
        custom.setAttribute('aria-controls', `${id}-panel`);
        custom.disabled = disabled;
        const customText = doc.createElement('span');
        customText.className = 'kp-button__text';
        customText.textContent = s.rangeCustom;
        custom.append(customText);
        bar.append(group, custom);

        const line = doc.createElement('p');
        line.className = 'kp-range__label';
        line.id = `${id}-label`;
        line.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-describedby', line.id);

        // The custom panel: two bounds, each a date picker and a time, an error line, Cancel and Apply.
        const panel = doc.createElement('div');
        panel.className = 'kp-popover kp-range__panel';
        panel.id = `${id}-panel`;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', s.rangeCustomTitle);
        panel.hidden = true;
        const title = doc.createElement('p');
        title.className = 'kp-range__title';
        title.textContent = s.rangeCustomTitle;
        /** @param {'from' | 'to'} which */
        const bound = (which) => {
            const set = doc.createElement('fieldset');
            set.className = 'kp-range__bound';
            const legend = doc.createElement('legend');
            legend.className = 'kp-field__label';
            legend.textContent = which === 'from' ? s.rangeFrom : s.rangeTo;
            const row = doc.createElement('div');
            row.className = 'kp-range__inputs';
            const picker = doc.createElement('div');
            picker.className = 'kp-datepicker kp-range__date';
            picker.dataset.kpDatepicker = '';
            const date = doc.createElement('input');
            date.className = 'kp-field__input';
            date.type = 'text';
            date.inputMode = 'numeric';
            date.autocomplete = 'off';
            date.dataset.kpDateInput = '';
            date.setAttribute('aria-label', s.rangeDateLabel(legend.textContent ?? ''));
            const open = doc.createElement('button');
            open.type = 'button';
            open.className = 'kp-button';
            open.dataset.kpDateOpen = '';
            open.setAttribute('aria-label', s.calendarOpen);
            open.title = s.calendarOpen;
            const glyph = doc.createElement('span');
            glyph.setAttribute('aria-hidden', 'true');
            glyph.textContent = s.calendarButton;
            open.append(glyph);
            const datePanel = doc.createElement('div');
            datePanel.className = 'kp-datepicker__panel';
            datePanel.dataset.kpDatePanel = '';
            datePanel.hidden = true;
            picker.append(date, open, datePanel);
            const time = doc.createElement('input');
            time.className = 'kp-field__input kp-range__time';
            time.type = 'text';
            time.inputMode = 'numeric';
            time.autocomplete = 'off';
            time.placeholder = s.rangeTimeHint;
            time.setAttribute('aria-label', s.rangeTimeLabel(legend.textContent ?? ''));
            row.append(picker, time);
            set.append(legend, row);
            return { set, picker, date, time };
        };
        const from = bound('from');
        const to = bound('to');
        const error = doc.createElement('p');
        error.className = 'kp-field__error kp-range__error';
        error.id = `${id}-error`;
        error.setAttribute('role', 'alert');
        const actions = doc.createElement('div');
        actions.className = 'kp-range__actions';
        const cancel = doc.createElement('button');
        cancel.type = 'button';
        cancel.className = 'kp-button';
        cancel.textContent = s.rangeCancel;
        const apply = doc.createElement('button');
        apply.type = 'button';
        apply.className = 'kp-button kp-button--primary';
        apply.textContent = s.rangeApply;
        actions.append(cancel, apply);
        panel.append(title, from.set, to.set, error, actions);
        el.replaceChildren(bar, line, panel);
        const detachPickers = attachDatePickers(panel);
        const detachSegmented = attachSegmented(el);

        /** @type {RangeValue} */
        let value = {
            preset: presets.includes(el.dataset.kpRange ?? '') ? /** @type {string} */ (el.dataset.kpRange) : (presets[2] ?? presets[0] ?? null),
            start: 0,
            end: 0,
        };

        const describe = () => {
            const name = value.preset ? s.rangePresetName(value.preset) : s.rangeCustomName;
            return s.rangeLabel(name, rangeMoment(value.start, zone), rangeMoment(value.end, zone));
        };
        /** @param {RangeValue} next @param {boolean} fire */
        const set = (next, fire) => {
            if (next.preset) {
                const end = now();
                value = { preset: next.preset, start: end - presetMs(next.preset), end };
            } else value = next;
            setSegmentedValues(group, value.preset ? [value.preset] : []);
            custom.setAttribute('aria-pressed', String(value.preset === null));
            el.dataset.kpRangeValue = value.preset ?? 'custom';
            line.textContent = describe();
            if (fire)
                el.dispatchEvent(
                    new CustomEvent(RANGE_EVENT, {
                        bubbles: true,
                        detail: {
                            preset: value.preset,
                            start: new Date(value.start).toISOString(),
                            end: new Date(value.end).toISOString(),
                            label: line.textContent,
                        },
                    }),
                );
        };
        STATE.set(el, {
            get value() {
                return value;
            },
            set,
        });

        /** @param {Event} event */
        const onPreset = (event) => {
            if (event.target !== group) return;
            const key = /** @type {CustomEvent} */ (event).detail.value;
            if (key) set({ preset: key, start: 0, end: 0 }, true);
        };
        group.addEventListener(SEGMENTED_EVENT, onPreset);

        // ── the panel ──
        /** @type {(() => void) | null} */
        let lower = null;
        /** @param {{ date: HTMLInputElement, time: HTMLInputElement, picker: HTMLElement }} b @param {number} ms */
        const fill = (b, ms) => {
            const w = wallTime(ms, zone);
            datePicker(b.picker)?.set(`${w.year}-${two(w.month)}-${two(w.day)}`);
            b.time.value = `${two(w.hour)}:${two(w.minute)}`;
        };
        /** @param {{ date: HTMLInputElement, time: HTMLInputElement, picker: HTMLElement }} b @returns {number | null | 'date' | 'time'} */
        const read = (b) => {
            const day = datePicker(b.picker)?.get() ?? null;
            if (!day) return 'date';
            const t = parseTime(b.time.value);
            if (!t) return 'time';
            return zonedTime(day.getFullYear(), day.getMonth() + 1, day.getDate(), t.hour, t.minute, zone);
        };
        const mark = (/** @type {HTMLInputElement[]} */ bad) => {
            for (const input of [from.date, from.time, to.date, to.time]) {
                const wrong = bad.includes(input);
                if (wrong) {
                    input.setAttribute('aria-invalid', 'true');
                    input.setAttribute('aria-describedby', error.id);
                } else {
                    input.removeAttribute('aria-invalid');
                    input.removeAttribute('aria-describedby');
                }
            }
        };
        const place = (/** @type {HTMLElement} */ p) => {
            const box = el.getBoundingClientRect();
            const width = p.offsetWidth;
            const left = Math.max(8, Math.min(box.left, doc.documentElement.clientWidth - width - 8));
            p.style.setProperty('left', `${left}px`);
            p.style.setProperty('top', `${box.bottom + 6}px`);
            placeBlockSide(p, box);
        };
        const openPanel = () => {
            if (!panel.hidden || disabled) return;
            stopClose(panel);
            fill(from, value.start);
            fill(to, value.end);
            error.textContent = '';
            mark([]);
            panel.hidden = false;
            lower = raiseOverlay(panel, place);
            custom.setAttribute('aria-expanded', 'true');
            arriveShown(panel);
            from.date.focus();
        };
        /** @param {boolean} [refocus] */
        const closePanel = async (refocus = true) => {
            if (panel.hidden) return;
            custom.setAttribute('aria-expanded', 'false');
            for (const b of [from, to]) datePicker(b.picker)?.close();
            const done = await playClose(panel);
            if (!done) return;
            panel.hidden = true;
            lower?.();
            lower = null;
            stopClose(panel);
            if (refocus) custom.focus();
        };
        const onApply = () => {
            const a = read(from);
            const b = read(to);
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
                for (const fault of rangeFaults(a, b, { now: now(), future, maxDays })) {
                    if (fault === 'order') wrong(s.rangeErrorOrder, from.date, from.time, to.date, to.time);
                    if (fault === 'future') wrong(s.rangeErrorFuture, to.date, to.time);
                    if (fault === 'span') wrong(s.rangeErrorSpan(maxDays), from.date, to.date);
                }
            }
            if (words.length > 0) {
                error.textContent = words.join(' ');
                mark(bad);
                bad[0]?.focus();
                return;
            }
            set({ preset: null, start: /** @type {number} */ (a), end: /** @type {number} */ (b) }, true);
            void closePanel();
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if (event.key === 'Escape' && !panel.hidden) {
                // A calendar that is open closes first, by its own Escape.
                if (panel.querySelector('[data-kp-date-panel]:not([hidden])')) return;
                event.preventDefault();
                void closePanel();
            } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.classList.contains('kp-range__time')) {
                event.preventDefault();
                onApply();
            }
        };
        /** @param {PointerEvent} event */
        const onOutside = (event) => {
            if (panel.hidden) return;
            const target = /** @type {Node} */ (event.target);
            if (panel.contains(target) || custom.contains(target)) return;
            void closePanel(false);
        };
        const onCustom = () => (panel.hidden ? openPanel() : void closePanel());
        custom.addEventListener('click', onCustom);
        cancel.addEventListener('click', () => void closePanel());
        apply.addEventListener('click', onApply);
        panel.addEventListener('keydown', onKey);
        doc.addEventListener('pointerdown', onOutside, true);

        // The first window, as the markup asks; a custom start in the markup (`data-kp-range-start`, `-end`) wins.
        const start0 = Date.parse(el.dataset.kpRangeStart ?? '');
        const end0 = Date.parse(el.dataset.kpRangeEnd ?? '');
        if (Number.isFinite(start0) && Number.isFinite(end0)) set({ preset: null, start: start0, end: end0 }, false);
        else if (value.preset) set({ preset: value.preset, start: 0, end: 0 }, false);

        cleanups.push(() => {
            lower?.();
            detachPickers();
            detachSegmented();
            group.removeEventListener(SEGMENTED_EVENT, onPreset);
            doc.removeEventListener('pointerdown', onOutside, true);
            STATE.delete(el);
            el.replaceChildren();
            el.removeAttribute('aria-describedby');
            delete el.dataset.kpRangeValue;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
