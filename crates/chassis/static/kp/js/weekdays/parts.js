// The elements of one picker, built but not yet placed: the chip group with its items, the line in words, the error, the reason and the quick picks.

import { dayNames } from './names.js';
import { MONTH_DAYS, WEEK } from './values.js';

/** @typedef {ReturnType<typeof import('./options.js').readWeekdaysOptions>} WeekdaysOptions */
/** @typedef {ReturnType<typeof import('../strings.js').getStrings>} Strings */

/**
 * The chips: the package's multi chip group, one chip per day.
 * @param {Document} doc @param {WeekdaysOptions} o @param {string} label
 */
export function buildChips(doc, o, label) {
    const group = doc.createElement('div');
    group.className = `kp-segmented kp-segmented--chips kp-weekdays__chips${o.month ? ' kp-weekdays__chips--month' : ''}`;
    group.dataset.kpSegmented = 'multi';
    group.dataset.kpSegmentedCollapse = 'false';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    if (o.disabled) group.setAttribute('aria-disabled', 'true');
    return group;
}

/**
 * The chip items: the days 1 to 31 and "Last", or the seven days from the week's first.
 * @param {WeekdaysOptions} o @param {Strings} s
 * @returns {import('../segmented.js').SegmentedItem[]}
 */
export function chipItems(o, s) {
    if (o.month) {
        return [
            ...Array.from({ length: MONTH_DAYS }, (_, i) => ({ value: String(i + 1), label: String(i + 1), hint: s.weekdaysOrdinal(i + 1) })),
            { value: 'last', label: s.weekdaysLast, hint: s.weekdaysLastDay },
        ];
    }
    const shortNames = dayNames(o.narrow ? 'narrow' : 'short', o.locale);
    const longNames = dayNames('long', o.locale);
    return Array.from({ length: WEEK }, (_, i) => (i + o.firstDay) % WEEK).map((d) => ({ value: String(d), label: shortNames[d] ?? '', hint: longNames[d] ?? '' }));
}

/**
 * The line in words, the error under the chips and the reason it is off.
 * @param {HTMLElement} el @param {WeekdaysOptions} o @param {string} id
 */
export function buildLines(el, o, id) {
    const doc = el.ownerDocument;
    const summary = doc.createElement('p');
    summary.className = 'kp-weekdays__summary';
    summary.id = `${id}-summary`;
    summary.setAttribute('aria-live', 'polite');
    summary.hidden = !o.showSummary;
    const why = doc.createElement('p');
    why.className = 'kp-field__error kp-weekdays__why';
    why.id = `${id}-why`;
    why.hidden = true;
    const reason = doc.createElement('p');
    reason.className = 'kp-weekdays__reason';
    reason.id = `${id}-reason`;
    const reasonText = el.dataset.kpDisabledReason;
    reason.hidden = !(o.disabled && reasonText);
    reason.textContent = o.disabled && reasonText ? reasonText : '';
    return { summary, why, reason };
}

/**
 * The quick picks: one press for the common sets.
 * @param {Document} doc @param {WeekdaysOptions} o @param {Strings} s
 */
export function buildQuick(doc, o, s) {
    const quick = doc.createElement('div');
    quick.className = 'kp-weekdays__presets';
    quick.setAttribute('role', 'group');
    quick.setAttribute('aria-label', s.weekdaysPresets);
    quick.hidden = o.presets.length === 0;
    /** @type {Map<string, HTMLButtonElement>} */
    const buttons = new Map();
    for (const name of o.presets) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'kp-button kp-button--ghost kp-button--sm kp-weekdays__preset';
        button.dataset.kpWeekdaysPreset = name;
        button.disabled = o.disabled;
        button.setAttribute('aria-pressed', 'false');
        button.textContent = name === 'weekdays' ? s.weekdaysPresetWeekdays : name === 'weekend' ? s.weekdaysPresetWeekend : s.weekdaysPresetEvery;
        quick.append(button);
        buttons.set(name, button);
    }
    return { quick, buttons };
}
