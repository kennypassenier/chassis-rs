// Quiet hours: from, to, which days, and what still comes through [wish-1120, homelab 96; the dashboard's notification rules].
//
// One control for "do not push me between 22:00 and 07:00 on these days, except a critical notice". It is composed of the package's own
// parts, not new inputs: the switch, two time fields (js/timefield.js), the weekday picker (js/weekdays.js) and one tick per severity that
// may break the quiet; a line in words under them says what the whole thing means.
//
//   <div class="kp-quiet" data-kp-quiet data-kp-value='{"on":true,"from":"22:00","to":"07:00","days":[1,2,3,4,5],"through":["critical"]}'></div>
//
// The value is `{ on, from, to, days, through }`: `from` and `to` are `HH:MM` (a window across midnight, 22:00 to 07:00, belongs to the day
// it starts on), `days` the weekdays as `Date#getDay` counts them (0 is Sunday; all seven by default), `through` the severities that still
// come through, by key. While `on` is false the fields stay in place, dimmed and out of the tab order (`inert`), so the control keeps its
// size. `from` equal to `to` is refused with a line under the times (`valid: false` in the event).
//
// Options, as attributes on the root (read again when they change), each with a default [KT6]:
//
//   data-kp-value               the JSON above                                          off, 22:00 to 07:00, every day, critical comes through
//   data-kp-quiet-severities    `critical,warning,info,ok`, each also `key=Words`        the four, in the dictionary's words
//   data-kp-quiet-step          minutes for the time fields                             15
//   data-kp-quiet-label         the control's accessible name                           Quiet hours
//   data-kp-disabled            the sentence that says why it cannot be changed now      none
//   data-kp-state               `loading` shows the control's own bars in its place     ready
//
// `kp-quiet-change` `{ value, summary, valid }` is fired on the root when a person changes something (not for `setQuiet`). The page stores
// the value and tells the control back with setQuiet(el, value). `quietSummary(value)` is the line in words, on its own.
// Nothing runs on import; attachQuietHours(root) returns a detach.

import { getStrings } from './strings.js';
import { TIME_EVENT, attachTimes, setTime, timeMinutes } from './timefield.js';
import { WEEKDAYS_EVENT, attachWeekdays, dayNames, joinWords, setWeekdays, weekdaySummary } from './weekdays.js';

/** The controls this module looks after. */
export const QUIET = '[data-kp-quiet]';
/** Fired on the control when a person changes it: `{ value, summary, valid }`. */
export const QUIET_EVENT = 'kp-quiet-change';
/** The severities, most serious first, when the page names none. */
export const QUIET_SEVERITIES = /** @type {const} */ (['critical', 'warning', 'info', 'ok']);

/**
 * @typedef {object} QuietValue
 * @property {boolean} on quiet hours are on
 * @property {string} from `HH:MM`
 * @property {string} to `HH:MM`
 * @property {number[]} days 0 (Sunday) to 6
 * @property {string[]} through the severities that still come through
 */

/** @type {QuietValue} */
const DEFAULT = { on: false, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6], through: ['critical'] };

/**
 * A value read from whatever the page wrote, with the defaults for what is missing. Pure.
 * @param {unknown} raw an object, or its JSON text
 * @returns {QuietValue}
 */
export function readQuiet(raw) {
    /** @type {Record<string, unknown>} */
    let data = {};
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object') data = /** @type {Record<string, unknown>} */ (parsed);
    } catch {
        data = {};
    }
    const time = (/** @type {unknown} */ t, /** @type {string} */ fallback) => (typeof t === 'string' && Number.isFinite(timeMinutes(t)) ? t : fallback);
    const days = Array.isArray(data.days) ? [...new Set(data.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : DEFAULT.days;
    const through = Array.isArray(data.through) ? [...new Set(data.through.map(String))] : DEFAULT.through;
    return { on: data.on === true, from: time(data.from, DEFAULT.from), to: time(data.to, DEFAULT.to), days, through };
}

/**
 * The value in words: "Quiet from 22:00 to 07:00: Every weekday. Critical still comes through." Pure.
 * @param {QuietValue} value
 * @param {{ severities?: readonly { key: string, label: string }[], firstDay?: number }} [options]
 * @returns {string}
 */
export function quietSummary(value, { severities, firstDay = 1 } = {}) {
    const s = getStrings();
    if (!value.on) return s.quietOff;
    if (value.from === value.to) return s.quietSame;
    const days = weekdaySummary(value.days, { firstDay, names: dayNames('short') });
    const known = severities ?? QUIET_SEVERITIES.map((key) => ({ key, label: severityWord(key) }));
    const names = known.filter((k) => value.through.includes(k.key)).map((k) => k.label);
    const head = s.quietWhen(value.from, value.to, days);
    return names.length ? `${head} ${s.quietThrough(joinWords(names), names.length)}` : `${head} ${s.quietNothing}`;
}

/** @param {string} key */
function severityWord(key) {
    const s = getStrings();
    return /** @type {Record<string, string>} */ ({ critical: s.quietCritical, warning: s.quietWarning, info: s.quietInfo, ok: s.quietOk })[key] ?? key;
}

let serial = 0;

/** @type {WeakMap<Element, { value: () => QuietValue, set: (value: unknown) => void }>} */
const HANDLES = new WeakMap();

/** @param {HTMLElement} root */
function attachOne(root) {
    if (HANDLES.has(root)) return () => undefined;
    const doc = root.ownerDocument;
    const s = getStrings();
    const id = root.id || (root.id = `kp-quiet-${(serial += 1)}`);
    root.classList.add('kp-quiet');
    root.setAttribute('role', 'group');
    const make = (/** @type {string} */ className, /** @type {string} */ tag = 'div') => {
        const node = doc.createElement(tag);
        node.className = className;
        return node;
    };

    const severities = () =>
        (root.getAttribute('data-kp-quiet-severities') || QUIET_SEVERITIES.join(','))
            .split(/\s*,\s*/)
            .filter(Boolean)
            .map((part) => {
                const [key, ...words] = part.split('=');
                return { key: key.trim(), label: words.join('=').trim() || severityWord(key.trim()) };
            });

    // The switch.
    const onLabel = /** @type {HTMLLabelElement} */ (make('kp-switch kp-quiet__on', 'label'));
    const onInput = /** @type {HTMLInputElement} */ (make('kp-switch__input', 'input'));
    onInput.type = 'checkbox';
    onInput.setAttribute('role', 'switch');
    const onWords = make('kp-quiet__on-label', 'span');
    onLabel.append(onInput, onWords);

    // The body: label | control rows on one grid.
    const body = make('kp-quiet__body');
    const field = (/** @type {string} */ name, /** @type {string} */ text, /** @type {HTMLElement} */ control) => {
        const row = make(`kp-quiet__field kp-quiet__field--${name}`);
        const label = make('kp-quiet__label kp-field__label', 'span');
        label.id = `${id}-${name}`;
        label.textContent = text;
        row.append(label, control);
        return row;
    };
    const fromBox = make('kp-time');
    fromBox.setAttribute('data-kp-time', '');
    fromBox.setAttribute('data-kp-name', `${id}-from`);
    const toBox = make('kp-time');
    toBox.setAttribute('data-kp-time', '');
    toBox.setAttribute('data-kp-name', `${id}-to`);
    const dayBox = make('kp-weekdays');
    dayBox.setAttribute('data-kp-weekdays', '');
    dayBox.setAttribute('data-kp-presets', 'weekdays,weekend,every');
    const through = make('kp-quiet__through');
    through.setAttribute('role', 'group');
    const rows = [
        field('from', s.quietFrom, fromBox),
        field('to', s.quietTo, toBox),
        field('days', s.quietDays, dayBox),
        field('through', s.quietThroughLabel, through),
    ];
    through.setAttribute('aria-labelledby', `${id}-through`);
    const problem = make('kp-quiet__problem kp-field__error', 'p');
    problem.id = `${id}-problem`;
    problem.hidden = true;
    body.append(...rows, problem);
    const summary = make('kp-quiet__summary', 'p');
    summary.id = `${id}-summary`;
    summary.setAttribute('aria-live', 'polite');
    const reason = make('kp-quiet__reason kp-field__help', 'p');
    reason.hidden = true;
    const wait = make('kp-quiet__wait');
    wait.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i += 1) wait.append(make('kp-skeleton kp-quiet__bone', 'span'));
    root.replaceChildren(onLabel, body, summary, reason, wait);

    let value = readQuiet(root.getAttribute('data-kp-value') ?? DEFAULT);

    const checks = () => /** @type {HTMLInputElement[]} */ ([...through.querySelectorAll('input[type="checkbox"]')]);
    const drawSeverities = () => {
        through.replaceChildren(
            ...severities().map(({ key, label }) => {
                const row = make('kp-field__option kp-quiet__severity', 'label');
                const box = /** @type {HTMLInputElement} */ (make('kp-field__check', 'input'));
                box.type = 'checkbox';
                box.value = key;
                box.checked = value.through.includes(key);
                const words = make('kp-field__option-title', 'span');
                words.textContent = label;
                row.append(box, words);
                return row;
            }),
        );
    };
    const valid = () => !value.on || value.from !== value.to;
    const paint = () => {
        onWords.textContent = root.getAttribute('data-kp-quiet-label') ?? s.quietLabel;
        root.setAttribute('aria-label', onWords.textContent);
        onInput.checked = value.on;
        body.toggleAttribute('inert', !value.on);
        root.toggleAttribute('data-kp-quiet-on', value.on);
        for (const box of checks()) box.checked = value.through.includes(box.value);
        problem.hidden = valid();
        problem.textContent = valid() ? '' : s.quietSame;
        summary.textContent = valid() ? quietSummary(value, { severities: severities() }) : '';
        const why = root.getAttribute('data-kp-disabled');
        const state = root.getAttribute('data-kp-state');
        root.toggleAttribute('inert', why !== null && why !== undefined && root.hasAttribute('data-kp-disabled'));
        reason.hidden = !root.hasAttribute('data-kp-disabled') || !why;
        reason.textContent = why ?? '';
        wait.hidden = state !== 'loading';
        root.toggleAttribute('aria-busy', state === 'loading');
    };
    /** @param {QuietValue} next @param {boolean} fire */
    const write = (next, fire) => {
        value = next;
        setTime(fromBox, value.from);
        setTime(toBox, value.to);
        setWeekdays(dayBox, value.days);
        paint();
        if (fire) root.dispatchEvent(new CustomEvent(QUIET_EVENT, { bubbles: true, detail: { value: { ...value }, summary: summary.textContent, valid: valid() } }));
    };
    const changed = () => {
        value = { on: onInput.checked, from: value.from, to: value.to, days: value.days, through: checks().filter((b) => b.checked).map((b) => b.value) };
        paint();
        root.dispatchEvent(new CustomEvent(QUIET_EVENT, { bubbles: true, detail: { value: { ...value }, summary: summary.textContent, valid: valid() } }));
    };

    drawSeverities();
    attachTimes(body);
    attachWeekdays(body);
    for (const box of [fromBox, toBox]) box.setAttribute('data-kp-time-step', root.getAttribute('data-kp-quiet-step') || '15');
    fromBox.setAttribute('data-kp-label', s.quietFrom);
    toBox.setAttribute('data-kp-label', s.quietTo);
    dayBox.setAttribute('aria-label', s.quietDays);
    write(value, false);

    /** @param {Event} event */
    const onTime = (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        const detail = /** @type {CustomEvent<{ value: string }>} */ (event).detail;
        if (!detail || typeof detail.value !== 'string' || detail.value === '') return;
        if (target === fromBox || fromBox.contains(target)) value = { ...value, from: detail.value };
        else if (target === toBox || toBox.contains(target)) value = { ...value, to: detail.value };
        else return;
        paint();
        root.dispatchEvent(new CustomEvent(QUIET_EVENT, { bubbles: true, detail: { value: { ...value }, summary: summary.textContent, valid: valid() } }));
    };
    /** @param {Event} event */
    const onDays = (event) => {
        const detail = /** @type {CustomEvent<{ values: (number | 'last')[] }>} */ (event).detail;
        value = { ...value, days: (detail?.values ?? []).filter((d) => typeof d === 'number') };
        paint();
        root.dispatchEvent(new CustomEvent(QUIET_EVENT, { bubbles: true, detail: { value: { ...value }, summary: summary.textContent, valid: valid() } }));
    };
    root.addEventListener(TIME_EVENT, onTime);
    root.addEventListener(WEEKDAYS_EVENT, onDays);
    onInput.addEventListener('change', changed);
    through.addEventListener('change', changed);
    const watch = new MutationObserver(() => {
        severities();
        drawSeverities();
        paint();
    });
    watch.observe(root, { attributes: true, attributeFilter: ['data-kp-quiet-severities', 'data-kp-quiet-label', 'data-kp-disabled', 'data-kp-state'] });
    HANDLES.set(root, { value: () => ({ ...value, days: [...value.days], through: [...value.through] }), set: (next) => write(readQuiet(next), false) });
    return () => {
        root.removeEventListener(TIME_EVENT, onTime);
        root.removeEventListener(WEEKDAYS_EVENT, onDays);
        onInput.removeEventListener('change', changed);
        through.removeEventListener('change', changed);
        watch.disconnect();
        root.replaceChildren();
        HANDLES.delete(root);
    };
}

/**
 * The value a control holds.
 * @param {Element} el
 * @returns {QuietValue | null}
 */
export function quietValue(el) {
    return HANDLES.get(el)?.value() ?? null;
}

/**
 * Set the control from the page's stored value (no event).
 * @param {Element} el an attached `[data-kp-quiet]`
 * @param {Partial<QuietValue>} value
 */
export function setQuiet(el, value) {
    HANDLES.get(el)?.set({ ...(HANDLES.get(el)?.value() ?? DEFAULT), ...value });
}

/**
 * Build every quiet-hours control under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachQuietHours(root = document) {
    const found = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(QUIET) ? [root] : []), ...root.querySelectorAll(QUIET)]);
    const undo = found.map((el) => attachOne(el));
    return () => undo.forEach((u) => u());
}
