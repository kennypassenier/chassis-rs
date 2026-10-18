// The weekday picker: seven chips, or the days of a month [kpadopt5-time; homelab's `.sch-daypick`].
//
// A schedule says on which days it runs. The picker is the package's chip group (js/segmented.js, `multi`) with
// the three differences a day picker needs: all seven days is a real choice and none is a wrong one, so the group
// never collapses back to "All"; the week starts where the reader's week starts; and a line in words under the
// chips says what is picked ("Mon and Thu", "Every weekday").
//
//   <div class="kp-weekdays" data-kp-weekdays data-kp-value="1,4" aria-label="Run on"></div>
//
// `data-kp-days="month"` draws the days 1 to 31 and "Last" instead of the week, for a monthly schedule.
// A value is a list of numbers (0 is Sunday, as `Date#getDay` counts) or day names ("mon", "Monday"); in a month,
// the day numbers and `last`. The app's data stays its own: this module reads and writes `values` and nothing else.
//
// Options (markup attribute, then the option of attachWeekdays()), every one with a default [KT6]:
//   data-kp-days          week | month                                   week
//   data-kp-week-starts-on 0..6                                          from the locale (Monday for nl-BE, en-GB)
//   data-kp-day-names     short (Mon) | narrow (M)                       short
//   data-kp-min           the fewest days a schedule needs               1  (0 allows none)
//   data-kp-presets       weekdays,weekend,every | false                 all three, in a week
//   data-kp-summary       false hides the line in words                  shown
//   data-kp-value         the days at first, "1,4"                       none
//   data-kp-disabled      the whole group is off                         off
//   data-kp-disabled-reason the sentence that says why it is off         none (shown under the chips)
//
// Fires `kp-weekdays-change` on the element: `{ values, summary, valid }`. Below `min` the group says so in a line
// under it (`.kp-field__error`) and `aria-describedby` points at it; the value is still reported, so the app decides.
// Arrow keys move along the chips and Space or Enter turns one (the segmented control's own keys).
//
// Nothing runs on import; attachWeekdays(root) returns a detach.

import { getStrings } from './strings.js';
import { attachSegmented, setSegmentedItems, setSegmentedValues, getSegmentedValues, SEGMENTED_EVENT } from './segmented.js';
import { resolveLocale, weekStartsOn } from './locale.js';

/** A weekday picker. */
export const WEEKDAYS = '[data-kp-weekdays]';
/** Fired on the picker when the days change by a person: `{ values, summary, valid }`. */
export const WEEKDAYS_EVENT = 'kp-weekdays-change';
/** The quick picks a week picker offers when it does not say. */
export const WEEKDAY_PRESETS = /** @type {const} */ (['weekdays', 'weekend', 'every']);

/** The days of the working week and of the weekend, in `Date#getDay` numbers. */
const SETS = {
    weekdays: [1, 2, 3, 4, 5],
    weekend: [6, 0],
    every: [0, 1, 2, 3, 4, 5, 6],
};

/** The English names a value may be written with, by day number. */
const NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * A day as a number 0 to 6 (0 is Sunday): a number, a digit string, or a name ("mon", "Tuesday").
 * @param {unknown} value
 * @returns {number | null}
 */
export function dayNumber(value) {
    if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
    const text = String(value ?? '')
        .trim()
        .toLowerCase();
    if (/^[0-6]$/.test(text)) return Number(text);
    const at = NAMES.indexOf(text.slice(0, 3));
    return at >= 0 && /^[a-z]+$/.test(text) ? at : null;
}

/**
 * The weekday names of a style, Sunday first (the way `Date#getDay` counts). English reads the dictionary,
 * which a consumer may replace; another language reads Intl, unless the consumer replaced the dictionary.
 * @param {'short' | 'narrow' | 'long'} style
 * @param {string} [locale]
 * @returns {string[]}
 */
export function dayNames(style, locale) {
    const s = getStrings();
    const own = style === 'short' ? s.weekdaysShort : style === 'narrow' ? s.weekdaysNarrow : s.weekdaysLong;
    const sundayFirst = [6, 0, 1, 2, 3, 4, 5].map((i) => own[i] ?? '');
    try {
        const resolved = resolveLocale(locale);
        if (new Intl.Locale(resolved).language === 'en') return sundayFirst;
        const format = new Intl.DateTimeFormat(resolved, { weekday: style });
        return Array.from({ length: 7 }, (_, i) => format.format(new Date(2001, 0, 7 + i)));
    } catch {
        return sundayFirst;
    }
}

/**
 * "Mon and Thu", "Mon, Wed and Fri": a list in words.
 * @param {readonly string[]} items
 * @param {string} [and]
 */
export function joinWords(items, and = getStrings().weekdaysAnd) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

/**
 * The picked days in words, in the order a week reads from `firstDay`. Pure.
 * @param {readonly number[]} days 0 to 6
 * @param {{ firstDay?: number, names?: readonly string[] }} [options] `names` are Sunday first
 * @returns {string}
 */
export function weekdaySummary(days, { firstDay = 1, names = dayNames('short') } = {}) {
    const s = getStrings();
    const on = new Set(days);
    if (on.size === 0) return s.weekdaysNone;
    const same = (/** @type {readonly number[]} */ set) => set.length === on.size && set.every((d) => on.has(d));
    if (same(SETS.every)) return s.weekdaysEvery;
    if (same(SETS.weekdays)) return s.weekdaysWeekdays;
    if (same(SETS.weekend)) return s.weekdaysWeekend;
    const ordered = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + firstDay) % 7).filter((d) => on.has(d));
    return joinWords(ordered.map((d) => names[d] ?? ''));
}

/**
 * The picked days of a month in words: "On the 1st and 15th", "On the last day".
 * @param {readonly (number | 'last')[]} days
 * @returns {string}
 */
export function monthSummary(days) {
    const s = getStrings();
    if (days.length === 0) return s.weekdaysNone;
    const numbers = days.filter((d) => d !== 'last').sort((a, b) => Number(a) - Number(b));
    const parts = numbers.map((d) => s.weekdaysOrdinal(Number(d)));
    if (days.includes('last')) parts.push(s.weekdaysLastDay);
    return s.weekdaysOnThe(joinWords(parts));
}

/**
 * @typedef {object} WeekdaysHandle
 * @property {HTMLElement} element
 * @property {() => (number | 'last')[]} values the picked days, in day order
 * @property {(values: readonly (number | string)[]) => void} set replace the picked days (no event)
 * @property {() => string} summary the picked days in words
 * @property {() => boolean} valid whether at least `min` days are picked
 */

/** @type {WeakMap<Element, WeekdaysHandle>} */
const HANDLES = new WeakMap();

/**
 * The handle of an attached picker.
 * @param {Element} element
 */
export function weekdays(element) {
    return HANDLES.get(element) ?? null;
}

/**
 * The days a picker holds.
 * @param {Element} element
 * @returns {(number | 'last')[]}
 */
export function weekdaysOf(element) {
    return HANDLES.get(element)?.values() ?? [];
}

/**
 * Set the days of a picker from a script, without the event.
 * @param {Element} element @param {readonly (number | string)[]} values
 */
export function setWeekdays(element, values) {
    HANDLES.get(element)?.set(values);
}

let seq = 0;

/**
 * Wire every weekday picker under `root`.
 * @param {ParentNode} [root]
 * @param {{ locale?: string, weekStartsOn?: number }} [options] defaults; per picker `data-kp-week-starts-on`
 * @returns {() => void} detach
 */
export function attachWeekdays(root = document, { locale: localeOption, weekStartsOn: weekOption } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(WEEKDAYS) ? [root] : []),
        ...root.querySelectorAll(WEEKDAYS),
    ]);
    for (const el of found) {
        if (HANDLES.has(el)) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const id = `kp-weekdays-${++seq}`;
        const month = el.dataset.kpDays === 'month';
        const locale = resolveLocale(localeOption ?? el.dataset.kpLocale, el);
        const firstDay = weekStartsOn(locale, el.dataset.kpWeekStartsOn === undefined ? weekOption : Number(el.dataset.kpWeekStartsOn));
        const narrow = el.dataset.kpDayNames === 'narrow';
        const min = el.dataset.kpMin === undefined ? 1 : Math.max(0, Number(el.dataset.kpMin) || 0);
        const showSummary = el.dataset.kpSummary !== 'false';
        const presetsAttr = el.dataset.kpPresets;
        const presets =
            month || presetsAttr === 'false' ? [] : (presetsAttr ? presetsAttr.split(/[\s,]+/) : [...WEEKDAY_PRESETS]).filter((p) => p in SETS);
        const disabled = el.hasAttribute('data-kp-disabled');
        el.classList.add('kp-weekdays');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
        const label = el.getAttribute('aria-label') ?? s.weekdaysGroup;
        if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', label);

        // The chips: the package's multi chip group, one chip per day.
        const group = doc.createElement('div');
        group.className = `kp-segmented kp-segmented--chips kp-weekdays__chips${month ? ' kp-weekdays__chips--month' : ''}`;
        group.dataset.kpSegmented = 'multi';
        group.dataset.kpSegmentedCollapse = 'false';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', label);
        if (disabled) group.setAttribute('aria-disabled', 'true');
        const shortNames = dayNames(narrow ? 'narrow' : 'short', locale);
        const longNames = dayNames('long', locale);
        /** @type {import('./segmented.js').SegmentedItem[]} */
        const items = month
            ? [
                  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1), hint: s.weekdaysOrdinal(i + 1) })),
                  { value: 'last', label: s.weekdaysLast, hint: s.weekdaysLastDay },
              ]
            : [0, 1, 2, 3, 4, 5, 6]
                  .map((i) => (i + firstDay) % 7)
                  .map((d) => ({ value: String(d), label: shortNames[d] ?? '', hint: longNames[d] ?? '' }));

        const summary = doc.createElement('p');
        summary.className = 'kp-weekdays__summary';
        summary.id = `${id}-summary`;
        summary.setAttribute('aria-live', 'polite');
        summary.hidden = !showSummary;
        const why = doc.createElement('p');
        why.className = 'kp-field__error kp-weekdays__why';
        why.id = `${id}-why`;
        why.hidden = true;
        const reason = doc.createElement('p');
        reason.className = 'kp-weekdays__reason';
        reason.id = `${id}-reason`;
        const reasonText = el.dataset.kpDisabledReason;
        reason.hidden = !(disabled && reasonText);
        reason.textContent = disabled && reasonText ? reasonText : '';

        // The quick picks: one press for the common sets.
        const quick = doc.createElement('div');
        quick.className = 'kp-weekdays__presets';
        quick.setAttribute('role', 'group');
        quick.setAttribute('aria-label', s.weekdaysPresets);
        quick.hidden = presets.length === 0;
        /** @type {Map<string, HTMLButtonElement>} */
        const quickButtons = new Map();
        for (const name of presets) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'kp-button kp-button--ghost kp-button--sm kp-weekdays__preset';
            button.dataset.kpWeekdaysPreset = name;
            button.disabled = disabled;
            button.setAttribute('aria-pressed', 'false');
            button.textContent =
                name === 'weekdays' ? s.weekdaysPresetWeekdays : name === 'weekend' ? s.weekdaysPresetWeekend : s.weekdaysPresetEvery;
            quick.append(button);
            quickButtons.set(name, button);
        }
        el.replaceChildren(group, quick, summary, why, reason);
        setSegmentedItems(group, items);
        const detachSegmented = attachSegmented(el);

        /** The picked values, in the order the chips stand. @returns {string[]} */
        const picked = () => getSegmentedValues(group);
        /** @returns {(number | 'last')[]} */
        const values = () =>
            month
                ? /** @type {(number | 'last')[]} */ (
                      picked()
                          .map((v) => (v === 'last' ? 'last' : Number(v)))
                          .sort((a, b) => (a === 'last' ? 1 : b === 'last' ? -1 : a - b))
                  )
                : picked()
                      .map(Number)
                      .sort((a, b) => ((a - firstDay + 7) % 7) - ((b - firstDay + 7) % 7));
        const words = () =>
            month ? monthSummary(values()) : weekdaySummary(/** @type {number[]} */ (values()), { firstDay, names: dayNames('short', locale) });
        const valid = () => values().length >= min;

        /** Bring the line, the error and the quick picks in step with the chips. */
        const paint = () => {
            const have = values();
            summary.textContent = words();
            const ok = have.length >= min;
            why.hidden = ok;
            why.textContent = ok ? '' : s.weekdaysMin(min);
            const described = [showSummary ? summary.id : '', ok ? '' : why.id, reason.hidden ? '' : reason.id].filter(Boolean).join(' ');
            if (described) el.setAttribute('aria-describedby', described);
            else el.removeAttribute('aria-describedby');
            el.toggleAttribute('data-kp-invalid', !ok);
            if (!ok) el.setAttribute('aria-invalid', 'true');
            else el.removeAttribute('aria-invalid');
            for (const [name, button] of quickButtons) {
                const set = SETS[/** @type {keyof typeof SETS} */ (name)];
                button.setAttribute('aria-pressed', String(!month && set.length === have.length && set.every((d) => have.includes(d))));
            }
        };

        /** @param {readonly (number | string)[]} next */
        const set = (next) => {
            const wanted = new Set(
                next
                    .map((v) => (month ? (String(v).toLowerCase() === 'last' ? 'last' : String(Math.round(Number(v)))) : String(dayNumber(v))))
                    .filter((v) => (month ? v === 'last' || (Number(v) >= 1 && Number(v) <= 31) : v !== 'null')),
            );
            setSegmentedValues(group, wanted);
            paint();
        };
        /** @param {boolean} fire */
        const change = (fire) => {
            paint();
            if (fire)
                el.dispatchEvent(new CustomEvent(WEEKDAYS_EVENT, { bubbles: true, detail: { values: values(), summary: words(), valid: valid() } }));
        };

        /** @param {Event} event */
        const onChips = (event) => {
            if (event.target !== group) return;
            change(true);
        };
        /** @param {MouseEvent} event */
        const onPreset = (event) => {
            const button = event.target instanceof Element ? event.target.closest('[data-kp-weekdays-preset]') : null;
            if (!(button instanceof HTMLButtonElement) || button.disabled || !quick.contains(button)) return;
            const name = /** @type {keyof typeof SETS} */ (button.dataset.kpWeekdaysPreset);
            const same = button.getAttribute('aria-pressed') === 'true';
            // Pressing the set that is already picked lets it go again: a preset is a toggle, as a chip is.
            set(same ? [] : SETS[name]);
            change(true);
        };
        group.addEventListener(SEGMENTED_EVENT, onChips);
        quick.addEventListener('click', onPreset);

        const initial = (el.dataset.kpValue ?? '')
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean);
        set(initial);
        paint();

        /** @type {WeekdaysHandle} */
        const handle = { element: el, values, set, summary: words, valid };
        HANDLES.set(el, handle);
        cleanups.push(() => {
            group.removeEventListener(SEGMENTED_EVENT, onChips);
            quick.removeEventListener('click', onPreset);
            detachSegmented();
            HANDLES.delete(el);
            el.replaceChildren();
            el.removeAttribute('aria-describedby');
            el.removeAttribute('aria-invalid');
            el.removeAttribute('data-kp-invalid');
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
