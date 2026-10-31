// The model of one week agenda before it is built: every part points at the element until build() lays the real ones.
import { CHART_TIME_ZONE } from '../chart.js';
import { dayKey } from '../calendar.js';
import { resolveLocale } from '../locale.js';
import { resolveStrings } from '../strings.js';
/** @typedef {import('./types.js').WeekModel} WeekModel */
/** @typedef {import('./types.js').WeekOptions} WeekOptions */

/** The most days an agenda shows. */
const MAX_DAYS = 14;
/** The days an agenda shows when `data-kp-week-days` does not say: one week. */
const DEFAULT_DAYS = 7;
/** The most items an upcoming list holds. */
const MAX_UPCOMING = 50;

/**
 * @param {HTMLElement} el
 * @param {WeekOptions} options
 * @returns {WeekModel}
 */
export function newModel(el, options) {
    const zone = options.timeZone ?? el.dataset.kpTimeZone ?? CHART_TIME_ZONE;
    const now = options.now ?? (() => Date.now());
    const days = Math.min(MAX_DAYS, Math.max(1, Number(el.dataset.kpWeekDays) || DEFAULT_DAYS));
    return {
        el,
        zone,
        locale: resolveLocale(options.locale ?? el.dataset.kpLocale, el),
        now,
        strings: resolveStrings(options.strings),
        ...(options.decorate ? { decorate: options.decorate } : {}),
        start: el.dataset.kpWeekStart ?? dayKey(now(), zone),
        days,
        events: [],
        state: 'ready',
        active: null,
        grid: el,
        axis: el,
        cols: [],
        frame: el,
        busy: null,
        leaving: null,
        held: null,
        stateLine: el,
        plate: el,
        plateKey: '',
        plateText: '',
        plateArt: null,
        title: null,
        today: null,
        motion: { gone: false, stop: null, asked: false },
        legend: el,
        pills: new Map(),
        timer: 0,
        observer: null,
        mode: 'grid',
        upcoming: {
            n: Math.max(0, Math.min(MAX_UPCOMING, Number.parseInt(el.dataset.kpWeekUpcoming ?? '', 10) || 0)),
            on: false,
            list: null,
            rows: new Map(),
            items: [],
        },
    };
}
