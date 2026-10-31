// What a feed's option attributes say now, read each time so they switch at runtime, and the Brussels day key.

import { getStrings } from '../strings.js';
import { agoMoment } from '../freshness.js';
import { DEFAULT_DAY_LEVEL, MAX_DAY_LEVEL, MIN_DAY_LEVEL, MOMENT_DATE_LENGTH, OPTION_ATTRIBUTES } from './constants.js';

/** One option attribute's text, or ''. @param {HTMLElement} el @param {keyof typeof OPTION_ATTRIBUTES} name */
export const optionAttr = (el, name) => el.getAttribute(OPTION_ATTRIBUTES[name]) ?? '';

/**
 * The Brussels calendar day of a moment as a sortable key, `2026-10-19`.
 * @param {number} ms @param {string} zone
 */
export const dayKey = (ms, zone) => agoMoment(ms, zone).slice(0, MOMENT_DATE_LENGTH).split('/').reverse().join('-');

/** The app's word for a row, one and many: "operation,operations", default "event,events". @param {HTMLElement} el */
function unitOf(el) {
    const [one, many] = optionAttr(el, 'unit')
        .split(/[,/]/)
        .map((word) => word.trim());
    const s = getStrings();
    return { one: one || s.feedUnitOne, many: many || (one ? `${one}s` : s.feedUnitMany) };
}

/**
 * The options of a feed as its attributes say now.
 * @param {HTMLElement} el
 */
export function feedOptions(el) {
    const time = optionAttr(el, 'time');
    const actor = optionAttr(el, 'actor');
    const expand = optionAttr(el, 'expand');
    return {
        group: optionAttr(el, 'group') === 'none' ? 'none' : 'day',
        time: ['relative', 'clock', 'moment'].includes(time) ? time : 'auto',
        actor: actor === 'mark' || actor === 'off' ? actor : 'chip',
        expand: expand === 'one' || expand === 'off' ? expand : 'many',
        unit: unitOf(el),
        level: Math.min(MAX_DAY_LEVEL, Math.max(MIN_DAY_LEVEL, Number(optionAttr(el, 'level')) || DEFAULT_DAY_LEVEL)),
    };
}
