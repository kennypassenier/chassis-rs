// The snooze picker's selector, events and choices: the words a picker speaks in, the moments its choices stand for, and
// the list it offers now. Pure but for the strings.

import { getStrings } from '../strings.js';
import { presetMs, parseTime } from '../range.js';
import { CHART_TIME_ZONE, wallTime, zonedTime } from '../chart.js';
import { runMoment, runsRelative } from '../runs.js';

/** A snooze picker. */
export const SNOOZE = '[data-kp-snooze]';
/** Fired on the picker when a choice is made: `{ until, choice }`. */
export const SNOOZE_EVENT = 'kp-snooze';
/** Fired on the picker when End snooze is pressed. */
export const SNOOZE_END_EVENT = 'kp-snooze-end';
/** The choices a picker offers when it does not say. */
export const SNOOZE_CHOICES = ['1h', '4h', 'tonight', 'tomorrow', 'monday', 'pick'];

export const MINUTE = 60000;

/** @param {number} n */
export const two = (n) => String(n).padStart(2, '0');

/**
 * "09:00" as hour and minute; null when it is not a time of day.
 * @param {string | undefined} text @param {string} fallback
 */
export function clock(text, fallback) {
    return parseTime(text ?? '') ?? /** @type {{ hour: number, minute: number }} */ (parseTime(fallback));
}

/** The word sets a picker can choose with `data-kp-snooze-words`. `pause` is built in [wish-1120, homelab 125]. @type {Map<string, Partial<import('../strings.js').Strings>>} */
const WORD_SETS = new Map([
    [
        'pause',
        {
            snoozeTrigger: 'Pause until…',
            snoozeChange: 'Pause again',
            snoozeChoicesLabel: 'Pause for',
            snoozePickTitle: 'Pause until',
            snoozeApply: 'Pause',
            snoozeUntil: (moment) => `Paused until ${moment}`,
            snoozeNone: 'Not paused',
            snoozeEnd: 'Resume now',
            snoozeSaving: 'Saving the pause',
            snoozeErrorMax: (days) => `A pause can be at most ${days} days long.`,
        },
    ],
]);

/**
 * Name a set of words a picker can choose with `data-kp-snooze-words="<name>"`: any of the dictionary's `snooze…` words. The page that uses
 * the picker as a pause says "Pause until…" and "Resume now" in its pickers and the page that uses it as a reminder keeps "Remind me later",
 * with no `setStrings()` on mount and none on unmount [wish-1120, homelab 125].
 * @param {string} name
 * @param {Partial<import('../strings.js').Strings>} words
 */
export function registerSnoozeWords(name, words) {
    WORD_SETS.set(name, words);
}

/** The attributes that word one picker alone, each the dictionary's word of the same name. */
const WORD_ATTRIBUTES = /** @type {const} */ ([
    ['data-kp-snooze-trigger', 'snoozeTrigger'],
    ['data-kp-snooze-change', 'snoozeChange'],
    ['data-kp-snooze-none', 'snoozeNone'],
    ['data-kp-snooze-end', 'snoozeEnd'],
    ['data-kp-snooze-apply', 'snoozeApply'],
    ['data-kp-snooze-saving', 'snoozeSaving'],
]);

/**
 * The words one picker speaks: the dictionary's, over them the set its `data-kp-snooze-words` names, over them its own attributes
 * (`data-kp-snooze-trigger`, `-change`, `-none`, `-end`, `-apply`, `-saving`, and `-until` with `{when}` for the moment) [wish-1120, homelab 125].
 * @param {Element} el
 * @returns {import('../strings.js').Strings}
 */
export function snoozeWords(el) {
    const set = WORD_SETS.get(el.getAttribute('data-kp-snooze-words') ?? '') ?? {};
    /** @type {Record<string, unknown>} */
    const own = {};
    for (const [attribute, key] of WORD_ATTRIBUTES) {
        const text = el.getAttribute(attribute);
        if (text) own[key] = text;
    }
    const until = el.getAttribute('data-kp-snooze-until');
    if (until) own.snoozeUntil = (/** @type {string} */ moment) => until.replace('{when}', moment);
    return { ...getStrings(), ...set, ...own };
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
 * @property {import('../strings.js').Strings} [strings] the words (a picker's own set, see snoozeWords()); the dictionary's when absent
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
    strings,
}) {
    const s = strings ?? getStrings();
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

