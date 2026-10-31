// Pure unit maths: rounding, parsing and snapping a value to the sequencer's unit.
import { EPS, SEQUENCER_UNITS } from './constants.js';

/**
 * @typedef {'second' | 'minute' | 'hour' | 'day' | 'week'} SequencerUnit
 * @typedef {'refuse' | 'push' | 'allow'} SequencerOverlap
 * @typedef {object} SequencerItem
 * @property {string} id what the page calls the item
 * @property {string} lane the lane's id
 * @property {string} label what it is, one line
 * @property {number} start where it begins, in the unit
 * @property {number} duration how long it takes, in the unit
 * @property {string | null} [with] the id of the item it starts together with ("runs alongside")
 * @property {1 | 2 | 3 | 4 | 5} [series] its colour (default: the lane's)
 * @property {string} [detail] more words about the item, kept for the page (not drawn)
 * @property {boolean} [locked] cannot be moved or resized
 * @typedef {{ id: string, label: string }} SequencerLane
 * @typedef {{ id: string, lane: string, start: number, duration: number, with: string | null }} SequencerChangeItem
 * @typedef {'unknown' | 'locked' | 'overlap' | 'edge' | 'lane' | 'cycle'} SequencerRefusal
 * @typedef {{ ok: boolean, items: SequencerItem[], changed: string[], pushed: string[], reason: SequencerRefusal | null, blocker: string | null }} SequencerPlan
 * @typedef {{ id: string, kind: 'move' | 'resize-start' | 'resize-end', start?: number, end?: number, lane?: string }} SequencerEdit
 * @typedef {object} SequencerOptions
 * @property {number} [step] the snap step (default 1)
 * @property {SequencerOverlap} [overlap] default `refuse`
 * @property {boolean} [edges] snap to the edges of other items (default true)
 * @property {number} [reach] how far an edge pulls, in the unit (default 0)
 * @property {boolean} [laneMove] items may change lane (default true)
 * @property {readonly string[] | null} [lanes] the lane ids in order, to refuse an unknown lane and to step through them
 * @property {number} [max] the window's end: an edit does not push the end of what it moves past it (default none)
 * @property {boolean} [strict] a move that changes nothing because it was clamped is refused (`edge`), for the keyboard
 * @typedef {{ kind: 'move' | 'resize-start' | 'resize-end', by: number } | { kind: 'lane', by: number } | { kind: 'drop' } | { kind: 'cancel' }} SequencerKeyAction
 * @typedef {'loading' | 'ready' | 'empty' | 'error'} SequencerState
 * @typedef {import('../strings.js').Strings} Strings
 * @typedef {object} SequencerAttachOptions
 * @property {Partial<Strings>} [strings] any of the dictionary's words, for these sequencers only
 */

/** @param {number} n */
export const round = (n) => Math.round(n * 1e6) / 1e6;
/** @param {unknown} v @param {number} fallback */
export const num = (v, fallback = 0) =>
    typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : fallback;
/**
 * The unit a word names: `minute`, `min`, `m`, `hours`, `d` … null when it names none.
 * @param {unknown} word
 * @returns {{ name: SequencerUnit, seconds: number } | null}
 */
export function sequencerUnit(word) {
    /** @type {Record<string, SequencerUnit>} */
    const names = {
        s: 'second',
        sec: 'second',
        secs: 'second',
        second: 'second',
        seconds: 'second',
        m: 'minute',
        min: 'minute',
        mins: 'minute',
        minute: 'minute',
        minutes: 'minute',
        h: 'hour',
        hr: 'hour',
        hrs: 'hour',
        hour: 'hour',
        hours: 'hour',
        d: 'day',
        day: 'day',
        days: 'day',
        w: 'week',
        wk: 'week',
        wks: 'week',
        week: 'week',
        weeks: 'week',
    };
    const name =
        names[
            String(word ?? '')
                .trim()
                .toLowerCase()
        ];
    return name ? { name, seconds: SEQUENCER_UNITS[name] } : null;
}
/**
 * Snap a value to the grid of `step`, or to the nearest of `candidates` (the edges of other items) when one is within `reach`.
 * @param {number} value
 * @param {number} step
 * @param {readonly number[]} [candidates]
 * @param {number} [reach]
 * @returns {number}
 */
export function sequencerSnap(value, step, candidates = [], reach = 0) {
    /** @type {{ c: number, d: number } | null} */
    let best = null;
    for (const c of candidates) {
        const d = Math.abs(c - value);
        if (d <= reach + EPS && (best === null || d < best.d)) best = { c, d };
    }
    if (best) return round(best.c);
    return step > 0 ? round(Math.round(value / step + EPS) * step) : round(value);
}
/**
 * The next grid line from a value: `by` steps (negative: back), always on the grid, so a value off the grid lands on it first.
 * @param {number} value @param {number} by @param {number} step
 */
export function stepFrom(value, by, step) {
    const k = Math.round(by / step);
    return round((k > 0 ? Math.floor(value / step + EPS) + k : Math.ceil(value / step - EPS) + k) * step);
}
