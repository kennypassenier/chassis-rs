// Reads a viewer: its tools, signature, limits, floor, query, announcement and text.
import { LOGVIEWER_MAX, LOG_LEVELS } from './constants.js';
import { clock, logLevel } from './levels.js';
import { attr, el, stateOf } from './model.js';
/** @typedef {import('./types.js').Kept} Kept */

/** @param {HTMLElement} root @returns {string[]} */
export function toolsOf(root) {
    return attr(root, 'tools', 'search,follow,wrap,time,level,copy,download')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
}

/** The options as one string, to know whether the rows must be drawn again. @param {HTMLElement} root */
export const signature = (root) =>
    ['max', 'wrap', 'time', 'level', 'search', 'search-only', 'tools', 'error', 'error-title'].map((n) => attr(root, n, '')).join('\u0001') +
    `\u0001${root.getAttribute('data-kp-state') ?? ''}`;

/** @param {HTMLElement} root @returns {HTMLElement} */
export const logOf = (root) => /** @type {HTMLElement} */ (root.querySelector('.kp-logviewer__log'));

/** @param {HTMLElement} root @returns {number} */
export const maxOf = (root) => Math.max(1, Math.floor(Number(attr(root, 'max', String(LOGVIEWER_MAX)))) || LOGVIEWER_MAX);

/** Lowest level index shown. @param {HTMLElement} root */
export const floorOf = (root) => Math.max(0, LOG_LEVELS.indexOf(logLevel(attr(root, 'level', 'debug'))));

/** @param {HTMLElement} root */
export const queryOf = (root) => attr(root, 'search', '').trim().toLowerCase();

/** @param {HTMLElement} root @param {string} message */
export function say(root, message) {
    if (root.getAttribute('data-kp-announce') === 'off') return;
    const st = stateOf(root);
    if (st.said === message) return;
    st.said = message;
    let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-logviewer__live'));
    if (!region) {
        region = el('kp-sr-only kp-logviewer__live', 'span');
        region.setAttribute('role', 'status');
        root.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

/** The text of one line as copied and downloaded. @param {Kept} line */
export const textOf = (line) => [clock(line.ts, true), line.source, line.level.toUpperCase(), line.message].filter(Boolean).join(' ');
