// Pure scale helpers: range seconds, axis step, lane row packing and clock words.
import { dayKey, formatDayKey } from '../calendar.js';
import { wallTime } from '../chart.js';
import { GANTT_STEPS, two } from './constants.js';
/** @typedef {import('./constants.js').GanttModel} GanttModel */
/** @typedef {import('./constants.js').GanttRunState} GanttRunState */

/**
 * The seconds a range word names: `90m`, `6h`, `24h`, `7d`. NaN when it names nothing.
 * @param {string} word
 * @returns {number}
 */
export function rangeSeconds(word) {
    const m = /^(\d+(?:\.\d+)?)\s*(m|h|d)$/.exec(word.trim());
    if (!m) return Number.NaN;
    return Number(m[1]) * { m: 60, h: 3600, d: 86_400 }[/** @type {'m' | 'h' | 'd'} */ (m[2])];
}
/**
 * The step an axis of `span` seconds and `room` px uses: the smallest of
 * GANTT_STEPS that leaves a label at least `gap` px of its own.
 * @param {number} span
 * @param {number} room
 * @param {number} [gap]
 * @returns {number}
 */
export function axisStep(span, room, gap = 72) {
    const most = Math.max(2, Math.floor(room / gap));
    return GANTT_STEPS.find((step) => span / step <= most) ?? /** @type {number} */ (GANTT_STEPS[GANTT_STEPS.length - 1]);
}
/**
 * Give every run a row of its lane: the row it had when it is still free,
 * else the first free one. A run that is not ended (`e` null) is in the way
 * until the end of time, so a growing run never lands on a later one.
 *
 * @param {{ id: string, s: number, e: number | null }[]} runs in any order, seconds
 * @param {Map<string, number>} [before] the rows the runs had
 * @param {number} [pad] the seconds two runs keep between them
 * @param {{ s: number, e: number }[]} [fixed] stretches of the first row that are taken (the marks of a lane's points, as
 *   wide as they are drawn): a run keeps the same gap from them as from another run [hlthree-1019 gantt-points]
 * @returns {{ rows: Map<string, number>, count: number }}
 */
export function packRows(runs, before = new Map(), pad = 0, fixed = []) {
    const sorted = [...runs].sort((a, b) => a.s - b.s);
    /** @type {{ s: number, e: number }[][]} */
    const rows = fixed.length > 0 ? [fixed.map((f) => ({ s: f.s, e: f.e }))] : [];
    /** @type {Map<string, number>} */
    const given = new Map();
    const free = (/** @type {number} */ row, /** @type {{ s: number, e: number | null }} */ run) =>
        (rows[row] ?? []).every((other) => run.s >= other.e + pad || (run.e ?? Infinity) + pad <= other.s);
    for (const run of sorted) {
        const wanted = before.get(run.id);
        let row = wanted !== undefined && free(wanted, run) ? wanted : -1;
        if (row < 0) {
            row = 0;
            while (!free(row, run)) row += 1;
        }
        (rows[row] ??= []).push({ s: run.s, e: run.e ?? Infinity });
        given.set(run.id, row);
    }
    return { rows: given, count: Math.max(1, rows.length) };
}
/** The wall-clock offset of `zone` from UTC at `ms`, in seconds. @param {number} ms @param {string} zone */
export function zoneOffset(ms, zone) {
    const w = wallTime(ms, zone);
    return (Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(ms / 60_000) * 60_000) / 1000;
}
/** @param {GanttModel} c @param {number} seconds */
export function duration(c, seconds) {
    return c.strings.ganttDuration(Math.max(0, Math.round(seconds)));
}
/** The clock time of a moment in the zone: `14:32`. @param {GanttModel} c @param {number} ms */
export function clock(c, ms) {
    const w = wallTime(ms, c.zone);
    return `${two(w.hour)}:${two(w.minute)}`;
}
/** The day and time of a moment: `17/10 14:32`. @param {GanttModel} c @param {number} ms */
export function stamp(c, ms) {
    return `${formatDayKey(dayKey(ms, c.zone)).slice(0, 5)} ${clock(c, ms)}`;
}
/** @param {GanttModel} c @param {GanttRunState} state */
export const stateWord = (c, state) =>
    ({
        queued: c.strings.ganttQueued,
        running: c.strings.ganttRunning,
        ok: c.strings.ganttOk,
        failed: c.strings.ganttFailed,
        planned: c.strings.ganttPlanned,
    })[state];
/** The seconds, relative to the base, of a moment. @param {GanttModel} c @param {number} ms */
export const rel = (c, ms) => ms / 1000 - c.base;
