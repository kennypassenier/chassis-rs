// Reads a root's `data-kp-time-*` options, and the entries and presets they describe.

import { DEFAULT_NEAR_WIDTH, DEFAULT_STEP, MINUTES_PER_DAY, MINUTES_PER_HOUR, TIME_STEPS } from './constants.js';
import { timeInWindow, timeMinutes, timeText } from './parse.js';

/** @typedef {import('./constants.js').TimePreset} TimePreset */
/** @typedef {import('./constants.js').TimeEntry} TimeEntry */

/** @param {HTMLElement} root @param {string} name @param {string} fallback */
export const attr = (root, name, fallback) => root.getAttribute(`data-kp-time-${name}`) ?? fallback;

/** The step of the keys and the list. @param {HTMLElement} root */
export const stepOf = (root) => {
    const n = Number(attr(root, 'step', String(DEFAULT_STEP)));
    return TIME_STEPS.includes(n) ? n : DEFAULT_STEP;
};

/** Whether the field carries seconds. @param {HTMLElement} root */
export const hasSeconds = (root) => root.hasAttribute('data-kp-time-seconds');

/** The presets written in `data-kp-time-presets`. @param {HTMLElement} root @returns {TimePreset[]} */
export function presetsFromAttribute(root) {
    const raw = attr(root, 'presets', '');
    if (!raw) return [];
    return raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const [a, b] = part.split('=');
            return b === undefined ? { label: a, value: a } : { label: a, value: b };
        })
        .filter((p) => /^\d{2}:\d{2}/.test(p.value));
}

/** The entries of the list: Clear, Now, and every time of the step inside the window. @param {HTMLElement} root @returns {TimeEntry[]} */
export function entries(root) {
    const step = stepOf(root);
    const min = root.getAttribute('data-kp-time-min');
    const max = root.getAttribute('data-kp-time-max');
    /** @type {TimeEntry[]} */
    const out = [];
    if (root.hasAttribute('data-kp-time-clear')) out.push({ value: '', kind: 'clear' });
    if (root.hasAttribute('data-kp-time-now')) {
        const d = new Date();
        out.push({ value: timeText(d.getHours() * MINUTES_PER_HOUR + d.getMinutes(), hasSeconds(root)), kind: 'now' });
    }
    for (let m = 0; m < MINUTES_PER_DAY; m += step) {
        const value = timeText(m, hasSeconds(root));
        if ((min || max) && !timeInWindow(value, min, max)) continue;
        out.push({ value, kind: 'time' });
    }
    return out;
}

/** The busy moment a time is near, if any. @param {HTMLElement} root @param {string} value @returns {string | null} */
export function nearOf(root, value) {
    const list = (root.getAttribute('data-kp-time-near') ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    if (!list.length) return null;
    const width = Number(root.getAttribute('data-kp-time-near-width') ?? String(DEFAULT_NEAR_WIDTH)) || DEFAULT_NEAR_WIDTH;
    const t = timeMinutes(value);
    for (const busy of list) {
        const b = timeMinutes(busy);
        const d = Math.min(Math.abs(t - b), MINUTES_PER_DAY - Math.abs(t - b));
        if (d <= width) return busy;
    }
    return null;
}
