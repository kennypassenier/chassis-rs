// Pure date words of a quote: the whole days between two moments by the Brussels calendar, and the date line.

import { agoMoment } from '../freshness.js';
import { getStrings } from '../strings.js';
import { DAY_MS } from './constants.js';

/** The whole days between two moments, by the Brussels calendar. @param {number} from @param {number} to */
function daysBetween(from, to) {
    /** @param {number} ms */
    const dayNumber = (ms) => {
        const [d = '1', mo = '1', y = '1970'] = agoMoment(ms).slice(0, 10).split('/');
        return Date.UTC(Number(y), Number(mo) - 1, Number(d)) / DAY_MS;
    };
    return Math.round(dayNumber(to) - dayNumber(from));
}

/**
 * The date line: "Tuesday 14/10/2026", "3 days ago" or both (rule 52). Pure.
 * @param {number} ms the moment
 * @param {'date' | 'relative' | 'both'} style
 * @param {number} [now]
 * @param {string} [locale]
 */
export function quoteWhen(ms, style = 'both', now = Date.now(), locale = 'en-GB') {
    const s = getStrings();
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'Europe/Brussels' }).format(ms);
    const date = s.quoteDay(weekday, agoMoment(ms).slice(0, 10));
    const relative = s.quoteRelative(daysBetween(ms, now));
    return style === 'relative' ? relative : style === 'both' ? s.quoteBoth(date, relative) : date;
}
