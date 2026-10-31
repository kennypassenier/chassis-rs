// Which tone and words a day gets: the standard vocabulary, or the calm one (logged, quiet, paused).

import { calmTone, calmWord, inPausedRange, isCalmTones } from '../calm-tones.js';

/** @typedef {import('./constants.js').CalendarDay} CalendarDay */
/** @typedef {import('./constants.js').CalendarTone} CalendarTone */
/** @typedef {import('./controller.js').CalendarController} CalendarModel */

/**
 * A day in the calm vocabulary: what the page gave, mapped to logged, quiet or paused, with words that never say "missed".
 * @param {import('./controller.js').CalendarController} c @param {string} iso @param {string} today @returns {CalendarDay}
 */
function calmDayFor(c, iso, today) {
    const s = c.strings;
    const words = c.el.getAttribute('data-kp-quiet-words') === 'none' ? '' : (calmWord('quiet') ?? '');
    if (c.state === 'loading') return { tone: 'loading', label: s.calendarLoading };
    if (c.state === 'empty' || c.state === 'error') return { tone: 'quiet', label: words };
    const given = c.days[iso];
    if (iso > today && !given) return { tone: 'future', label: s.calendarFuture };
    const tone = given ? calmTone(given.tone, c.el) : 'quiet';
    if (tone === 'quiet' || tone === 'paused') {
        const paused = tone === 'paused' || inPausedRange(c.el.getAttribute('data-kp-paused-range'), iso);
        return paused ? { tone: 'paused', label: calmWord('paused') ?? '' } : { tone: 'quiet', label: words };
    }
    if (tone === 'logged')
        return { tone: 'logged', label: given?.label || (calmWord('logged') ?? ''), ...(given?.count ? { count: given.count } : {}) };
    return given ? { ...given, tone: /** @type {CalendarTone} */ (tone) } : { tone: 'quiet', label: words };
}

/** The calm legend's entries. @param {{ calmLegendLogged: string, calmLegendQuiet: string, calmLegendPaused: string }} s */
export const calmLegend = (s) =>
    /** @type {{ tone: CalendarTone, label: string }[]} */ ([
        { tone: 'logged', label: s.calmLegendLogged },
        { tone: 'quiet', label: s.calmLegendQuiet },
        { tone: 'paused', label: s.calmLegendPaused },
    ]);

/** @param {import('./controller.js').CalendarController} c @param {string} iso @param {string} today @returns {CalendarDay} */
export function dayFor(c, iso, today) {
    if (isCalmTones(c.el) && c.el.getAttribute('data-kp-calm-map') !== 'none') return calmDayFor(c, iso, today);
    const s = c.strings;
    if (c.state === 'loading') return { tone: 'loading', label: s.calendarLoading };
    if (c.state === 'empty') return { tone: 'muted', label: c.stateLine.textContent || s.calendarUnknown };
    if (c.state === 'error') return { tone: 'none', label: c.stateLine.textContent || s.calendarUnknown };
    const given = c.days[iso];
    if (given) return given;
    if (iso > today) return { tone: 'future', label: s.calendarFuture };
    return { tone: 'none', label: s.calendarUnknown };
}
