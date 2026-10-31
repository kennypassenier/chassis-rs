// The content of one period's quick info: title, state, exact figures, the page's details and a link.
import { getStrings } from '../strings.js';
import { UPTIME_STATES } from './constants.js';
import { uptimePercent } from './figures.js';
import { make, toneFor, wordFor } from './helpers.js';
/** @typedef {import('./types.js').UptimePeriod} UptimePeriod */

/**
 * The period's exact figures as a paragraph, or nothing when the page measured neither the share nor the incidents.
 * @param {HTMLElement} el @param {UptimePeriod} period
 * @returns {HTMLElement | null}
 */
function figuresOf(el, period) {
    const percent = typeof period.uptime === 'number' && Number.isFinite(period.uptime) ? uptimePercent(period.uptime) : null;
    const incidents = typeof period.incidents === 'number' && period.incidents >= 0 ? Math.floor(period.incidents) : null;
    if (percent === null && incidents === null) return null;
    const figures = make(el, 'p', 'kp-uptime__info-figures');
    figures.textContent = getStrings().uptimeInfoFigures(percent, incidents);
    return figures;
}

/**
 * The state line: the tone's swatch and its word.
 * @param {HTMLElement} el @param {UptimePeriod} period
 * @returns {HTMLElement}
 */
function stateOf(el, period) {
    const tone = toneFor(el, UPTIME_STATES.includes(period.state) ? period.state : 'none');
    const state = make(el, 'p', 'kp-uptime__info-state');
    const swatch = make(el, 'span', 'kp-uptime__swatch');
    swatch.dataset.kpTone = tone;
    swatch.setAttribute('aria-hidden', 'true');
    const word = make(el, 'span');
    word.textContent = wordFor(el, tone);
    state.append(swatch, word);
    return state;
}

/**
 * The page's detail lines and the link to the period's own page, as far as the period has them.
 * @param {HTMLElement} el @param {UptimePeriod} period
 * @returns {HTMLElement[]}
 */
function extrasOf(el, period) {
    const parts = [];
    if (period.details?.length) {
        const list = make(el, 'ul', 'kp-uptime__info-details');
        for (const line of period.details) list.append(Object.assign(make(el, 'li'), { textContent: line }));
        parts.push(list);
    }
    if (period.href) {
        const link = /** @type {HTMLAnchorElement} */ (make(el, 'a', 'kp-button kp-button--sm kp-uptime__info-link'));
        link.href = period.href;
        link.textContent = getStrings().uptimeOpen(period.label);
        parts.push(link);
    }
    return parts;
}

/**
 * Fill the quick-info box of a strip with one period.
 * @param {HTMLElement} el @param {HTMLElement} box @param {UptimePeriod} period
 */
export function fillPanel(el, box, period) {
    const title = make(el, 'p', 'kp-uptime__info-title');
    title.id = `${box.id}-title`;
    title.textContent = period.label;
    const parts = [title, stateOf(el, period)];
    const figures = figuresOf(el, period);
    if (figures) parts.push(figures);
    parts.push(...extrasOf(el, period));
    box.setAttribute('aria-labelledby', title.id);
    box.replaceChildren(...parts);
}
