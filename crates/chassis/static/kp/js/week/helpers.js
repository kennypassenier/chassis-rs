// Small helpers: elements, times, keys and day names.
import { wallTime } from '../chart.js';
/** @typedef {import('./types.js').WeekEvent} WeekEvent */
/** @typedef {import('./types.js').WeekModel} WeekModel */

/** Two digits. @param {number} n */
export const two = (n) => String(n).padStart(2, '0');

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/** @param {number | string} when @returns {number} */
export const toMs = (when) => (typeof when === 'number' ? when : Date.parse(when));

/** @param {Element} host @returns {string | undefined} */
export const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;

/** @param {WeekModel} c @param {string} iso */
export const dayName = (c, iso, style = /** @type {'short' | 'long'} */ ('short')) =>
    new Intl.DateTimeFormat(c.locale, { weekday: style, timeZone: 'UTC' }).format(Date.parse(`${iso}T12:00:00Z`));

/** `17/10` for the head, `17/10/2026` for a name. @param {string} iso @param {boolean} [year] */
export const dm = (iso, year = false) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}${year ? `/${iso.slice(0, 4)}` : ''}`;

/** @param {WeekModel} c @param {WeekEvent} e @param {string} hhmm @param {string} iso */
export function nameOf(c, e, hhmm, iso) {
    const s = c.strings;
    const state =
        e.state === 'next'
            ? s.weekNextRun
            : e.state === 'off'
              ? s.weekOff
              : e.state === 'skipped'
                ? s.weekSkipped
                : e.state === 'reference'
                  ? s.weekReference
                  : '';
    return [`${e.label}, ${dayName(c, iso)} ${dm(iso, true)} ${hhmm}`, state, e.detail ?? ''].filter(Boolean).join(', ');
}

/** The time of day of a moment: `{ hhmm, at }`, `at` a share of the day (0 to 1). @param {WeekModel} c @param {number} ms */
export function timeOfDay(c, ms) {
    const w = wallTime(ms, c.zone);
    return { hhmm: `${two(w.hour)}:${two(w.minute)}`, at: (w.hour * 60 + w.minute) / 1440 };
}
