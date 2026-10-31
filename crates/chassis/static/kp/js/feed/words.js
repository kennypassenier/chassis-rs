// The words of a feed: a counted unit, a row's state word and the word for a day.

import { getStrings } from '../strings.js';
import { HOUR_MS, YESTERDAY_PROBES_H } from './constants.js';
import { dayKey } from './options.js';

/** "3 operations". @param {number} n @param {{ one: string, many: string }} unit */
export const counted = (n, unit) => `${n} ${n === 1 ? unit.one : unit.many}`;

/** The word that says a row's outcome besides its colour. @param {import('./constants.js').FeedRowState | undefined} state */
export function stateWord(state) {
    const t = getStrings();
    switch (state) {
        case 'ok':
            return t.statusOk;
        case 'failed':
            return t.statusFailed;
        case 'warn':
            return t.statusWarn;
        case 'running':
            return t.feedStateRunning;
        case 'info':
            return t.feedStateInfo;
        default:
            return '';
    }
}

/** The weekday of a moment, in the page's language. @param {HTMLElement} el @param {string} zone @param {number} ms */
function weekdayOf(el, zone, ms) {
    const locale = /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || 'en-GB';
    return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: zone }).format(ms);
}

/**
 * The word for a day: Today, Yesterday, or its weekday.
 * @param {import('./controller.js').FeedController} c @param {number} ms @param {string} key
 */
export function dayWord(c, ms, key) {
    const t = c.now();
    const today = dayKey(t, c.zone);
    if (key === today) return getStrings().feedToday;
    const yesterday = YESTERDAY_PROBES_H.map((h) => dayKey(t - h * HOUR_MS, c.zone)).find((k) => k !== today);
    return key === yesterday ? getStrings().feedYesterday : weekdayOf(c.host, c.zone, ms);
}
