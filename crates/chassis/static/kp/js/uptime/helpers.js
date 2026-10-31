// Small helpers: tone and word of a period, the count and element makers.
import { getStrings } from '../strings.js';
import { isCalmTones, calmWord } from '../calm-tones.js';
import { UPTIME_COUNT } from './constants.js';

/**
 * A period's tone in the strip's vocabulary: with `data-kp-tones="calm"` (js/calm-tones.js) `up` and `degraded` are logged,
 * `down` is quiet (the tooltip says "nothing logged", never "down") and `none` stays none [kpadopt6]. Pure.
 * @param {Element} el @param {string} state
 */
export const toneFor = (el, state) => (isCalmTones(el) ? (state === 'down' ? 'quiet' : state === 'none' ? 'none' : 'logged') : state);

/** The words of a tone. @param {Element} el @param {string} tone */
export const wordFor = (el, tone) => (isCalmTones(el) ? calmWord(tone) : null) ?? getStrings().uptimeStateWord(/** @type {any} */ (tone));

/** @param {HTMLElement} el @returns {number} */
export const countOf = (el) => {
    const n = Number.parseInt(el.dataset.kpUptimeCount ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : UPTIME_COUNT;
};

/** @param {HTMLElement} el @param {string} tag @param {string} [className] */
export const make = (el, tag, className) => {
    const node = el.ownerDocument.createElement(tag);
    if (className) node.className = className;
    return node;
};
