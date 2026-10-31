// The words and numbers of the chooser: the seconds offered, and "Every 30 s", "Every 2 min", "Paused".

import { humanDuration } from '../freshness.js';
import { getStrings } from '../strings.js';

/** The whole seconds a list names, or the fallback when it names none. @param {string | null} raw @param {number[]} fallback */
export const numbers = (raw, fallback) => {
    if (raw === null) return fallback;
    const list = raw
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 0 && Number.isInteger(n));
    return list.length ? list : fallback;
};

/** "Every 30 s", "Every 2 min", "Paused". @param {number} seconds */
export const wordsFor = (seconds) => {
    const s = getStrings();
    return seconds === 0 ? s.refreshPaused : s.refreshEvery(humanDuration(seconds, s));
};
