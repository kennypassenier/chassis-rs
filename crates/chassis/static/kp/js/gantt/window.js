// The visible time window: fitting, resting and the rest state.
import { make, toMs } from './constants.js';
import { rel } from './scale.js';
/** @typedef {import('./constants.js').GanttBar} GanttBar */
/** @typedef {import('./constants.js').GanttLaneModel} GanttLaneModel */
/** @typedef {import('./constants.js').GanttModel} GanttModel */
/** @typedef {import('./constants.js').GanttRun} GanttRun */

/**
 * Fit the window to everything the timeline holds and now [kpadopt4]: a margin of a twentieth on each side, at least an hour.
 * @param {GanttModel} c
 */
export function fitWindow(c) {
    if (!c.fit) return;
    const moments = [c.now()];
    for (const run of c.runs) {
        const start = toMs(run.start);
        if (Number.isFinite(start)) moments.push(start);
        const end = run.end == null ? Number.NaN : toMs(run.end);
        if (Number.isFinite(end)) moments.push(end);
    }
    for (const point of c.points) {
        const at = toMs(point.at);
        if (Number.isFinite(at)) moments.push(at);
    }
    for (const zone of c.zones) for (const edge of [toMs(zone.from), toMs(zone.to)]) if (Number.isFinite(edge)) moments.push(edge);
    const lo = Math.min(...moments) / 1000;
    const hi = Math.max(...moments) / 1000;
    // A timeline of moments reads in days: it never fits to less than a week.
    const span = Math.max(c.el.hasAttribute('data-kp-gantt-points') ? 604_800 : 3600, hi - lo);
    const pad = span / 20;
    c.span = span + 2 * pad;
    c.to = hi - c.base + pad;
    c.live = false;
}
/** The window now: its edges in relative seconds. @param {GanttModel} c */
export function windowOf(c) {
    const now = rel(c, c.now());
    // A live window reaches far enough after now to hold the planned remainder of a running bar, but never more than 40% of the range [wish-1028].
    let lead = Math.max(30, c.span * 0.03);
    if (c.live && restOn(c))
        for (const run of c.runs) {
            const planned = restEnd(c, run);
            if (planned !== null) lead = Math.max(lead, Math.min(planned - now, c.span * 0.4));
        }
    const end = c.live ? now + lead : c.to;
    return { from: end - c.span, end, now };
}
/** The planned remainder of running bars is drawn unless `data-kp-gantt-rest="off"` [wish-1028]. @param {GanttModel} c */
const restOn = (c) => c.el.getAttribute('data-kp-gantt-rest') !== 'off';
/**
 * Where a running run's planned remainder ends, in seconds from the base, or null: it needs state `running`, a `plannedEnd` that
 * reads as a time, and the option on [wish-1028].
 * @param {GanttModel} c @param {GanttRun} run
 */
export function restEnd(c, run) {
    if (run.state !== 'running' || run.plannedEnd == null || !restOn(c)) return null;
    const ms = toMs(run.plannedEnd);
    return Number.isFinite(ms) ? rel(c, ms) : null;
}
/** The planned-remainder stretch of a running bar. @type {WeakMap<HTMLElement, HTMLElement>} */
export const RESTS = new WeakMap();
/**
 * Draw (or take away) the remainder a running bar still has: a stretch from now to the planned end, in its lane, on the bar's row.
 * @param {GanttModel} c @param {GanttLaneModel} lane @param {GanttBar} b
 */
export function syncRest(c, lane, b) {
    const end = restEnd(c, b.run);
    let rest = RESTS.get(b.bar);
    if (end === null) {
        rest?.remove();
        RESTS.delete(b.bar);
        return;
    }
    if (!rest) {
        rest = make(c.el.ownerDocument, 'span', 'kp-gantt__rest');
        rest.setAttribute('aria-hidden', 'true');
        rest.dataset.kpState = 'planned';
        RESTS.set(b.bar, rest);
    }
    if (rest.parentElement !== lane.track) lane.track.append(rest);
    if (b.run.series) rest.dataset.kpSeries = String(b.run.series);
    else delete rest.dataset.kpSeries;
    rest.style.setProperty('--kp-g-row', String(b.row));
    rest.style.setProperty('--kp-g-e', end.toFixed(2));
}
