// Pure helpers: how long ago a moment was, and the order a picker shows its options in.

import { getStrings } from '../strings.js';
import { humanDuration } from '../freshness.js';
import { DAY_S, MINUTE_S, SECOND_MS } from './constants.js';

/**
 * How long ago a moment was, in words: "just now", "35 min ago", "3 h ago", "3 days ago". Pure.
 * @param {number} ms @param {number} now @param {import('../strings.js').Strings} [strings]
 */
export function datedAge(ms, now, strings = getStrings()) {
    const seconds = Math.floor((now - ms) / SECOND_MS);
    if (seconds < MINUTE_S) return strings.datedJustNow;
    if (seconds >= DAY_S) return strings.datedAgo(strings.agoDays(Math.floor(seconds / DAY_S)));
    return strings.datedAgo(humanDuration(seconds, strings));
}

/**
 * The options in the order a picker shows them. Options without a moment keep their place after those with one. Pure.
 * @param {readonly import('./constants.js').DatedOption[]} options @param {'newest' | 'oldest' | 'given'} order
 * @returns {import('./constants.js').DatedOption[]}
 */
export function orderDated(options, order = 'newest') {
    const list = options.slice();
    if (order === 'given') return list;
    const at = (/** @type {import('./constants.js').DatedOption} */ o) => (o.when === undefined ? NaN : new Date(o.when).getTime());
    return list
        .map((o, i) => ({ o, i, t: at(o) }))
        .sort((a, b) => {
            const an = Number.isNaN(a.t);
            const bn = Number.isNaN(b.t);
            if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
            return order === 'oldest' ? a.t - b.t : b.t - a.t;
        })
        .map((x) => x.o);
}
