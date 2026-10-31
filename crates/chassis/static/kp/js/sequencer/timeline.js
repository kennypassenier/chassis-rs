// Pure timeline maths: rows, total, visible window, ticks and zoom.
import { EPS, HEADROOM, SEQUENCER_ZOOM_MAX, SEQUENCER_ZOOM_MIN, TICK_STEPS } from './constants.js';
import { round } from './units.js';
/** @typedef {import('./units.js').SequencerItem} SequencerItem */

/**
 * A row of its lane for every item: the first where nothing in the way. Items that do not overlap all take row 0.
 * @param {readonly SequencerItem[]} items @param {readonly string[]} laneIds
 * @returns {{ rows: Map<string, number>, counts: Map<string, number> }}
 */
export function sequencerRows(items, laneIds) {
    /** @type {Map<string, number>} */
    const rows = new Map();
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const lane of laneIds) {
        const inLane = items.filter((i) => i.lane === lane).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
        /** @type {number[]} */
        const ends = [];
        for (const item of inLane) {
            let row = ends.findIndex((end) => end <= item.start + EPS);
            if (row < 0) {
                row = ends.length;
                ends.push(0);
            }
            ends[row] = item.start + item.duration;
            rows.set(item.id, row);
        }
        counts.set(lane, Math.max(1, ends.length));
    }
    return { rows, counts };
}
/** The end of the last item, 0 when there is none. @param {readonly SequencerItem[]} items */
export function sequencerTotalOf(items) {
    return round(items.reduce((end, i) => Math.max(end, i.start + i.duration), 0));
}
/**
 * The window that holds a plan: the longest of `minSpan` and the plan with some room, rounded up to a whole step.
 * @param {number} total @param {number} minSpan @param {number} step
 */
export function sequencerWindow(total, minSpan, step) {
    const s = step > 0 ? step : 1;
    const want = Math.max(minSpan, total + Math.max(total * HEADROOM, s * 2));
    return Math.max(s, round(Math.ceil(want / s - EPS) * s));
}
/**
 * The axis ticks of a window `span` long (in the unit) drawn `room` px wide: the step (in the unit) and the values.
 * @param {number} span @param {number} room @param {number} unitSeconds @param {number} [gap] the px a label needs
 * @returns {{ step: number, values: number[] }}
 */
export function sequencerTicks(span, room, unitSeconds, gap = 72) {
    const most = Math.max(2, Math.floor(room / gap));
    const seconds = TICK_STEPS.find((s) => (span * unitSeconds) / s <= most) ?? /** @type {number} */ (TICK_STEPS[TICK_STEPS.length - 1]);
    const step = seconds / unitSeconds;
    /** @type {number[]} */
    const values = [];
    for (let k = 0; k * step <= span + EPS && values.length < 400; k += 1) values.push(round(k * step));
    return { step, values };
}
/** A zoom kept inside the limits, to the hundredth. @param {number} zoom */
export function sequencerClampZoom(zoom) {
    return Math.round(Math.min(SEQUENCER_ZOOM_MAX, Math.max(SEQUENCER_ZOOM_MIN, Number.isFinite(zoom) ? zoom : 1)) * 100) / 100;
}
