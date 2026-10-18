// A field for a time of day: 24 hours, typed, stepped or picked from a list [kpadopt6; homelab's Schedules "At" field].
//
//   <div class="kp-time" data-kp-time data-kp-name="at" data-kp-value="03:00" data-kp-label="At"></div>
//
// The native `<input type="time">` follows the system's locale (12 hours with AM and PM on an English machine, which
// breaks rule 52), cannot be themed and has no step keys of its own. This is the package's own field: a text box that
// reads what a person types, a button that opens a list of times, and a hidden input that posts `HH:MM` unchanged.
// Kenny, 2026-10-17 ("Ons eigen veld met een lijst van tijden"): on a phone too the list is the package's own, a sheet
// at the foot of the screen, not the phone's wheel.
//
// Typing is forgiving and fixed: `0230`, `2:30`, `02.30`, `2h30` and `230` give 02:30, `7` gives 07:00, `24:00` is
// refused; pasting `2:30 PM` is converted to 14:30 and the field says so, politely, because the person wrote 12 hours.
// Anything else keeps what was typed and says "Use a time like 03:00" (an invalid text is never dropped silently).
// Keys, in the field only (no page key is claimed): Up and Down step by `data-kp-time-step`, with Shift or Page Up and
// Page Down by an hour; Enter and Escape; Alt+Down opens the list. A time of day wraps (23:55 up is 00:00) and says so.
//
// Options (attributes on the root, each also a key of `setTime`):
//   data-kp-value / data-kp-name / data-kp-label / data-kp-time-id   the value, the posted name, the accessible name, the input's id
//   data-kp-time-step        minutes for the keys and the list: 1, 5 (default), 10, 15, 30 or 60; typing allows any minute
//   data-kp-time-min / -max  a window; a min later than the max wraps midnight ("22:00 to 06:00")
//   data-kp-time-seconds     present: HH:MM:SS (nothing in the projects needs it)
//   data-kp-time-popup       `list` (default) or `none` (typing and keys only)
//   data-kp-time-presets     `03:00,Morning=08:00`: chips above the list, the app's own words
//   data-kp-time-now         present: a "Now" entry (for logging, not for schedules)
//   data-kp-time-zone        an IANA name: a quiet line says whose clock it is
//   data-kp-time-look        `field` (default) or `inline` (the underline form inside a sentence)
//   data-kp-time-clear       present: an explicit "no time"
//   data-kp-time-required    present: empty is invalid, with the line
//   data-kp-time-near        `03:00,12:00`: entries within `data-kp-time-near-width` minutes (60) of these get a mark
//   data-kp-disabled-reason  with `disabled` (or `data-kp-disabled`): why it cannot be used now
//   data-kp-state            `loading` shows the field's own skeleton at its final width
//   data-kp-remember         a name: the last chosen time is kept (off by default)
//
// Events (bubbling, on the root): `kp-time-change` `{ value, text, converted }`, `kp-time-retry` (the Retry of presets that
// could not load). Presets arrive with `setTimePresets(root, list | 'loading' | 'error')`. Every word is in js/strings.js;
// nothing runs on import.

import { getStrings } from './strings.js';
import { raiseOverlay } from './top-layer.js';
import { attachDisabledReasons } from './reason.js';
import { memoryFor } from './remember.js';
import { motionAllowed } from './calm.js';

/** The fields this module looks after. */
export const TIME = '[data-kp-time]';
/** Fired when the value changes: `{ value, text, converted }`. */
export const TIME_EVENT = 'kp-time-change';
/** Fired by the Retry of presets that could not be loaded. */
export const TIME_RETRY_EVENT = 'kp-time-retry';
/** The steps the keys and the list may use, in minutes. */
export const TIME_STEPS = Object.freeze([1, 5, 10, 15, 30, 60]);

let serial = 0;

/** @typedef {{ label: string, value: string }} TimePreset */
/** @typedef {{ input: HTMLInputElement, hidden: HTMLInputElement, popup: HTMLElement, value: string, presets: TimePreset[] | 'loading' | 'error', open: boolean, active: number, lower: (() => void) | null, off: (() => void)[], invalid: string, converted: boolean }} TimeState */
/** @type {WeakMap<Element, TimeState>} */
const STATE = new WeakMap();

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * Read what a person typed or pasted as a time of day.
 * @param {string} text
 * @param {{ seconds?: boolean }} [options]
 * @returns {{ value: string, converted: boolean } | null} the time as `HH:MM`, and whether it was written in 12 hours; null when it is not a time
 */
export function parseTimeOfDay(text, { seconds = false } = {}) {
    const raw = text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (raw === '') return null;
    let m = /^(\d{1,2})(?:[:.h](\d{2}))?(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/.exec(raw);
    /** @type {[number, number, number]} */
    let hms;
    let converted = false;
    if (m) {
        let h = Number(m[1]);
        if (h < 1 || h > 12) return null;
        const pm = m[4].startsWith('p');
        if (h === 12) h = 0;
        hms = [pm ? h + 12 : h, Number(m[2] ?? 0), Number(m[3] ?? 0)];
        converted = true;
    } else if ((m = /^(\d{1,2})[:.h](\d{2})(?::(\d{2}))?$/.exec(raw))) hms = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
    else if ((m = /^(\d{1,2})h$/.exec(raw))) hms = [Number(m[1]), 0, 0];
    else if ((m = /^(\d{1,2})(\d{2})$/.exec(raw))) hms = [Number(m[1]), Number(m[2]), 0];
    else if ((m = /^(\d{1,2})$/.exec(raw))) hms = [Number(m[1]), 0, 0];
    else return null;
    if (hms[0] > 23 || hms[1] > 59 || hms[2] > 59) return null;
    const value = `${pad(hms[0])}:${pad(hms[1])}${seconds ? `:${pad(hms[2])}` : ''}`;
    return { value, converted };
}

/** @param {string} value `HH:MM` or `HH:MM:SS` @returns {number} minutes since midnight */
export function timeMinutes(value) {
    const m = /^(\d{2}):(\d{2})/.exec(value);
    return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

/** @param {number} minutes @param {boolean} [seconds] */
export function timeText(minutes, seconds = false) {
    const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}${seconds ? ':00' : ''}`;
}

/**
 * Step a time: up or down by `step` minutes, wrapping past midnight.
 * @param {string} value `HH:MM` or empty @param {number} delta steps (negative goes back) @param {number} step minutes
 * @returns {{ value: string, wrapped: boolean }}
 */
export function stepTime(value, delta, step) {
    const now = timeMinutes(value);
    if (Number.isNaN(now)) return { value: timeText(delta > 0 ? 0 : 1440 - step), wrapped: false };
    // Off the grid, the first step goes to the next grid time (03:07 up is 03:10), then on from there.
    const to =
        now % step === 0
            ? now + delta * step
            : delta > 0
              ? Math.ceil(now / step) * step + (delta - 1) * step
              : Math.floor(now / step) * step + (delta + 1) * step;
    return { value: timeText(to), wrapped: to < 0 || to >= 1440 };
}

/** Whether a time is inside the window; a min later than the max wraps midnight. @param {string} value @param {string | null} min @param {string | null} max */
export function timeInWindow(value, min, max) {
    const t = timeMinutes(value);
    const a = min ? timeMinutes(min) : Number.NaN;
    const b = max ? timeMinutes(max) : Number.NaN;
    if (Number.isNaN(t)) return false;
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (Number.isNaN(a)) return t <= b;
    if (Number.isNaN(b)) return t >= a;
    return a <= b ? t >= a && t <= b : t >= a || t <= b;
}

/** @param {HTMLElement} root @param {string} name @param {string} fallback */
const attr = (root, name, fallback) => root.getAttribute(`data-kp-time-${name}`) ?? fallback;

/** @param {HTMLElement} root */
const stepOf = (root) => {
    const n = Number(attr(root, 'step', '5'));
    return TIME_STEPS.includes(n) ? n : 5;
};

/** @param {HTMLElement} root @returns {TimePreset[]} */
function presetsFromAttribute(root) {
    const raw = attr(root, 'presets', '');
    if (!raw) return [];
    return raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const [a, b] = part.split('=');
            return b === undefined ? { label: a, value: a } : { label: a, value: b };
        })
        .filter((p) => /^\d{2}:\d{2}/.test(p.value));
}

/** @param {HTMLElement} root @param {string} message */
function say(root, message) {
    if (root.getAttribute('data-kp-announce') === 'off') return;
    let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-time__live'));
    if (!region) {
        region = el('kp-sr-only kp-time__live', 'span');
        region.setAttribute('role', 'status');
        root.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

/** Build the parts once. @param {HTMLElement} root @returns {TimeState} */
function build(root) {
    const old = STATE.get(root);
    if (old) return old;
    const s = getStrings();
    serial += 1;
    root.classList.add('kp-time');
    const control = el('kp-time__control');
    const input = /** @type {HTMLInputElement} */ (el('kp-field__input kp-time__input', 'input'));
    input.type = 'text';
    input.id = root.getAttribute('data-kp-time-id') ?? `kp-time-${serial}`;
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'none');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');
    input.placeholder = '--:--';
    const label = root.getAttribute('data-kp-label') ?? root.getAttribute('aria-label');
    if (label) input.setAttribute('aria-label', label);
    const labelled = root.getAttribute('aria-labelledby');
    if (labelled) input.setAttribute('aria-labelledby', labelled);
    const toggle = /** @type {HTMLButtonElement} */ (el('kp-time__toggle', 'button'));
    toggle.type = 'button';
    toggle.tabIndex = -1;
    toggle.setAttribute('aria-label', s.timeChoose);
    toggle.setAttribute('aria-haspopup', 'listbox');
    toggle.append(el('kp-time__glyph', 'span'));
    control.append(input, toggle);
    const hidden = /** @type {HTMLInputElement} */ (el('kp-time__value', 'input'));
    hidden.type = 'hidden';
    const name = root.getAttribute('data-kp-name');
    if (name) hidden.name = name;
    const why = el('kp-time__why', 'p');
    why.hidden = true;
    why.id = `kp-time-${serial}-why`;
    const zone = el('kp-time__zone', 'p');
    const popup = el('kp-popover kp-time__popup');
    popup.id = `kp-time-${serial}-popup`;
    popup.hidden = true;
    input.setAttribute('aria-controls', popup.id);
    const skeleton = el('kp-skeleton kp-time__skeleton', 'span');
    skeleton.setAttribute('aria-hidden', 'true');
    root.replaceChildren(control, hidden, why, zone, popup, skeleton);
    /** @type {TimeState} */
    const st = { input, hidden, popup, value: '', presets: presetsFromAttribute(root), open: false, active: -1, lower: null, off: [], invalid: '', converted: false };
    STATE.set(root, st);
    return st;
}

/** @param {HTMLElement} root */
const seconds = (root) => root.hasAttribute('data-kp-time-seconds');

/** Show or clear the why line and the invalid mark. @param {HTMLElement} root @param {string} message */
function setInvalid(root, message) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    const why = /** @type {HTMLElement} */ (root.querySelector('.kp-time__why'));
    st.invalid = message;
    why.hidden = message === '';
    why.textContent = message;
    why.setAttribute('role', message ? 'alert' : 'note');
    why.removeAttribute('data-kp-time-note');
    st.input.toggleAttribute('aria-invalid', message !== '');
    if (message) {
        st.input.setAttribute('aria-invalid', 'true');
        st.input.setAttribute('aria-describedby', why.id);
    } else {
        st.input.removeAttribute('aria-describedby');
    }
    st.input.setCustomValidity(message);
    root.toggleAttribute('data-kp-invalid', message !== '');
}

/** @param {HTMLElement} root @param {string} message */
function note(root, message) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    const why = /** @type {HTMLElement} */ (root.querySelector('.kp-time__why'));
    why.hidden = false;
    why.textContent = message;
    why.setAttribute('role', 'status');
    why.setAttribute('data-kp-time-note', '');
    void st;
}

/**
 * Take a typed text as the value, or say why not.
 * @param {HTMLElement} root @param {string} text @param {{ commit?: boolean, silent?: boolean }} [options]
 * @returns {boolean} whether the field now holds a valid value (or is validly empty)
 */
function commitText(root, text, { silent = false } = {}) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    const s = getStrings();
    const trimmed = text.trim();
    if (trimmed === '') {
        write(root, '', { text: '', silent });
        setInvalid(root, root.hasAttribute('data-kp-time-required') ? s.timeRequired : '');
        return !root.hasAttribute('data-kp-time-required');
    }
    const parsed = parseTimeOfDay(trimmed, { seconds: seconds(root) });
    if (!parsed) {
        st.value = '';
        st.hidden.value = '';
        setInvalid(root, s.timeInvalid);
        return false;
    }
    const min = root.getAttribute('data-kp-time-min');
    const max = root.getAttribute('data-kp-time-max');
    if ((min || max) && !timeInWindow(parsed.value, min, max)) {
        st.value = '';
        st.hidden.value = '';
        setInvalid(root, s.timeOutside(min ?? '00:00', max ?? '23:59'));
        return false;
    }
    setInvalid(root, '');
    write(root, parsed.value, { silent, converted: parsed.converted });
    if (parsed.converted) {
        note(root, s.timeConverted(parsed.value));
        say(root, s.timeConverted(parsed.value));
    }
    return true;
}

/** Set the value, the text and the hidden input; fire the event when it changed. @param {HTMLElement} root @param {string} value @param {{ text?: string, silent?: boolean, converted?: boolean }} [options] */
function write(root, value, { text, silent = false, converted = false } = {}) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    const changed = st.value !== value;
    st.value = value;
    st.hidden.value = value;
    st.input.value = text ?? value;
    root.setAttribute('data-kp-value', value);
    root.toggleAttribute('data-kp-empty', value === '');
    if (!changed || silent) return;
    memoryFor(root, 'time')?.write('value', value);
    if (value) say(root, getStrings().timeSaid(value));
    root.dispatchEvent(new CustomEvent(TIME_EVENT, { bubbles: true, detail: { value, text: st.input.value, converted } }));
}

/** The entries of the list. @param {HTMLElement} root @returns {{ value: string, label?: string, kind: 'time' | 'now' | 'clear' }[]} */
function entries(root) {
    const step = stepOf(root);
    const min = root.getAttribute('data-kp-time-min');
    const max = root.getAttribute('data-kp-time-max');
    /** @type {{ value: string, label?: string, kind: 'time' | 'now' | 'clear' }[]} */
    const out = [];
    if (root.hasAttribute('data-kp-time-clear')) out.push({ value: '', kind: 'clear' });
    if (root.hasAttribute('data-kp-time-now')) {
        const d = new Date();
        out.push({ value: timeText(d.getHours() * 60 + d.getMinutes(), seconds(root)), kind: 'now' });
    }
    for (let m = 0; m < 1440; m += step) {
        const value = timeText(m, seconds(root));
        if ((min || max) && !timeInWindow(value, min, max)) continue;
        out.push({ value, kind: 'time' });
    }
    return out;
}

/** The busy moments a time is near, as words. @param {HTMLElement} root @param {string} value @returns {string | null} */
function nearOf(root, value) {
    const list = (root.getAttribute('data-kp-time-near') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!list.length) return null;
    const width = Number(root.getAttribute('data-kp-time-near-width') ?? '60') || 60;
    const t = timeMinutes(value);
    for (const busy of list) {
        const b = timeMinutes(busy);
        const d = Math.min(Math.abs(t - b), 1440 - Math.abs(t - b));
        if (d <= width) return busy;
    }
    return null;
}

/** Draw the list for the current value. @param {HTMLElement} root */
function drawPopup(root) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    const s = getStrings();
    const popup = st.popup;
    popup.replaceChildren();
    const sheetTitle = el('kp-time__sheet-title', 'p');
    sheetTitle.textContent = st.input.getAttribute('aria-label') ?? s.timeChoose;
    popup.append(sheetTitle);
    // Presets.
    if (st.presets === 'loading' || st.presets === 'error' || (Array.isArray(st.presets) && st.presets.length)) {
        const bar = el('kp-time__presets');
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', s.timePresets);
        if (st.presets === 'loading') {
            for (let i = 0; i < 3; i += 1) bar.append(el('kp-skeleton kp-time__preset-skeleton', 'span'));
            bar.setAttribute('aria-busy', 'true');
        } else if (st.presets === 'error') {
            const plate = el('kp-alert kp-alert--destructive kp-time__presets-error');
            plate.setAttribute('role', 'alert');
            const text = el('kp-time__presets-text', 'span');
            text.textContent = s.timePresetsFailed;
            const retry = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
            retry.type = 'button';
            retry.setAttribute('data-kp-time-retry', '');
            retry.textContent = s.timeRetry;
            plate.append(text, retry);
            bar.append(plate);
        } else {
            for (const p of st.presets) {
                const chip = /** @type {HTMLButtonElement} */ (el('kp-time__preset kp-button kp-button--sm', 'button'));
                chip.type = 'button';
                chip.setAttribute('data-kp-time-pick', p.value);
                chip.textContent = p.label === p.value ? p.value : `${p.label} ${p.value}`;
                bar.append(chip);
            }
        }
        popup.append(bar);
    }
    const list = el('kp-time__list', 'ul');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', s.timeList);
    list.id = `${popup.id}-list`;
    const items = entries(root);
    const now = timeMinutes(st.value);
    let best = -1;
    let bestDelta = Infinity;
    items.forEach((item, index) => {
        const o = /** @type {HTMLElement} */ (el('kp-combobox__option kp-time__option', 'li'));
        o.id = `${popup.id}-o${index}`;
        o.setAttribute('role', 'option');
        o.setAttribute('data-kp-time-pick', item.value);
        o.setAttribute('aria-selected', String(item.value === st.value && item.kind === 'time'));
        o.tabIndex = -1;
        const t = el('kp-time__option-time', 'span');
        t.textContent = item.kind === 'clear' ? s.timeNone : item.value;
        o.append(t);
        if (item.kind === 'now') {
            const n = el('kp-time__option-note', 'span');
            n.textContent = s.timeNow;
            o.append(n);
        }
        if (item.kind === 'time') {
            const near = nearOf(root, item.value);
            if (near) {
                o.setAttribute('data-kp-time-near-mark', '');
                const n = el('kp-time__option-note', 'span');
                n.textContent = s.timeNear(near);
                o.append(n);
                o.setAttribute('aria-description', s.timeNear(near));
            }
            if (!Number.isNaN(now)) {
                const d = Math.abs(timeMinutes(item.value) - now);
                if (d < bestDelta) {
                    bestDelta = d;
                    best = index;
                }
            }
        }
        list.append(o);
    });
    popup.append(list);
    st.active = best >= 0 ? best : items.findIndex((i) => i.kind === 'time');
    markActive(root, false);
}

/** @param {HTMLElement} root @param {boolean} [scroll] */
function markActive(root, scroll = true) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    const options = /** @type {HTMLElement[]} */ ([...st.popup.querySelectorAll('.kp-time__option')]);
    options.forEach((o, i) => {
        o.toggleAttribute('data-kp-active', i === st.active);
        o.classList.toggle('is-active', i === st.active);
    });
    const at = options[st.active];
    if (at) {
        st.input.setAttribute('aria-activedescendant', at.id);
        const list = /** @type {HTMLElement} */ (st.popup.querySelector('.kp-time__list'));
        if (scroll || !list.hasAttribute('data-kp-time-placed')) {
            list.setAttribute('data-kp-time-placed', '');
            const top = at.offsetTop - list.clientHeight / 2 + at.offsetHeight / 2;
            list.scrollTo({ top: Math.max(0, top), behavior: scroll && motionAllowed(root) ? 'smooth' : 'auto' });
        }
    } else st.input.removeAttribute('aria-activedescendant');
}

/** @param {HTMLElement} root */
function openList(root) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    if (st.open || attr(root, 'popup', 'list') === 'none' || st.input.disabled) return;
    st.open = true;
    drawPopup(root);
    st.popup.hidden = false;
    st.input.setAttribute('aria-expanded', 'true');
    root.setAttribute('data-kp-open', '');
    const place = (/** @type {HTMLElement} */ popup) => {
        const r = st.input.closest('.kp-time__control')?.getBoundingClientRect() ?? st.input.getBoundingClientRect();
        const narrow = window.matchMedia('(max-width: 40rem)').matches;
        if (narrow) {
            popup.style.setProperty('left', '0px');
            popup.style.setProperty('right', '0px');
            popup.style.setProperty('bottom', '0px');
            popup.style.setProperty('top', 'auto');
            popup.style.setProperty('width', 'auto');
            return;
        }
        const h = popup.offsetHeight;
        const below = window.innerHeight - r.bottom;
        const top = below >= h + 8 || below >= r.top ? r.bottom + 4 : r.top - h - 4;
        popup.style.setProperty('left', `${Math.max(8, Math.min(r.left, window.innerWidth - popup.offsetWidth - 8))}px`);
        popup.style.setProperty('top', `${Math.max(8, top)}px`);
        popup.style.setProperty('right', 'auto');
        popup.style.setProperty('bottom', 'auto');
        popup.style.setProperty('width', `${Math.max(r.width, 13 * 16)}px`);
    };
    st.lower = raiseOverlay(st.popup, place);
    markActive(root, false);
}

/** @param {HTMLElement} root @param {{ focus?: boolean }} [options] */
function closeList(root, { focus = false } = {}) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    if (!st.open) return;
    st.open = false;
    st.lower?.();
    st.lower = null;
    st.popup.hidden = true;
    st.input.setAttribute('aria-expanded', 'false');
    st.input.removeAttribute('aria-activedescendant');
    root.removeAttribute('data-kp-open');
    if (focus) st.input.focus();
}

/** Choose a value from the list or a chip. @param {HTMLElement} root @param {string} value */
function pick(root, value) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    setInvalid(root, '');
    write(root, value);
    closeList(root);
    st.input.focus();
    st.input.select();
}

/**
 * Set the value (no event unless `fire`), or clear it with an empty text.
 * @param {HTMLElement} root @param {string} value `HH:MM`, or '' @param {{ fire?: boolean }} [options]
 */
export function setTime(root, value, { fire = false } = {}) {
    if (!(root instanceof HTMLElement)) return;
    build(root);
    setInvalid(root, '');
    write(root, value, { silent: !fire });
}

/** The value as it stands (`HH:MM`, or '' while empty or invalid). @param {HTMLElement} root */
export function timeValue(root) {
    return STATE.get(root)?.value ?? '';
}

/** Whether the field is fine: valid, and not empty when required. @param {HTMLElement} root */
export function timeValid(root) {
    const st = STATE.get(root);
    if (!st) return true;
    return st.invalid === '' && !(root.hasAttribute('data-kp-time-required') && st.value === '');
}

/**
 * Give the list its presets, or say they are loading or could not be loaded.
 * @param {HTMLElement} root @param {TimePreset[] | 'loading' | 'error'} presets
 */
export function setTimePresets(root, presets) {
    const st = build(root);
    st.presets = presets;
    if (st.open) {
        drawPopup(root);
    }
}

/** Show or hide the zone line and the look. @param {HTMLElement} root */
function sync(root) {
    const st = /** @type {TimeState} */ (STATE.get(root));
    const s = getStrings();
    const zone = /** @type {HTMLElement} */ (root.querySelector('.kp-time__zone'));
    const z = attr(root, 'zone', '');
    zone.hidden = z === '';
    zone.textContent = z ? s.timeZoneNote(z) : '';
    root.classList.toggle('kp-time--inline', attr(root, 'look', 'field') === 'inline');
    const off = root.hasAttribute('disabled') || root.hasAttribute('data-kp-disabled') || root.getAttribute('data-kp-state') === 'loading';
    st.input.disabled = off;
    const toggle = /** @type {HTMLButtonElement} */ (root.querySelector('.kp-time__toggle'));
    toggle.disabled = off || attr(root, 'popup', 'list') === 'none';
    toggle.hidden = attr(root, 'popup', 'list') === 'none';
    st.input.toggleAttribute('required', root.hasAttribute('data-kp-time-required'));
    const reason = root.getAttribute('data-kp-disabled-reason');
    if (off && reason && root.getAttribute('data-kp-state') !== 'loading') st.input.setAttribute('data-kp-disabled-reason', reason);
    else st.input.removeAttribute('data-kp-disabled-reason');
    root.toggleAttribute('aria-busy', root.getAttribute('data-kp-state') === 'loading');
}

/**
 * Wire every time field under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTimes(root = document) {
    const roots = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(TIME) ? [root] : []), ...root.querySelectorAll(TIME)]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el_ of roots) {
        const was = STATE.get(el_);
        if (was?.off.length) continue;
        const initial = el_.getAttribute('data-kp-value') ?? '';
        const st = build(el_);
        const remembered = memoryFor(el_, 'time')?.read('value', null);
        const start = initial || (typeof remembered === 'string' ? remembered : '');
        const parsed = start ? parseTimeOfDay(start, { seconds: seconds(el_) }) : null;
        write(el_, parsed ? parsed.value : '', { silent: true });
        sync(el_);
        const stopReasons = attachDisabledReasons(el_);
        const observer = new MutationObserver(() => {
            sync(el_);
            // Every option is live: presets and the list's entries follow their attributes.
            if (Array.isArray(st.presets) || st.presets.length === 0) st.presets = presetsFromAttribute(el_);
            if (st.open) drawPopup(el_);
        });
        observer.observe(el_, {
            attributes: true,
            attributeFilter: ['disabled', 'data-kp-disabled', 'data-kp-disabled-reason', 'data-kp-state', ...['look', 'zone', 'popup', 'required', 'step', 'min', 'max', 'presets', 'now', 'clear', 'near', 'near-width', 'seconds'].map((n) => `data-kp-time-${n}`)],
        });
        const onInput = () => {
            // Digits typed fast: 0230 becomes 02:30 as the third digit arrives.
            const v = st.input.value;
            if (/^\d{4}$/.test(v)) st.input.value = `${v.slice(0, 2)}:${v.slice(2)}`;
            if (st.invalid) setInvalid(el_, '');
            if (st.open) {
                const p = parseTimeOfDay(st.input.value, { seconds: seconds(el_) });
                if (p) {
                    const options = /** @type {HTMLElement[]} */ ([...st.popup.querySelectorAll('.kp-time__option')]);
                    const t = timeMinutes(p.value);
                    let best = st.active;
                    let delta = Infinity;
                    options.forEach((o, i) => {
                        const v2 = o.getAttribute('data-kp-time-pick') ?? '';
                        if (!v2) return;
                        const d = Math.abs(timeMinutes(v2) - t);
                        if (d < delta) {
                            delta = d;
                            best = i;
                        }
                    });
                    st.active = best;
                    markActive(el_);
                }
            }
        };
        const onBlur = () => {
            if (st.open) return;
            if (st.input.value.trim() !== st.value || st.invalid) commitText(el_, st.input.value);
            else if (st.input.value.trim() === '' && el_.hasAttribute('data-kp-time-required') && el_.hasAttribute('data-kp-time-touched')) setInvalid(el_, getStrings().timeRequired);
            el_.setAttribute('data-kp-time-touched', '');
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const step = stepOf(el_);
            if (event.key === 'Enter') {
                if (st.open) {
                    event.preventDefault();
                    const option = /** @type {HTMLElement | undefined} */ ([...st.popup.querySelectorAll('.kp-time__option')][st.active]);
                    if (option) pick(el_, option.getAttribute('data-kp-time-pick') ?? '');
                    return;
                }
                // In a sentence or a form, Enter reads the text first and then lets the form go on.
                if (!commitText(el_, st.input.value)) event.preventDefault();
                return;
            }
            if (event.key === 'Escape') {
                if (st.open) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeList(el_, { focus: true });
                }
                return;
            }
            if (event.key === 'ArrowDown' && event.altKey) {
                event.preventDefault();
                return openList(el_);
            }
            const up = event.key === 'ArrowUp' || event.key === 'PageUp';
            const down = event.key === 'ArrowDown' || event.key === 'PageDown';
            if (!up && !down) return;
            event.preventDefault();
            if (st.open && event.key.startsWith('Arrow')) {
                const options = st.popup.querySelectorAll('.kp-time__option');
                st.active = Math.max(0, Math.min(options.length - 1, st.active + (down ? 1 : -1)));
                markActive(el_);
                return;
            }
            const amount = event.key.startsWith('Page') || event.shiftKey ? 60 : step;
            // Read what is typed first, so a half-written time steps from where the person is.
            const typed = parseTimeOfDay(st.input.value, { seconds: seconds(el_) });
            const from = typed ? typed.value : st.value;
            const result = stepTime(from, up ? 1 : -1, amount);
            const min = el_.getAttribute('data-kp-time-min');
            const max = el_.getAttribute('data-kp-time-max');
            let next = result.value;
            if ((min || max) && !timeInWindow(next, min, max)) {
                // Skip to the next step inside the window.
                let tries = 0;
                while (!timeInWindow(next, min, max) && tries < 1440 / amount + 1) {
                    next = stepTime(next, up ? 1 : -1, amount).value;
                    tries += 1;
                }
            }
            setInvalid(el_, '');
            write(el_, seconds(el_) ? `${next}:00` : next);
            st.input.select();
            if (result.wrapped) say(el_, up ? getStrings().timeWrappedNext(next) : getStrings().timeWrappedPrevious(next));
        };
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const t = event.target instanceof Element ? event.target : null;
            if (!t) return;
            if (t.closest('.kp-time__toggle')) {
                if (st.open) closeList(el_, { focus: true });
                else {
                    st.input.focus();
                    openList(el_);
                }
                return;
            }
            const choice = t.closest('[data-kp-time-pick]');
            if (choice && st.popup.contains(choice)) return pick(el_, choice.getAttribute('data-kp-time-pick') ?? '');
            if (t.closest('[data-kp-time-retry]')) {
                el_.dispatchEvent(new CustomEvent(TIME_RETRY_EVENT, { bubbles: true }));
                return;
            }
            if (t === st.input && !st.open && window.matchMedia('(max-width: 40rem)').matches) openList(el_);
        };
        /** @param {FocusEvent} event */
        const onFocusOut = (event) => {
            const next = /** @type {Node | null} */ (event.relatedTarget);
            if (next && el_.contains(next)) return;
            if (st.open) closeList(el_);
            onBlur();
        };
        const onFocusIn = () => {
            if (!st.input.disabled) requestAnimationFrame(() => document.activeElement === st.input && st.input.select());
        };
        /** @param {ClipboardEvent} event */
        const onPaste = (event) => {
            const text = event.clipboardData?.getData('text') ?? '';
            if (!text) return;
            event.preventDefault();
            st.input.value = text.trim();
            commitText(el_, text);
        };
        /** @param {PointerEvent} event */
        const onDown = (event) => {
            // A press on the list keeps the focus where it was, so the field does not commit half-way.
            if (event.target instanceof Element && st.popup.contains(event.target) && !event.target.closest('button')) event.preventDefault();
        };
        /** @param {PointerEvent} event */
        const onOutside = (event) => {
            if (st.open && event.target instanceof Node && !el_.contains(event.target) && !st.popup.contains(event.target)) closeList(el_);
        };
        document.addEventListener('pointerdown', onOutside, true);
        st.input.addEventListener('input', onInput);
        st.input.addEventListener('keydown', onKey);
        st.input.addEventListener('paste', onPaste);
        el_.addEventListener('click', onClick);
        el_.addEventListener('focusout', onFocusOut);
        el_.addEventListener('focusin', onFocusIn);
        st.popup.addEventListener('pointerdown', onDown);
        st.off = [
            () => st.input.removeEventListener('input', onInput),
            () => st.input.removeEventListener('keydown', onKey),
            () => st.input.removeEventListener('paste', onPaste),
            () => el_.removeEventListener('click', onClick),
            () => el_.removeEventListener('focusout', onFocusOut),
            () => el_.removeEventListener('focusin', onFocusIn),
            () => st.popup.removeEventListener('pointerdown', onDown),
            () => document.removeEventListener('pointerdown', onOutside, true),
            () => observer.disconnect(),
            () => closeList(el_),
            stopReasons,
        ];
        undo.push(() => {
            for (const stop of st.off) stop();
            st.off = [];
        });
    }
    return () => undo.forEach((u) => u());
}
