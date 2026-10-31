// Paints the runs as bars in their lanes and sizes the view.
import { hostStatePlate } from '../state-plate.js';
import { RESTS, fitWindow, syncRest } from './window.js';
import { GANTT_RETRY_EVENT, keyOf, make, toMs } from './constants.js';
import { packRows, rel, stateWord } from './scale.js';
import { MARK_GAP_PX, RUN_GAP_PX } from './labels.js';
import { fillLaneLabel, paintPoints } from './points.js';
import { paintChrome, paintKinds, paintZones } from './chrome.js';
import { drawBusy, paintGhosts } from './busy.js';
import { refresh, syncTabStops, visible } from './selection.js';
/** @typedef {import('./constants.js').GanttBar} GanttBar */
/** @typedef {import('./constants.js').GanttLane} GanttLane */
/** @typedef {import('./constants.js').GanttLaneModel} GanttLaneModel */
/** @typedef {import('./constants.js').GanttModel} GanttModel */

/** Everything the timeline shows, from the model. @param {GanttModel} c */
export function paint(c) {
    const doc = c.el.ownerDocument;
    const s = c.strings;
    const nowMs = c.now();
    fitWindow(c);
    /** @type {Map<string, GanttLane>} */
    const laneById = new Map(c.lanesGiven.map((l) => [l.id, l]));
    /** @type {Map<string, GanttBar[]>} */
    const byLane = new Map(c.lanesGiven.map((l) => [l.id, []]));
    const live = new Set();
    for (const run of c.runs) {
        const startMs = toMs(run.start);
        if (!Number.isFinite(startMs)) continue;
        if (!laneById.has(run.lane)) {
            const lane = { id: run.lane, label: run.lane };
            laneById.set(run.lane, lane);
            byLane.set(run.lane, []);
        }
        const open = run.state === 'running' || run.state === 'queued';
        const endRaw = open ? null : run.end == null || !Number.isFinite(toMs(run.end)) ? startMs : toMs(run.end);
        let bar = c.bars.get(run.id);
        if (!bar) {
            bar = make(doc, 'button', 'kp-gantt__run');
            bar.type = 'button';
            bar.append(make(doc, 'span', 'kp-gantt__label'));
            c.bars.set(run.id, bar);
            c.decorate?.(bar, { kind: 'bar', host: c.el, key: keyOf(c.el), id: run.id });
        }
        bar.dataset.kpId = run.id;
        bar.dataset.kpState = run.state;
        if (run.series) bar.dataset.kpSeries = String(run.series);
        else delete bar.dataset.kpSeries;
        live.add(run.id);
        const before = c.states.get(run.id);
        if (before && before !== run.state) c.announcer.textContent = s.ganttAnnounce(run.label, stateWord(c, run.state));
        c.states.set(run.id, run.state);
        const item = { run, s: rel(c, startMs), e: endRaw == null ? null : rel(c, Math.max(endRaw, startMs)), bar, row: 0 };
        byLane.get(run.lane)?.push(item);
    }
    for (const [id, bar] of c.bars)
        if (!live.has(id)) {
            RESTS.get(bar)?.remove();
            RESTS.delete(bar);
            bar.remove();
            c.bars.delete(id);
            c.states.delete(id);
        }
    // A lane a point names on its own, as a run's [kpadopt4].
    for (const point of c.points)
        if (!laneById.has(point.lane)) {
            laneById.set(point.lane, { id: point.lane, label: point.lane });
            byLane.set(point.lane, []);
        }
    // Lanes: build in the given order, then any a run named on its own.
    // Two runs of a row keep a gap in PIXELS, not in time: a run is never drawn narrower than `--kp-gantt-bar-min`, so a short run
    // reaches past its end by the rest of that width, and on a phone one second is a fraction of a pixel [hlcomp-1019 gantt-gap].
    // Packing counts that reach and the gap in the seconds one pixel stands for; positions stay laid by time.
    const room = c.plot.clientWidth;
    const perPx = room > 0 ? c.span / room : 0;
    const sample = c.bars.values().next().value;
    const minBar = (sample && Number.parseFloat(getComputedStyle(sample).minWidth)) || 8;
    const pad = Math.max(c.span * 0.006, RUN_GAP_PX * perPx);
    const reach = minBar * perPx;
    // The marks of a lane's points stand on its first row, as wide as they are drawn: a run never lies on one, it takes the next
    // row, so the mark and the run both stay at their moment [hlthree-1019 gantt-points].
    const markPx = (() => {
        const el = c.pointEls.values().next().value;
        const w = el ? Number.parseFloat(getComputedStyle(el, '::before').width) : Number.NaN;
        return Number.isFinite(w) && w > 0 ? w : 12;
    })();
    const markHalf = (markPx / 2 + MARK_GAP_PX) * perPx;
    /** @type {Map<string, { s: number, e: number }[]>} */
    const marksOf = new Map();
    for (const point of c.points) {
        const ms = toMs(point.at);
        if (!Number.isFinite(ms) || perPx === 0) continue;
        const at = rel(c, ms);
        const list = marksOf.get(point.lane) ?? [];
        list.push({ s: at - markHalf, e: at + markHalf });
        marksOf.set(point.lane, list);
    }
    const before = new Map(c.lanes.flatMap((l) => l.bars.map((b) => [b.run.id, b.row])));
    const old = new Map(c.lanes.map((l) => [l.lane.id, l]));
    /** @type {GanttLaneModel[]} */
    const lanes = [];
    for (const [id, lane] of laneById) {
        const bars = (byLane.get(id) ?? []).sort((a, b) => a.s - b.s);
        const packed = packRows(
            bars.map((b) => ({ id: b.run.id, s: b.s, e: b.e == null ? null : Math.max(b.e, b.s + reach) })),
            before,
            pad,
            marksOf.get(id) ?? [],
        );
        let model = old.get(id);
        if (!model) {
            const label = make(doc, 'div', 'kp-gantt__lane');
            const track = make(doc, 'div', 'kp-gantt__track');
            track.setAttribute('role', 'group');
            model = { lane, label, track, bars: [], points: [], rows: 1 };
        }
        model.lane = lane;
        fillLaneLabel(c, model.label, lane);
        model.track.setAttribute('aria-label', lane.label);
        // Rows never fewer while the window stays the same. A lane with a run still open reserves one spare row: the next start in it
        // overlaps that run, so the frame already has the room and does not grow when the start comes.
        const spare = bars.some((b) => b.e == null) ? 1 : 0;
        model.rows = Math.max(model.rows, packed.count + spare);
        for (const b of bars) b.row = packed.rows.get(b.run.id) ?? 0;
        model.bars = bars;
        lanes.push(model);
    }
    for (const gone of c.lanes)
        if (!lanes.includes(gone)) {
            gone.label.remove();
            gone.track.remove();
        }
    c.lanes = lanes;
    const anchor = c.plot;
    lanes.forEach((lane, i) => {
        lane.label.style.setProperty('grid-row', String(i + 2));
        lane.track.style.setProperty('grid-row', String(i + 2));
        lane.track.style.setProperty('--kp-g-rows', String(lane.rows));
        if (lane.label.parentElement !== c.body) c.body.insertBefore(lane.label, anchor);
        if (lane.track.parentElement !== c.body) c.body.insertBefore(lane.track, anchor);
        // Order in the document: the lane's bars in time order, then its points (only those are compared, so a zone or a
        // point in the track does not make every bar move, and a focused bar keeps its focus).
        const have = [...lane.track.querySelectorAll(':scope > .kp-gantt__run')];
        const want = lane.bars.map((b) => b.bar);
        if (want.length !== have.length || want.some((n, k) => n !== have[k])) lane.track.append(...want);
        for (const b of lane.bars) {
            b.bar.style.setProperty('--kp-g-row', String(b.row));
            b.bar.style.setProperty('--kp-g-s', b.s.toFixed(2));
            b.bar.style.setProperty('--kp-g-e', b.e == null ? 'var(--kp-g-now)' : b.e.toFixed(2));
            const label = /** @type {HTMLElement} */ (b.bar.firstElementChild);
            if (label.textContent !== b.run.label) label.textContent = b.run.label;
            syncRest(c, lane, b);
        }
    });
    c.body.style.setProperty('--kp-g-lanes', String(Math.max(1, lanes.length)));
    c.body.toggleAttribute(
        'data-kp-gantt-subs',
        lanes.some((l) => Boolean(l.lane.sub)),
    );
    paintPoints(c, lanes);
    paintZones(c, lanes);
    paintKinds(c);
    paintChrome(c);
    c.el.dataset.kpState = c.state;
    c.body.toggleAttribute('aria-busy', c.state === 'loading');
    drawBusy(c);
    const empty = c.state === 'ready' && c.runs.length === 0 && c.points.length === 0 && lanes.length === 0;
    const words =
        c.state === 'loading'
            ? s.ganttLoading
            : c.state === 'empty' || empty
              ? c.stateLine.dataset.kpWords || s.ganttEmpty
              : c.stateLine.dataset.kpWords || s.heatFailed;
    // A timeline of moments with nothing to show has no line for now running through its sentence [kpadopt4].
    c.nowLine.hidden = c.el.hasAttribute('data-kp-gantt-points') && (c.state === 'error' || c.state === 'empty' || empty);
    // An empty or failed plate is drawn at once, as a data table draws its own while its card leaves: there are no runs under the card
    // to hide, and waiting for the card's leave put a failed timeline's plate about 1.5 s behind its state [KIT22 16]. The runs still wait.
    const plateKind = c.state === 'error' || c.state === 'empty' || (c.state === 'ready' && empty) ? c.state : null;
    c.stateLine.textContent = c.state === 'loading' && c.leaving === null ? words : '';
    c.stateLine.dataset.kpState = empty && c.state === 'ready' ? 'empty' : c.state;
    // Rebuilt only when what it says changes, so the focus on its Retry survives a repaint.
    const plateKey = plateKind ? `${plateKind}|${words}|${c.plateText}` : '';
    if (c.plateKey !== plateKey) {
        c.plateKey = plateKey;
        c.plate.replaceChildren();
        if (plateKind)
            c.plate.append(
                hostStatePlate(c.el, {
                    kind: plateKind === 'error' ? 'error' : 'empty',
                    title: words,
                    ...(c.plateText ? { text: c.plateText } : {}),
                    art: c.plateArt,
                    retryEvent: GANTT_RETRY_EVENT,
                }),
            );
    }
    c.plate.hidden = plateKind === null;
    c.plate.dataset.kpState = plateKind ?? '';
    paintGhosts(c);
    c.busy?.place();
    holdHeight(c);
    visible(c);
    refresh(c, nowMs);
    syncTabStops(c);
}
/**
 * The scrolling viewport keeps the height it first had with data: a start that needs more rows than the lanes reserved scrolls
 * inside the frame instead of moving the page. A change the person asks for (range, Live, Zoom) or the page's own `loading`
 * releases it. @param {GanttModel} c
 */
export function holdHeight(c) {
    if (c.state !== 'ready' || c.lanes.length === 0) {
        c.body.style.removeProperty('--kp-g-view');
        return;
    }
    if (c.held === null) {
        c.scroll.style.removeProperty('block-size');
        c.held = viewHeight(c);
    }
    if (c.held > 0) {
        c.scroll.style.setProperty('block-size', `${c.held}px`);
        // The layers over the lanes are as tall as the viewport under the axis, no taller [r3r5-1019 gantt-frame].
        c.body.style.setProperty('--kp-g-view', `${Math.max(0, c.held - c.axis.offsetHeight)}px`);
    }
}
/**
 * The height the viewport holds: all the lanes when they fit under the frame's cap, else the whole lanes that do, so a lane is never
 * cut at the frame's edge and the rules and bands end where the last visible lane ends [r3r5-1019 gantt-frame].
 * @param {GanttModel} c
 */
function viewHeight(c) {
    const natural = c.scroll.getBoundingClientRect().height;
    if (c.scroll.scrollHeight <= c.scroll.clientHeight + 1) return natural;
    let fit = 0;
    for (const lane of c.lanes) {
        const bottom = lane.label.offsetTop + lane.label.offsetHeight;
        if (bottom > natural + 0.5) break;
        fit = bottom;
    }
    return fit > c.axis.offsetHeight ? fit : natural;
}
