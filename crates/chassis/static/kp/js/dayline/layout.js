// The arithmetic of the day timeline [parts-1102]: clock words, the minute a time stands at in a day that starts at a given
// hour, and the lanes of the items that overlap. Pure: nothing here touches the page.

import { LONG_PRESS_MS } from '../row-select/rows.js';
import { DAY_MINUTES, DEFAULT_STEP, MIN_DRAWN_MINUTES } from './constants.js';

/** @typedef {import('./constants.js').DaylineItem} DaylineItem */
/** @typedef {import('./constants.js').Placed} Placed */

/** `HH:MM` → minutes after midnight, or null. @param {string | null | undefined} text @returns {number | null} */
export function toMinutes(text) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(text ?? '');
    if (!m) return null;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** Minutes after midnight (wrapped into one day) → `HH:MM`. @param {number} minutes */
export function clockOf(minutes) {
    const m = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** The minute of the day timeline a clock time stands at, 0 at the day's start hour. @param {number} clock @param {number} startHour */
export const dayMinute = (clock, startHour) => (((clock - startHour * 60) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

/** The clock time of a minute of the day timeline. @param {number} minute @param {number} startHour */
export const clockAt = (minute, startHour) => clockOf(startHour * 60 + minute);

/** A whole number in a range, or the fallback. @param {string | null} text @param {number} min @param {number} max @param {number} fallback */
export function intIn(text, min, max, fallback) {
    const n = Number.parseInt(text ?? '', 10);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** The step: a divisor of 60 between 5 and 60, else the default. @param {string | null} text */
export function stepOf(text) {
    const n = intIn(text, 5, 60, DEFAULT_STEP);
    return 60 % n === 0 ? n : DEFAULT_STEP;
}

/** The longest hold a page may ask for [ms]: past it a finger would wait so long it reads as broken. */
const HOLD_MAX_MS = 2000;

/**
 * The hold time, read as a time in any unit (`350ms`, `0.4s`, `350` as milliseconds, `0.01m`), from 0 (a finger lifts at once:
 * a page whose day does not scroll) to 2 s; anything else is the package's long press, 500 ms.
 * @param {string | null} text
 */
export function holdOf(text) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m)?\s*$/i.exec(text ?? '');
    if (!m) return LONG_PRESS_MS;
    const unit = (m[2] ?? 'ms').toLowerCase();
    const ms = Number(m[1]) * (unit === 'm' ? 60_000 : unit === 's' ? 1000 : 1);
    return ms <= HOLD_MAX_MS ? Math.round(ms) : LONG_PRESS_MS;
}

/**
 * Place every timed item on the grid of `rowsTotal` rows of `step` minutes, and give the items that overlap their lanes.
 * @param {readonly DaylineItem[]} items @param {{ startHour: number, step: number, rowsTotal: number }} grid
 * @returns {Placed[]}
 */
export function placeItems(items, { startHour, step, rowsTotal }) {
    const minRows = Math.max(1, Math.ceil(MIN_DRAWN_MINUTES / step));
    /** @type {Placed[]} */
    const placed = [];
    for (const item of items) {
        const clock = toMinutes(item.start);
        if (clock === null || item.allDay) continue;
        const at = dayMinute(clock, startHour);
        if (at / step >= rowsTotal) continue;
        const row = Math.min(rowsTotal - 1, Math.round(at / step));
        const minutes = Math.max(1, Math.round(item.minutes ?? step));
        const rows = Math.min(rowsTotal - row, Math.max(minRows, Math.round(minutes / step)));
        placed.push({ item, at, minutes, row, rows, lane: 0, lanes: 1 });
    }
    placed.sort((a, b) => a.row - b.row || b.rows - a.rows);
    return packLanes(placed);
}

/** Give each cluster of overlapping items the first lane free at each item's row, and the cluster its lane count. @param {Placed[]} placed */
function packLanes(placed) {
    /** @type {Placed[]} */
    let cluster = [];
    let clusterEnd = -1;
    const close = () => {
        /** @type {number[]} */
        const laneEnds = [];
        for (const p of cluster) {
            const free = laneEnds.findIndex((end) => end <= p.row);
            p.lane = free === -1 ? laneEnds.length : free;
            laneEnds[p.lane] = p.row + p.rows;
        }
        for (const p of cluster) p.lanes = laneEnds.length;
    };
    for (const p of placed) {
        if (p.row >= clusterEnd && cluster.length) {
            close();
            cluster = [];
        }
        cluster.push(p);
        clusterEnd = Math.max(clusterEnd, p.row + p.rows);
    }
    if (cluster.length) close();
    return placed;
}
