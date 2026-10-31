// Pure time-of-day helpers: reading what was typed, minutes and text, stepping past midnight, and the window test.

import { MINUTES_PER_DAY, MINUTES_PER_HOUR } from './constants.js';

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * Read what a person typed or pasted as a time of day.
 * @param {string} text
 * @param {{ seconds?: boolean }} [options]
 * @returns {{ value: string, converted: boolean } | null} the time as `HH:MM`, and whether it was written in 12 hours; null when it is not a time
 */
export function parseTimeOfDay(text, { seconds = false } = {}) {
    const raw = text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (raw === '') return null;
    let m = /^(\d{1,2})(?:[:.h](\d{2}))?(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/.exec(raw);
    /** @type {[number, number, number]} */
    let hms;
    let converted = false;
    if (m) {
        let h = Number(m[1]);
        if (h < 1 || h > 12) return null;
        const pm = m[4].startsWith('p');
        if (h === 12) h = 0;
        hms = [pm ? h + 12 : h, Number(m[2] ?? 0), Number(m[3] ?? 0)];
        converted = true;
    } else if ((m = /^(\d{1,2})[:.h](\d{2})(?::(\d{2}))?$/.exec(raw))) hms = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
    else if ((m = /^(\d{1,2})h$/.exec(raw))) hms = [Number(m[1]), 0, 0];
    else if ((m = /^(\d{1,2})(\d{2})$/.exec(raw))) hms = [Number(m[1]), Number(m[2]), 0];
    else if ((m = /^(\d{1,2})$/.exec(raw))) hms = [Number(m[1]), 0, 0];
    else return null;
    if (hms[0] > 23 || hms[1] > 59 || hms[2] > 59) return null;
    const value = `${pad(hms[0])}:${pad(hms[1])}${seconds ? `:${pad(hms[2])}` : ''}`;
    return { value, converted };
}

/** @param {string} value `HH:MM` or `HH:MM:SS` @returns {number} minutes since midnight */
export function timeMinutes(value) {
    const m = /^(\d{2}):(\d{2})/.exec(value);
    return m ? Number(m[1]) * MINUTES_PER_HOUR + Number(m[2]) : Number.NaN;
}

/** @param {number} minutes @param {boolean} [seconds] */
export function timeText(minutes, seconds = false) {
    const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return `${pad(Math.floor(wrapped / MINUTES_PER_HOUR))}:${pad(wrapped % MINUTES_PER_HOUR)}${seconds ? ':00' : ''}`;
}

/**
 * Step a time: up or down by `step` minutes, wrapping past midnight.
 * @param {string} value `HH:MM` or empty @param {number} delta steps (negative goes back) @param {number} step minutes
 * @returns {{ value: string, wrapped: boolean }}
 */
export function stepTime(value, delta, step) {
    const now = timeMinutes(value);
    if (Number.isNaN(now)) return { value: timeText(delta > 0 ? 0 : MINUTES_PER_DAY - step), wrapped: false };
    // Off the grid, the first step goes to the next grid time (03:07 up is 03:10), then on from there.
    const to =
        now % step === 0
            ? now + delta * step
            : delta > 0
              ? Math.ceil(now / step) * step + (delta - 1) * step
              : Math.floor(now / step) * step + (delta + 1) * step;
    return { value: timeText(to), wrapped: to < 0 || to >= MINUTES_PER_DAY };
}

/** Whether a time is inside the window; a min later than the max wraps midnight. @param {string} value @param {string | null} min @param {string | null} max */
export function timeInWindow(value, min, max) {
    const t = timeMinutes(value);
    const a = min ? timeMinutes(min) : Number.NaN;
    const b = max ? timeMinutes(max) : Number.NaN;
    if (Number.isNaN(t)) return false;
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (Number.isNaN(a)) return t <= b;
    if (Number.isNaN(b)) return t >= a;
    return a <= b ? t >= a && t <= b : t >= a || t <= b;
}
