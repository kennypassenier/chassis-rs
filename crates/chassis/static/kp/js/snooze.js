// The "remind me later" picker [kpadopt5-time; homelab's SNOOZE_CHOICES, Life's nudges, JobTracker's follow-ups].
//
// A reminder is put off with a few quick choices in plain words, each with the exact moment it means, so nobody has
// to work out when "1 day" falls:
//
//   <div class="kp-snooze" data-kp-snooze data-kp-snooze-choices="1h 4h tonight tomorrow monday pick"></div>
//
// The choices (Kenny, 2026-10-17: a mix of durations and moments): `1h`, `4h` (any number with m, h, d or w),
// `tonight`, `tomorrow`, `monday`, `next-week` and `pick`, the last one a panel with a date and a time. The default is
// `1h 4h tonight tomorrow monday pick`. A choice that has passed (tonight, after the evening hour) or lies past the
// longest a reminder may be put off (`data-kp-snooze-max`, 7d) is left out, not greyed. Beside each choice stands the
// exact moment it resolves to, "Sun 18/10/2026 09:00 · in 18 h 55 min", in Europe/Brussels unless `data-kp-time-zone`
// names another zone. The last custom moment that is still ahead is offered at the top ("Your last pick"); it is kept
// for the page's visit, and across visits when the element has `data-kp-remember="<name>"`.
//
// Options (markup, then the option of attachSnoozes()), each with a default [KT6]:
//   data-kp-snooze-choices  the list above
//   data-kp-snooze-morning  HH:MM that "tomorrow", "monday" and "next-week" mean          09:00
//   data-kp-snooze-evening  HH:MM that "tonight" means                                    18:00
//   data-kp-snooze-max      the longest a reminder may be put off                          7d
//   data-kp-look            chips (one row of choices, the default, Kenny 2026-10-17) | menu (a button with a menu)      chips
//   data-kp-time-zone       an IANA zone                                                   Europe/Brussels
//   data-kp-snoozed-until   an ISO moment: shows "Snoozed until …" with End snooze         none
//   data-kp-now             an ISO moment: a fixed clock for a demo or a test              the real clock
//
// A choice fires `kp-snooze` on the element: `{ until, choice }` (until is an ISO string); End snooze fires
// `kp-snooze-end`. The page stores the moment and tells the picker back with setSnoozedUntil(el, iso | null) (no
// event) and, while it saves, setSnoozeBusy(el, true), which shows the theme's spinner in the button and says no to a
// press. Nothing runs on import; attachSnoozes(root) returns a detach.

import { getStrings } from './strings.js';
import { attachMenuButtons, setMenu, MENU_SELECT_EVENT } from './menu-button.js';
import { attachDatePickers, datePicker } from './datepicker.js';
import { presetMs, parseTime } from './range.js';
import { CHART_TIME_ZONE, wallTime, zonedTime } from './chart.js';
import { runMoment, runsRelative } from './runs.js';
import { raiseOverlay, placeBlockSide } from './top-layer.js';
import { arriveShown, playClose, stopClose } from './motion.js';

/** A snooze picker. */
export const SNOOZE = '[data-kp-snooze]';
/** Fired on the picker when a choice is made: `{ until, choice }`. */
export const SNOOZE_EVENT = 'kp-snooze';
/** Fired on the picker when End snooze is pressed. */
export const SNOOZE_END_EVENT = 'kp-snooze-end';
/** The choices a picker offers when it does not say. */
export const SNOOZE_CHOICES = ['1h', '4h', 'tonight', 'tomorrow', 'monday', 'pick'];

const MINUTE = 60000;

/** @param {number} n */
const two = (n) => String(n).padStart(2, '0');

/**
 * "09:00" as hour and minute; null when it is not a time of day.
 * @param {string | undefined} text @param {string} fallback
 */
function clock(text, fallback) {
    return parseTime(text ?? '') ?? /** @type {{ hour: number, minute: number }} */ (parseTime(fallback));
}

/**
 * @typedef {object} SnoozeChoice
 * @property {string} key `1h`, `tonight`, `last`, `pick` …
 * @property {string} label the choice in words
 * @property {number | null} at the moment it resolves to (ms); null for `pick`
 * @property {string} hint the moment in words, "Sun 18/10/2026 09:00 · in 18 h 55 min"
 * @property {string} moment the moment alone, "Sun 18/10/2026 09:00" (a chip has room for no more)
 *
 * @typedef {object} SnoozeRules
 * @property {number} now ms
 * @property {string[]} [choices]
 * @property {string} [morning] HH:MM
 * @property {string} [evening] HH:MM
 * @property {string} [max] a length: 7d
 * @property {string} [zone]
 * @property {number | null} [last] the last custom moment, ms
 * @property {string} [locale]
 */

/**
 * The wall-clock moment `days` after today at a time of day in a zone. Pure.
 * @param {number} now @param {number} days @param {{ hour: number, minute: number }} at @param {string} zone
 * @returns {number | null}
 */
export function dayAt(now, days, at, zone) {
    const w = wallTime(now, zone);
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
    return zonedTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), at.hour, at.minute, zone);
}

/**
 * What a picker offers at a moment: each choice with the exact time it resolves to. A choice that has passed or lies
 * past `max` is left out; `pick` carries no moment. Pure, so a test or a server can ask the same.
 * @param {SnoozeRules} rules
 * @returns {SnoozeChoice[]}
 */
export function snoozeChoices({
    now,
    choices = SNOOZE_CHOICES,
    morning = '09:00',
    evening = '18:00',
    max = '7d',
    zone = CHART_TIME_ZONE,
    last = null,
    locale,
}) {
    const s = getStrings();
    const am = clock(morning, '09:00');
    const pm = clock(evening, '18:00');
    const limit = presetMs(max) || presetMs('7d');
    const w = wallTime(now, zone);
    const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
    const at = (/** @type {{ hour: number, minute: number }} */ t) => `${two(t.hour)}:${two(t.minute)}`;
    /** @param {number} ms */
    const where = (ms) => `${runMoment(ms, zone, locale)} · ${runsRelative(ms, now, s)}`;
    /** @type {SnoozeChoice[]} */
    const out = [];
    /** @type {Set<number>} */
    const seen = new Set();
    /** @param {string} key @param {string} label @param {number | null} ms @param {boolean} [far] */
    const add = (key, label, ms, far = false) => {
        if (ms === null) return;
        const m = Math.round(ms / MINUTE) * MINUTE;
        if (m <= now + MINUTE || m - now > limit || seen.has(m)) return;
        seen.add(m);
        out.push({ key, label, at: m, hint: far ? where(m) : runMoment(m, zone, locale), moment: runMoment(m, zone, locale) });
    };
    if (last !== null && last > now + MINUTE) add('last', s.snoozeLast, last, true);
    for (const key of choices) {
        if (key === 'pick') continue;
        if (key === 'tonight') add(key, s.snoozeTonight(at(pm)), zonedTime(w.year, w.month, w.day, pm.hour, pm.minute, zone), true);
        else if (key === 'tomorrow') add(key, s.snoozeTomorrow(at(am)), dayAt(now, 1, am, zone), true);
        else if (key === 'monday') add(key, s.snoozeMonday(at(am)), dayAt(now, (1 - weekday + 7) % 7 || 7, am, zone), true);
        else if (key === 'next-week') add(key, s.snoozeNextWeek(at(am)), dayAt(now, 7, am, zone), true);
        else if (presetMs(key) > 0) add(key, s.snoozeIn(key), now + presetMs(key));
    }
    if (choices.includes('pick')) out.push({ key: 'pick', label: s.snoozePick, at: null, hint: '', moment: '' });
    return out;
}

/**
 * @typedef {object} SnoozeHandle
 * @property {HTMLElement} element
 * @property {() => number | null} until the moment snoozed until (ms), or null
 * @property {(until: number | string | Date | null) => void} setUntil no event
 * @property {(busy: boolean) => void} setBusy
 * @property {() => SnoozeChoice[]} choices what is offered now
 * @property {() => void} openPanel show the date and time panel
 * @property {() => void} closePanel hide it, the focus left where it is
 */

/** @type {WeakMap<Element, SnoozeHandle>} */
const HANDLES = new WeakMap();

/** The handle of an attached picker. @param {Element} element */
export function snooze(element) {
    return HANDLES.get(element) ?? null;
}

/**
 * Show a picker as snoozed until a moment, or not snoozed (null), without the event.
 * @param {Element} element @param {number | string | Date | null} until
 */
export function setSnoozedUntil(element, until) {
    HANDLES.get(element)?.setUntil(until);
}

/**
 * Show a picker at work (the page is saving the reminder): its button shows the spinner and says no to a press.
 * @param {Element} element @param {boolean} busy
 */
export function setSnoozeBusy(element, busy) {
    HANDLES.get(element)?.setBusy(busy);
}

/**
 * Open a picker's date and time panel, as the "Pick a date and time…" choice does, or close it.
 * @param {Element} element @param {boolean} [open]
 */
export function openSnoozePanel(element, open = true) {
    const h = HANDLES.get(element);
    if (open) h?.openPanel();
    else h?.closePanel();
}

let seq = 0;

/**
 * Wire every snooze picker under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachSnoozes(root = document, { now: nowOption } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(SNOOZE) ? [root] : []),
        ...root.querySelectorAll(SNOOZE),
    ]);
    for (const el of found) {
        if (HANDLES.has(el)) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const id = `kp-snooze-${++seq}`;
        const zone = el.dataset.kpTimeZone || CHART_TIME_ZONE;
        const locale = el.lang || undefined;
        const choices = (el.dataset.kpSnoozeChoices ?? SNOOZE_CHOICES.join(' ')).split(/[\s,]+/).filter(Boolean);
        const morning = el.dataset.kpSnoozeMorning;
        const evening = el.dataset.kpSnoozeEvening;
        const max = el.dataset.kpSnoozeMax ?? '7d';
        const chips = el.dataset.kpLook !== 'menu';
        const fixed = Date.parse(el.dataset.kpNow ?? '');
        const now = nowOption ?? (Number.isFinite(fixed) ? () => fixed : () => Date.now());
        const memory = el.dataset.kpRemember ? `kp-remember:snooze:${el.dataset.kpRemember}` : '';
        el.classList.add('kp-snooze');
        el.dataset.kpSnoozeAttached = '';

        /** @type {number | null} */
        let until = null;
        /** @type {number | null} */
        let last = null;
        let busy = false;
        if (memory) {
            try {
                const kept = Number(localStorage.getItem(memory));
                if (Number.isFinite(kept) && kept > 0) last = kept;
            } catch {
                // No storage: the last pick is kept for this visit only.
            }
        }

        const bar = doc.createElement('div');
        bar.className = 'kp-snooze__bar';
        const status = doc.createElement('p');
        status.className = 'kp-snooze__status';
        status.id = `${id}-status`;
        status.setAttribute('aria-live', 'polite');
        const end = doc.createElement('button');
        end.type = 'button';
        end.className = 'kp-button kp-button--ghost kp-snooze__end';
        end.textContent = s.snoozeEnd;
        end.hidden = true;

        // The trigger: a button with a menu, or one row of chips; both end in the same list of choices.
        /** @type {HTMLElement} */
        let trigger;
        /** @type {HTMLElement | null} */
        let wrapper = null;
        /** @type {HTMLElement | null} */
        let row = null;
        if (chips) {
            row = doc.createElement('div');
            row.className = 'kp-segmented kp-segmented--chips kp-snooze__chips';
            row.setAttribute('role', 'group');
            row.setAttribute('aria-label', s.snoozeChoicesLabel);
            trigger = row;
            bar.append(row, end);
        } else {
            wrapper = doc.createElement('div');
            wrapper.className = 'kp-menu-button kp-snooze__menu';
            wrapper.dataset.kpMenuButton = '';
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'kp-button kp-snooze__trigger';
            const menu = doc.createElement('div');
            menu.className = 'kp-menu kp-menu--rich kp-snooze__list';
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', s.snoozeTrigger);
            wrapper.append(button, menu);
            trigger = button;
            bar.append(wrapper, end);
        }

        // The pick panel: a date and a time, on the popover plate.
        const panel = doc.createElement('div');
        panel.className = 'kp-popover kp-snooze__panel';
        panel.id = `${id}-panel`;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', s.snoozePickTitle);
        panel.hidden = true;
        const title = doc.createElement('p');
        title.className = 'kp-snooze__panel-title';
        title.textContent = s.snoozePickTitle;
        const inputs = doc.createElement('div');
        inputs.className = 'kp-snooze__inputs';
        const picker = doc.createElement('div');
        picker.className = 'kp-datepicker kp-snooze__date';
        picker.dataset.kpDatepicker = '';
        const date = doc.createElement('input');
        date.className = 'kp-field__input';
        date.type = 'text';
        date.inputMode = 'numeric';
        date.autocomplete = 'off';
        date.dataset.kpDateInput = '';
        date.setAttribute('aria-label', s.snoozeDateLabel);
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
        time.className = 'kp-field__input kp-snooze__time';
        time.type = 'text';
        time.inputMode = 'numeric';
        time.autocomplete = 'off';
        time.placeholder = s.rangeTimeHint;
        time.setAttribute('aria-label', s.snoozeTimeLabel);
        inputs.append(picker, time);
        const error = doc.createElement('p');
        error.className = 'kp-field__error kp-snooze__error';
        error.id = `${id}-error`;
        error.setAttribute('role', 'alert');
        const actions = doc.createElement('div');
        actions.className = 'kp-snooze__actions';
        const cancel = doc.createElement('button');
        cancel.type = 'button';
        cancel.className = 'kp-button';
        cancel.textContent = s.snoozeCancel;
        const apply = doc.createElement('button');
        apply.type = 'button';
        apply.className = 'kp-button kp-button--primary';
        apply.textContent = s.snoozeApply;
        actions.append(cancel, apply);
        panel.append(title, inputs, error, actions);
        el.replaceChildren(bar, status, panel);
        const detachPickers = attachDatePickers(panel);
        const detachMenu = wrapper ? attachMenuButtons(el) : () => undefined;

        const rules = () => ({ now: now(), choices, morning, evening, max, zone, last, locale });
        const offered = () => snoozeChoices(rules());

        /** The words on the trigger and under the bar, in step with what is snoozed. */
        const paintStatus = () => {
            const snoozed = until !== null && until > now();
            const when = snoozed && until !== null ? `${runMoment(until, zone, locale)} · ${runsRelative(until, now(), s)}` : '';
            status.textContent = snoozed ? s.snoozeUntil(when) : s.snoozeNone;
            status.dataset.kpSnoozed = String(snoozed);
            end.hidden = !snoozed;
            end.disabled = busy;
            el.dataset.kpSnoozedState = snoozed ? 'snoozed' : 'idle';
            if (!chips) {
                trigger.replaceChildren();
                const text = doc.createElement('span');
                text.className = 'kp-button__text';
                text.textContent = snoozed ? s.snoozeChange : s.snoozeTrigger;
                trigger.append(text);
                trigger.setAttribute('aria-describedby', status.id);
                if (busy) {
                    const layer = doc.createElement('span');
                    layer.className = 'kp-button__busy';
                    layer.setAttribute('aria-hidden', 'true');
                    const spin = doc.createElement('span');
                    spin.className = 'kp-spinner';
                    layer.append(spin);
                    trigger.append(layer);
                }
                trigger.toggleAttribute('data-kp-busy', busy);
                trigger.toggleAttribute('aria-busy', busy);
                trigger.setAttribute('aria-disabled', String(busy));
            }
        };

        /** Fill the menu or the chips with what is offered now. */
        const fill = () => {
            const list = offered();
            if (wrapper) {
                setMenu(wrapper, [
                    {
                        group: '',
                        items: list.map((c) => ({
                            label: c.label,
                            hint: c.at === null ? s.snoozePickHint : c.hint,
                            value: c.key,
                            disabled: busy ? s.snoozeSaving : null,
                        })),
                    },
                ]);
            } else if (row) {
                row.replaceChildren(
                    ...list.map((c) => {
                        const chip = doc.createElement('button');
                        chip.type = 'button';
                        chip.className = 'kp-segmented__item kp-snooze__chip';
                        chip.dataset.value = c.key;
                        chip.disabled = busy;
                        const label = doc.createElement('span');
                        label.className = 'kp-snooze__chip-label';
                        label.textContent = c.label;
                        chip.append(label);
                        const when = doc.createElement('span');
                        when.className = 'kp-snooze__chip-when';
                        when.textContent = c.at === null ? s.snoozePickHint : c.moment;
                        chip.append(when);
                        return chip;
                    }),
                );
            }
        };

        /** @param {number} ms @param {string} key */
        const choose = (ms, key) => {
            until = ms;
            if (key === 'pick') {
                last = ms;
                if (memory) {
                    try {
                        localStorage.setItem(memory, String(ms));
                    } catch {
                        // No storage.
                    }
                }
            }
            paintStatus();
            fill();
            el.dispatchEvent(new CustomEvent(SNOOZE_EVENT, { bubbles: true, detail: { until: new Date(ms).toISOString(), choice: key } }));
        };

        // ── the panel ──
        /** @type {(() => void) | null} */
        let lower = null;
        const anchor = () => (wrapper ? trigger : el);
        const place = (/** @type {HTMLElement} */ p) => {
            const box = anchor().getBoundingClientRect();
            const width = p.offsetWidth;
            const left = Math.max(8, Math.min(box.left, doc.documentElement.clientWidth - width - 8));
            p.style.setProperty('left', `${left}px`);
            p.style.setProperty('top', `${box.bottom + 6}px`);
            placeBlockSide(p, box);
        };
        const openPanel = () => {
            if (!panel.hidden) return;
            stopClose(panel);
            const base = last !== null && last > now() ? last : (dayAt(now(), 1, clock(morning, '09:00'), zone) ?? now() + 86400000);
            const w = wallTime(base, zone);
            datePicker(picker)?.set(`${w.year}-${two(w.month)}-${two(w.day)}`);
            time.value = `${two(w.hour)}:${two(w.minute)}`;
            error.textContent = '';
            for (const input of [date, time]) {
                input.removeAttribute('aria-invalid');
                input.removeAttribute('aria-describedby');
            }
            panel.hidden = false;
            lower = raiseOverlay(panel, place);
            arriveShown(panel);
            date.focus();
        };
        /** @param {boolean} [refocus] */
        const closePanel = async (refocus = true) => {
            if (panel.hidden) return;
            datePicker(picker)?.close();
            const done = await playClose(panel);
            if (!done) return;
            panel.hidden = true;
            lower?.();
            lower = null;
            stopClose(panel);
            if (refocus) (chips ? (row?.querySelector('button') ?? el) : trigger).focus();
        };
        const onApply = () => {
            const day = datePicker(picker)?.get() ?? null;
            const t = parseTime(time.value);
            /** @type {HTMLInputElement[]} */
            const bad = [];
            /** @type {string[]} */
            const words = [];
            if (!day) {
                bad.push(date);
                words.push(s.snoozeErrorDate);
            }
            if (!t) {
                bad.push(time);
                words.push(s.snoozeErrorTime);
            }
            if (day && t) {
                const ms = zonedTime(day.getFullYear(), day.getMonth() + 1, day.getDate(), t.hour, t.minute, zone);
                if (ms === null) {
                    bad.push(time);
                    words.push(s.snoozeErrorTime);
                } else if (ms <= now() + MINUTE) {
                    bad.push(date, time);
                    words.push(s.snoozeErrorPast);
                } else if (ms - now() > (presetMs(max) || presetMs('7d'))) {
                    bad.push(date);
                    words.push(s.snoozeErrorMax(Math.round((presetMs(max) || presetMs('7d')) / 86400000)));
                } else {
                    void closePanel();
                    choose(ms, 'pick');
                    return;
                }
            }
            error.textContent = words.join(' ');
            for (const input of [date, time]) {
                if (bad.includes(input)) {
                    input.setAttribute('aria-invalid', 'true');
                    input.setAttribute('aria-describedby', error.id);
                } else {
                    input.removeAttribute('aria-invalid');
                    input.removeAttribute('aria-describedby');
                }
            }
            bad[0]?.focus();
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if (event.key === 'Escape' && !panel.hidden) {
                if (panel.querySelector('[data-kp-date-panel]:not([hidden])')) return;
                event.preventDefault();
                void closePanel();
            } else if (event.key === 'Enter' && event.target === time) {
                event.preventDefault();
                onApply();
            }
        };
        /** @param {PointerEvent} event */
        const onOutside = (event) => {
            if (panel.hidden) return;
            const target = /** @type {Node} */ (event.target);
            if (panel.contains(target) || anchor().contains(target)) return;
            void closePanel(false);
        };

        /** @param {string} key */
        const pick = (key) => {
            if (busy) return;
            if (key === 'pick') {
                openPanel();
                return;
            }
            const match = offered().find((c) => c.key === key);
            if (match?.at != null) choose(match.at, key);
        };
        /** @param {Event} event */
        const onSelect = (event) => pick(String(/** @type {CustomEvent} */ (event).detail?.value ?? ''));
        /** @param {MouseEvent} event */
        const onChip = (event) => {
            const chip = event.target instanceof Element ? event.target.closest('.kp-snooze__chip') : null;
            if (chip instanceof HTMLElement && row?.contains(chip)) pick(chip.dataset.value ?? '');
        };
        // The moments are worked out as the menu is asked for, not when the page was drawn.
        const refresh = () => fill();
        const onEnd = () => {
            if (busy) return;
            until = null;
            paintStatus();
            fill();
            el.dispatchEvent(new CustomEvent(SNOOZE_END_EVENT, { bubbles: true, detail: {} }));
        };

        wrapper?.addEventListener(MENU_SELECT_EVENT, onSelect);
        wrapper?.addEventListener('pointerdown', refresh, true);
        wrapper?.addEventListener('keydown', refresh, true);
        row?.addEventListener('click', onChip);
        end.addEventListener('click', onEnd);
        cancel.addEventListener('click', () => void closePanel());
        apply.addEventListener('click', onApply);
        panel.addEventListener('keydown', onKey);
        doc.addEventListener('pointerdown', onOutside, true);

        /** @type {SnoozeHandle} */
        const handle = {
            element: el,
            until: () => (until !== null && until > now() ? until : null),
            setUntil(next) {
                const ms = next === null ? NaN : next instanceof Date ? next.getTime() : typeof next === 'number' ? next : Date.parse(next);
                until = Number.isFinite(ms) ? ms : null;
                paintStatus();
            },
            setBusy(next) {
                busy = next;
                el.toggleAttribute('aria-busy', next);
                paintStatus();
                fill();
            },
            choices: offered,
            openPanel,
            closePanel: () => void closePanel(false),
        };
        HANDLES.set(el, handle);
        handle.setUntil(el.dataset.kpSnoozedUntil ?? null);
        paintStatus();
        fill();
        // A reminder that has ended while the page stood open: the line goes back to "Not snoozed".
        const tick = Number.isFinite(fixed) || nowOption ? 0 : window.setInterval(() => (paintStatus(), fill()), 30000);

        cleanups.push(() => {
            lower?.();
            detachPickers();
            detachMenu();
            wrapper?.removeEventListener(MENU_SELECT_EVENT, onSelect);
            wrapper?.removeEventListener('pointerdown', refresh, true);
            wrapper?.removeEventListener('keydown', refresh, true);
            row?.removeEventListener('click', onChip);
            end.removeEventListener('click', onEnd);
            doc.removeEventListener('pointerdown', onOutside, true);
            if (tick) clearInterval(tick);
            HANDLES.delete(el);
            el.replaceChildren();
            el.removeAttribute('aria-busy');
            delete el.dataset.kpSnoozeAttached;
            delete el.dataset.kpSnoozedState;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
