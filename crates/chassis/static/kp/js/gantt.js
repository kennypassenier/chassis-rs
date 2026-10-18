// A run timeline: one bar per run on a time axis, running bars growing live
// [kpadopt-time; the admin dashboard's `ac-tl` on the Activity page].
//
// `section.kp-gantt[data-kp-gantt]` is filled by attachGantts(): a bar of
// range buttons (1 h, 6 h, 24 h, 7 d), a Live button and the selected
// range; below it the axis, one lane per job (or stack, or host) with its
// label on the left, the runs as bars in their lane, and a line for now.
// The page gives the lanes and the runs (setGanttRuns) and the state of the
// whole (setGanttState); the timeline paints them in place.
//
//   <section class="kp-gantt" data-kp-gantt data-kp-gantt-ranges="1h 6h 24h 7d" data-kp-gantt-range="6h"
//            aria-label="Operations of the last 6 hours"></section>
//
//   setGanttRuns(el, [
//       { id: 'r41', lane: 'backup', label: 'Backup photos', start: Date.now() - 3600e3, end: Date.now() - 3000e3, state: 'ok' },
//       { id: 'r42', lane: 'update', label: 'Update images', start: Date.now() - 600e3, state: 'running' },
//   ], [{ id: 'backup', label: 'Backups' }, { id: 'update', label: 'Updates' }]);
//
//   state    `queued` (a dashed, hollow bar from the moment it was queued to
//            now), `running` (a striped bar growing to now, a bright
//            leading edge), `ok` (a solid bar from start to end) and
//            `failed` (solid, taller than the others, with a cap at its end
//            and a cross where the bar is wide enough). The tone is never
//            the only carrier: the height, the cap, the stripes and the
//            dashes are, and so is the bar's name
//   live     a running or queued bar ends at now, whatever `end` says; one
//            custom property (`--kp-g-now`) moves every second and the
//            stylesheet places every bar from it, so the page repaints
//            nothing. While the window is Live its right edge follows now
//   range    the buttons set how much time the window shows; the window
//            ends a little after now while Live. Drag across the plot to
//            select a range (a click on a bar still opens it): the chip
//            shows it with Zoom (the window becomes the selection and stops
//            following now) and Clear. Live returns to following now
//   lanes    a run takes the first row of its lane where no other run is
//            in its way; a lane's rows never fewer while the window stays
//            the same, so a run finishing moves nothing. A lane with a run
//            still open reserves one spare row, and the frame keeps the
//            height it had with data: a start that needs more rows scrolls
//            inside the frame, the page never jumps. Only what a person
//            asks for (range, Live, Zoom) lays the lanes out again.
//            `data-kp-gantt-ghosts="2 3 2 1 1"` sets the rows of the
//            loading lanes, so loading and loaded are as tall
//   loading  the data table's own loading card (js/busy-card.js: the
//            theme's spinner and "Reading the history") stands centred
//            over the lanes, the toolbar, axis and lane names beside it;
//            the runs are drawn once it has left
//   chip     the selected range takes the toolbar row over (the range
//            buttons and Live are inert under it): it lies on no lane and
//            adds no height when it comes, at any width
//   keys     one tab stop: ← → move along a lane, ↑ ↓ to the nearest bar
//            of the neighbouring lane, Home and End to the lane's first and
//            last, Enter or Space opens; the range, Live, Zoom and Clear
//            are buttons
//   hover    the run's name, times, length and state in the page's one hover
//            card (js/hovercard.js), refreshed while a run grows
//   days     opt-in, `data-kp-gantt-days` [kpadopt3]: every day named on the
//            axis is a button (one tab stop, ← → Home End between them) that
//            selects that whole day, 00:00 to 00:00 in the zone, as a brush
//            would: the band, the chip with Zoom and Clear, and
//            `kp-gantt-select` with `source: 'day'` and `day` so the page can
//            jump to it. It is `aria-pressed` while that day is the selection;
//            pressed again it lifts it. A window too short to hold a midnight
//            names no day and has no button
//   series   opt-in [kpadopt3]: a run's `series` (1 to 5) inks a finished
//            run in `--chart-1` … `--chart-5` instead of the success colour,
//            a category (a nightly round, a kind of job); failed, running and
//            queued keep their own look, so the state still reads first.
//            setGanttLegend(el, [{ series, label }]) names the series after
//            the states in the legend
//   points   opt-in [kpadopt4]: setGanttPoints(el, points) puts moments, not
//            runs, in the lanes (applied, a call, a mail, a planned follow-up),
//            each a small mark in the colour and shape of its kind;
//            setGanttKinds(el, kinds) names the kinds in the legend (shape
//            `dot`, `diamond`, `square`, `triangle`, `ring`; a `series` 1 to
//            5 or a `tone`). A `planned` point is hollow. Marks closer than
//            the eye can tell apart become one mark with a count (`+2`) whose
//            card names them all. setGanttZones(el, zones) lays stretches
//            under them: a lane's own (`lane`, a thin band: waiting since the
//            last contact) or the whole plot's (a band: the follow-up is due).
//            A lane with `href` is a link; `sub` is a second line under its
//            label. The range word `all` fits the window to everything on the
//            timeline and now, and stays fitted as the data changes. The axis
//            steps go up to four weeks, a week starting on Monday
//   line     `.kp-gantt--line` [kpadopt4]: one lane and no toolbar, no lane
//            names and no brush, fitted to its data: the dated line under a
//            journey stepper
//
// Events (bubbling, on the timeline):
//   kp-gantt-open     { id, run, source: 'pointer' | 'keyboard' }  a bar was opened;
//                     { id, point, points, source } for a point (points: every point of a mark with a count)
//   kp-gantt-select   { from, to, source: 'brush' | 'day' | 'clear', day? } | detail null-ish ({ from: null, to: null }) when lifted; epoch ms
//   kp-gantt-window   { from, to, span, live }                  the window moved (a range button, Zoom, Live); epoch ms
//
// A screen reader hears a run change state ("Backup: failed") in a polite
// status region. The words are the dictionary's (`gantt…` in js/strings.js).
// Nothing runs on import; attachGantts(root) returns a detach. `decorate`
// marks every control the timeline builds (`bar`, `live`, `zoom`, `clear`).

import { CHART_TIME_ZONE, wallTime, zonedTime } from './chart.js';
import { dayKey, formatDayKey, shiftDay } from './calendar.js';
import { resolveStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';

/** A run timeline: `section.kp-gantt[data-kp-gantt]`. */
export const GANTT = '[data-kp-gantt]';
/** Fired on the timeline, bubbling, when a bar was opened: `detail` `{ id, run, source: 'pointer' | 'keyboard' }`. */
export const GANTT_OPEN_EVENT = 'kp-gantt-open';
/** Fired on the timeline, bubbling, when a range was selected or lifted: `detail` `{ from, to, source }` (epoch ms; null when lifted). */
export const GANTT_SELECT_EVENT = 'kp-gantt-select';
/** Fired on the timeline, bubbling, when the window moved by a person: `detail` `{ from, to, span, live }` (epoch ms, span in s). */
export const GANTT_WINDOW_EVENT = 'kp-gantt-window';
/** How often a live window moves, in ms. */
export const GANTT_TICK_MS = 1000;
/** The steps an axis chooses from, in seconds. */
export const GANTT_STEPS = Object.freeze([60, 300, 900, 1800, 3600, 10_800, 21_600, 43_200, 86_400, 172_800, 604_800, 1_209_600, 2_419_200]);
/** A week step and longer starts on a Monday: 1970-01-05, in seconds [kpadopt4]. */
const MONDAY = 345_600;
/** Point marks closer than this, in px, are one mark with a count [kpadopt4]. */
const CLUSTER_PX = 14;
/** The room a count plate takes after its mark, in px [kpadopt4]. */
const CLUSTER_PLATE_PX = 24;

/**
 * @typedef {'queued' | 'running' | 'ok' | 'failed'} GanttRunState
 * @typedef {object} GanttRun
 * @property {string} id what the page calls the run; reported by `kp-gantt-open`
 * @property {string} lane the lane's id
 * @property {string} label what the run is, one line
 * @property {number | string} start epoch ms or an ISO string; for a queued run, the moment it was queued
 * @property {number | string | null} [end] when it ended; ignored for a queued or running run
 * @property {GanttRunState} state
 * @property {string} [detail] more words for the hover card
 * @property {1 | 2 | 3 | 4 | 5} [series] a finished run's colour, `--chart-1` … `--chart-5`, in place of the success colour [kpadopt3]
 * @typedef {{ id: string, label: string, href?: string, sub?: string }} GanttLane
 * @typedef {object} GanttPoint
 * @property {string} id what the page calls the moment; reported by `kp-gantt-open`
 * @property {string} lane the lane's id
 * @property {number | string} at epoch ms or an ISO string; a date alone (`2026-10-02`) reads as that day
 * @property {string} kind the kind's key, named in the legend by setGanttKinds
 * @property {string} label what happened, one line
 * @property {string} [detail] more words for the hover card
 * @property {boolean} [planned] still to come: a hollow mark
 * @typedef {'dot' | 'diamond' | 'square' | 'triangle' | 'ring'} GanttShape
 * @typedef {{ kind: string, label: string, shape?: GanttShape, series?: 1 | 2 | 3 | 4 | 5, tone?: 'success' | 'warning' | 'destructive' | 'info' | 'muted' }} GanttKind
 * @typedef {{ id?: string, lane?: string, from: number | string, to: number | string, label: string, tone?: 'warning' | 'info' | 'muted' }} GanttZone
 * @typedef {{ series: 1 | 2 | 3 | 4 | 5, label: string }} GanttLegendEntry
 * @typedef {'loading' | 'ready' | 'empty' | 'error'} GanttState
 * @typedef {import('./strings.js').Strings} Strings
 *
 * @typedef {{ kind: 'bar' | 'live' | 'zoom' | 'clear', host: HTMLElement, key?: string, id?: string }} GanttDecorateInfo
 * @typedef {object} GanttOptions
 * @property {string} [timeZone] the IANA zone of the axis labels; else `data-kp-time-zone`, else `Europe/Brussels`
 * @property {() => number} [now] the clock, `Date.now` by default
 * @property {Partial<Strings>} [strings] any of the dictionary's words, for these timelines only
 * @property {(part: HTMLElement, info: GanttDecorateInfo) => void} [decorate]
 *
 * @typedef {{ run: GanttRun, s: number, e: number | null, bar: HTMLButtonElement, row: number }} GanttBar
 * @typedef {{ lane: GanttLane, label: HTMLElement, track: HTMLElement, bars: GanttBar[], points: HTMLButtonElement[], rows: number }} GanttLaneModel
 * @typedef {{ el: HTMLElement, zone: string, now: () => number, strings: Strings, decorate?: GanttOptions['decorate'],
 *   base: number, span: number, live: boolean, to: number, runs: GanttRun[], lanesGiven: GanttLane[], lanes: GanttLaneModel[],
 *   bars: Map<string, HTMLButtonElement>, states: Map<string, GanttRunState>, state: GanttState, active: string | null,
 *   selected: { from: number, to: number } | null, body: HTMLElement, scroll: HTMLElement, axis: HTMLElement,
 *   plot: HTMLElement, lines: HTMLElement, nowLine: HTMLElement, brushBox: HTMLElement, selectBox: HTMLElement,
 *   stateLine: HTMLElement, announcer: HTMLElement, ranges: HTMLElement, liveButton: HTMLButtonElement,
 *   selection: HTMLElement, selectionText: HTMLElement, ticks: Map<number, { label: HTMLElement, line: HTMLElement }>,
 *   legend: HTMLElement, days: boolean, dayStop: string | null,
 *   points: GanttPoint[], pointEls: Map<string, HTMLButtonElement>, kinds: GanttKind[], zones: GanttZone[], fit: boolean, line: boolean,
 *   ghosts: HTMLElement[], held: number | null, busy: import('./busy-card.js').BusyCard | null, leaving: Promise<void> | null, drawn: boolean, timer: number, observer: ResizeObserver | null, drag: { a: number, b: number } | null, dragMoved: boolean, tickKey: string }} GanttModel
 */

/** @type {WeakMap<Element, GanttModel>} */
const gantts = new WeakMap();
let idSeq = 0;

/** Two digits. @param {number} n */
const two = (n) => String(n).padStart(2, '0');

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/** @param {number | string} when @returns {number} */
const toMs = (when) => (typeof when === 'number' ? when : Date.parse(when));

/** @param {Element} host @returns {string | undefined} */
const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;

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
 * @returns {{ rows: Map<string, number>, count: number }}
 */
export function packRows(runs, before = new Map(), pad = 0) {
    const sorted = [...runs].sort((a, b) => a.s - b.s);
    /** @type {{ s: number, e: number }[][]} */
    const rows = [];
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
function zoneOffset(ms, zone) {
    const w = wallTime(ms, zone);
    return (Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(ms / 60_000) * 60_000) / 1000;
}

/** @param {GanttModel} c @param {number} seconds */
function duration(c, seconds) {
    return c.strings.ganttDuration(Math.max(0, Math.round(seconds)));
}

/** The clock time of a moment in the zone: `14:32`. @param {GanttModel} c @param {number} ms */
function clock(c, ms) {
    const w = wallTime(ms, c.zone);
    return `${two(w.hour)}:${two(w.minute)}`;
}

/** The day and time of a moment: `17/10 14:32`. @param {GanttModel} c @param {number} ms */
function stamp(c, ms) {
    return `${formatDayKey(dayKey(ms, c.zone)).slice(0, 5)} ${clock(c, ms)}`;
}

/** @param {GanttModel} c @param {GanttRunState} state */
const stateWord = (c, state) =>
    ({ queued: c.strings.ganttQueued, running: c.strings.ganttRunning, ok: c.strings.ganttOk, failed: c.strings.ganttFailed })[state];

/** The seconds, relative to the base, of a moment. @param {GanttModel} c @param {number} ms */
const rel = (c, ms) => ms / 1000 - c.base;

/**
 * Fit the window to everything the timeline holds and now [kpadopt4]: a margin of a twentieth on each side, at least an hour.
 * @param {GanttModel} c
 */
function fitWindow(c) {
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
function windowOf(c) {
    const now = rel(c, c.now());
    const end = c.live ? now + Math.max(30, c.span * 0.03) : c.to;
    return { from: end - c.span, end, now };
}

/** The words of a bar's name and card. @param {GanttModel} c @param {GanttBar} b */
function wordsOf(c, b) {
    const { run } = b;
    const nowMs = c.now();
    const startMs = b.s * 1000 + c.base * 1000;
    const endMs = b.e == null ? nowMs : b.e * 1000 + c.base * 1000;
    const state = stateWord(c, run.state);
    const length = duration(c, (endMs - startMs) / 1000);
    const when =
        run.state === 'queued'
            ? `${stamp(c, startMs)}, ${length}`
            : run.state === 'running'
              ? `${stamp(c, startMs)}, ${length}`
              : `${stamp(c, startMs)} – ${clock(c, endMs)}, ${length}`;
    return { name: c.strings.ganttBar(run.label, when, state), card: [run.label, when, state, run.detail ?? ''].filter(Boolean).join(' · ') };
}

/** Build the chrome once. @param {GanttModel} c */
function build(c) {
    const doc = c.el.ownerDocument;
    const s = c.strings;
    const bar = make(doc, 'div', 'kp-gantt__bar');
    c.ranges = make(doc, 'div', 'kp-segmented kp-gantt__ranges');
    c.ranges.setAttribute('data-kp-segmented', 'single');
    c.ranges.setAttribute('role', 'radiogroup');
    c.ranges.setAttribute('aria-label', s.ganttRange);
    const words = (c.el.dataset.kpGanttRanges ?? (c.line ? 'all' : '1h 6h 24h 7d'))
        .split(/[\s,]+/)
        .filter((w) => w === 'all' || Number.isFinite(rangeSeconds(w)));
    const wanted = c.el.dataset.kpGanttRange ?? (c.line ? 'all' : (words[Math.min(1, words.length - 1)] ?? '6h'));
    for (const word of words) {
        const item = make(doc, 'button', 'kp-segmented__item');
        item.type = 'button';
        item.dataset.value = word;
        item.setAttribute('role', 'radio');
        item.setAttribute('aria-checked', String(word === wanted));
        item.title = word === 'all' ? s.ganttAllTitle : s.ganttRangeTitle(word);
        item.append(make(doc, 'span', 'kp-segmented__label', word === 'all' ? s.ganttAll : word));
        c.ranges.append(item);
    }
    // `all` fits the window to what the timeline holds [kpadopt4].
    c.fit = wanted === 'all';
    if (c.fit) c.live = false;
    c.span = rangeSeconds(wanted) || 21_600;
    c.liveButton = make(doc, 'button', 'kp-button kp-button--sm kp-gantt__live', s.ganttLive);
    c.liveButton.type = 'button';
    c.liveButton.setAttribute('aria-pressed', 'true');
    c.liveButton.title = s.ganttLiveTitle;
    c.selection = make(doc, 'div', 'kp-gantt__selection');
    c.selection.setAttribute('role', 'group');
    c.selection.setAttribute('aria-label', s.ganttSelection);
    c.selectionText = make(doc, 'span', 'kp-gantt__selected');
    const zoom = make(doc, 'button', 'kp-button kp-button--sm', s.ganttZoom);
    zoom.type = 'button';
    zoom.title = s.ganttZoomTitle;
    zoom.dataset.kpGanttZoom = '';
    const clear = make(doc, 'button', 'kp-button kp-button--sm', s.ganttClear);
    clear.type = 'button';
    clear.title = s.ganttClearTitle;
    clear.dataset.kpGanttClear = '';
    c.selection.append(c.selectionText, zoom, clear);
    // The chip sits in the toolbar row, over the range buttons and Live while a range is selected: it lies on no data and
    // adds no height when it comes.
    bar.append(c.ranges, c.liveButton, c.selection);
    c.decorate?.(c.liveButton, { kind: 'live', host: c.el, key: keyOf(c.el) });
    c.decorate?.(zoom, { kind: 'zoom', host: c.el, key: keyOf(c.el) });
    c.decorate?.(clear, { kind: 'clear', host: c.el, key: keyOf(c.el) });

    c.scroll = make(doc, 'div', 'kp-gantt__scroll');
    c.body = make(doc, 'div', 'kp-gantt__body');
    c.body.setAttribute('role', 'group');
    if (!c.el.hasAttribute('aria-label') && !c.el.hasAttribute('aria-labelledby')) c.body.setAttribute('aria-label', s.ganttGroup);
    const corner = make(doc, 'div', 'kp-gantt__corner');
    c.axis = make(doc, 'div', 'kp-gantt__axis');
    // With day buttons the axis holds controls; its other labels are hidden one by one (syncTicks).
    if (!c.days) c.axis.setAttribute('aria-hidden', 'true');
    c.plot = make(doc, 'div', 'kp-gantt__plot');
    c.lines = make(doc, 'div', 'kp-gantt__lines');
    c.lines.setAttribute('aria-hidden', 'true');
    c.nowLine = make(doc, 'div', 'kp-gantt__now');
    c.nowLine.setAttribute('role', 'separator');
    c.selectBox = make(doc, 'div', 'kp-gantt__select');
    c.selectBox.hidden = true;
    c.brushBox = make(doc, 'div', 'kp-gantt__brush');
    c.brushBox.hidden = true;
    c.plot.append(c.selectBox, c.nowLine, c.brushBox);
    // The rules sit under the lanes' bars, the line for now and the brush over them.
    c.body.append(corner, c.axis, c.lines, c.plot);
    c.scroll.append(c.body);
    c.stateLine = make(doc, 'p', 'kp-gantt__state');
    c.stateLine.setAttribute('role', 'status');
    c.announcer = make(doc, 'p', 'kp-gantt__announce');
    c.announcer.setAttribute('role', 'status');
    const frame = make(doc, 'div', 'kp-gantt__frame');
    c.selection.hidden = true;
    frame.append(c.scroll, c.stateLine);
    const hint = make(doc, 'p', 'kp-gantt__hint', c.el.hasAttribute('data-kp-gantt-points') ? s.ganttPointsHint : s.ganttHint);
    const legend = make(doc, 'ul', 'kp-gantt__legend');
    c.legend = legend;
    for (const state of /** @type {const} */ (['ok', 'failed', 'running', 'queued'])) {
        const li = make(doc, 'li', 'kp-gantt__legend-state');
        const swatch = make(doc, 'span', 'kp-gantt__swatch');
        swatch.dataset.kpState = state;
        swatch.setAttribute('aria-hidden', 'true');
        li.append(swatch, make(doc, 'span', '', stateWord(c, state)));
        legend.append(li);
    }
    c.el.replaceChildren(bar, frame, legend, hint, c.announcer);
    c.el.dataset.kpGanttId = String((idSeq += 1));
}

/** Move the window (custom properties only); tick labels follow when the set changes. @param {GanttModel} c */
function frame(c) {
    const w = windowOf(c);
    const st = c.body.style;
    st.setProperty('--kp-g-from', w.from.toFixed(2));
    st.setProperty('--kp-g-span', String(c.span));
    st.setProperty('--kp-g-now', w.now.toFixed(2));
    // The line for now sits outside a fixed window that has not reached it.
    c.nowLine.toggleAttribute('data-kp-out', w.now < w.from || w.now > w.end);
    c.nowLine.setAttribute('aria-label', `${c.strings.ganttNow}, ${clock(c, c.now())}`);
    return w;
}

/** Axis ticks for the window. @param {GanttModel} c @param {{ from: number, end: number }} w */
function syncTicks(c, w) {
    const room = c.plot.clientWidth || 600;
    const step = axisStep(c.span, room);
    const fromMs = (w.from + c.base) * 1000;
    const offset = zoneOffset(fromMs, c.zone);
    // A week or longer starts on a Monday [kpadopt4]; shorter steps keep the clock's own multiples.
    const anchor = step >= 604_800 ? MONDAY : 0;
    const firstAbs = anchor + Math.ceil((w.from + c.base + offset - anchor) / step) * step - offset;
    /** @type {number[]} */
    const list = [];
    for (let t = firstAbs; t <= w.end + c.base + 1; t += step) list.push(t - c.base);
    const key = `${step}:${list.map((t) => t.toFixed(0)).join(',')}`;
    if (key === c.tickKey) return;
    c.tickKey = key;
    const doc = c.el.ownerDocument;
    const keep = new Set(list.map((t) => Math.round(t)));
    for (const [t, parts] of c.ticks)
        if (!keep.has(t)) {
            parts.label.remove();
            parts.line.remove();
            c.ticks.delete(t);
        }
    for (const t of list) {
        const id = Math.round(t);
        const ms = (id + c.base) * 1000;
        const w2 = wallTime(ms, c.zone);
        const midnight = w2.hour === 0 && w2.minute === 0;
        const isDay = step >= 86_400 || midnight;
        // A day the axis names is a button when the timeline asks for them [kpadopt3].
        const tag = c.days && isDay ? 'BUTTON' : 'SPAN';
        let parts = c.ticks.get(id);
        if (!parts) {
            parts = { label: make(doc, 'span', 'kp-gantt__tick'), line: make(doc, 'i', 'kp-gantt__rule') };
            c.axis.append(parts.label);
            c.lines.append(parts.line);
            c.ticks.set(id, parts);
        }
        if (parts.label.tagName !== tag) {
            const fresh = make(doc, tag === 'BUTTON' ? 'button' : 'span', 'kp-gantt__tick');
            if (fresh instanceof HTMLButtonElement) fresh.type = 'button';
            parts.label.replaceWith(fresh);
            parts.label = fresh;
        }
        const day = dayKey(ms, c.zone);
        parts.label.textContent = isDay ? formatDayKey(day).slice(0, 5) : clock(c, ms);
        parts.label.toggleAttribute('data-kp-day', isDay);
        if (tag === 'BUTTON') {
            parts.label.dataset.kpGanttDay = day;
            parts.label.setAttribute('aria-label', dayWords(c, day));
            parts.label.title = dayWords(c, day);
        } else if (c.days) parts.label.setAttribute('aria-hidden', 'true');
        parts.label.style.setProperty('--kp-g-t', String(id));
        parts.line.style.setProperty('--kp-g-t', String(id));
    }
    // A day button is pressed whole: one that would run past the end of the axis stands against its end instead, and
    // one that has no room there without touching the label before it is not offered (its day is the window's last, partial one).
    if (c.days) {
        const room = c.axis.clientWidth;
        let before = -Infinity;
        for (const id of [...c.ticks.keys()].sort((a, b) => a - b)) {
            const label = /** @type {{ label: HTMLElement }} */ (c.ticks.get(id)).label;
            const x = ((id - w.from) / c.span) * room;
            const width = label.offsetWidth;
            const edge = label.tagName === 'BUTTON' && x + width > room;
            const start = edge ? room - width : x;
            const crowded = edge && start < before + 6;
            label.toggleAttribute('data-kp-gantt-edge', edge);
            label.toggleAttribute('data-kp-gantt-crowded', crowded);
            if (!crowded) before = start + width;
        }
    }
    syncDays(c);
}

/**
 * A day as a person reads it on a button: `We 14/10/2026`, the dictionary's weekday (rule 52: dd/mm, the year in the name).
 * @param {GanttModel} c @param {string} day
 */
function dayWords(c, day) {
    const weekday = c.strings.weekdays[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7] ?? '';
    return `${weekday} ${formatDayKey(day)}`.trim();
}

/** The moments a day of the zone starts and ends, epoch ms. @param {GanttModel} c @param {string} day */
function dayBounds(c, day) {
    const at = (/** @type {string} */ iso) =>
        zonedTime(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)), 0, 0, c.zone) ?? Date.parse(`${iso}T00:00:00Z`);
    return { from: at(day), to: at(shiftDay(day, 1)) };
}

/** The day buttons: pressed while their day is the selection, one tab stop among them. @param {GanttModel} c */
function syncDays(c) {
    if (!c.days) return;
    for (const b of /** @type {HTMLButtonElement[]} */ ([...c.axis.querySelectorAll('button[data-kp-gantt-day][data-kp-gantt-crowded]')]))
        b.tabIndex = -1;
    const buttons = /** @type {HTMLButtonElement[]} */ ([...c.axis.querySelectorAll('button[data-kp-gantt-day]:not([data-kp-gantt-crowded])')]);
    const sel = c.selected;
    let picked = '';
    for (const b of buttons) {
        const day = b.dataset.kpGanttDay ?? '';
        const { from, to } = dayBounds(c, day);
        const on = sel !== null && sel.from === from && sel.to === to;
        if (on) picked = day;
        b.setAttribute('aria-pressed', String(on));
    }
    const stop = buttons.find((b) => b.dataset.kpGanttDay === c.dayStop) ?? buttons.find((b) => b.dataset.kpGanttDay === picked) ?? buttons[0];
    for (const b of buttons) b.tabIndex = b === stop ? 0 : -1;
}

/**
 * A tick label that would run past the axis's end edge (the newest hour entering the window) stands on the other
 * side of its rule, ending at it, so no label is ever cut by the edge.
 * @param {GanttModel} c @param {{ from: number, end: number }} w
 */
function edgeTicks(c, w) {
    const room = c.axis.clientWidth;
    if (!room) return;
    let before = -Infinity;
    for (const t of [...c.ticks.keys()].sort((a, b) => a - b)) {
        const parts = /** @type {{ label: HTMLElement }} */ (c.ticks.get(t));
        // A day button (`data-kp-gantt-days`) has its own edge rule in syncTicks: it stands against the end, whole.
        if (parts.label.tagName === 'BUTTON') continue;
        const at = ((t - w.from) / c.span) * room;
        const width = parts.label.offsetWidth;
        const edge = room - at < width + 2;
        parts.label.toggleAttribute('data-kp-gantt-edge', edge);
        // A label turned before its rule that would run into the label before it steps aside [kpadopt4].
        const start = edge ? at - width : at;
        const crowded = edge && start < before + 4;
        parts.label.toggleAttribute('data-kp-gantt-crowded', crowded);
        if (!crowded) before = start + width;
    }
}

/** Everything the timeline shows, from the model. @param {GanttModel} c */
function paint(c) {
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
        const endRaw = open ? null : run.end == null ? startMs : toMs(run.end);
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
    const pad = c.span * 0.006;
    const before = new Map(c.lanes.flatMap((l) => l.bars.map((b) => [b.run.id, b.row])));
    const old = new Map(c.lanes.map((l) => [l.lane.id, l]));
    /** @type {GanttLaneModel[]} */
    const lanes = [];
    for (const [id, lane] of laneById) {
        const bars = (byLane.get(id) ?? []).sort((a, b) => a.s - b.s);
        const packed = packRows(
            bars.map((b) => ({ id: b.run.id, s: b.s, e: b.e })),
            before,
            pad,
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
    c.el.dataset.kpState = c.state;
    c.body.toggleAttribute('aria-busy', c.state === 'loading');
    drawBusy(c);
    const empty = c.state === 'ready' && c.runs.length === 0 && c.points.length === 0 && lanes.length === 0;
    const words = c.state === 'loading' ? s.ganttLoading : c.state === 'empty' || empty ? s.ganttEmpty : c.stateLine.dataset.kpWords || '';
    // A timeline of moments with nothing to show has no line for now running through its sentence [kpadopt4].
    c.nowLine.hidden = c.el.hasAttribute('data-kp-gantt-points') && (c.state === 'error' || c.state === 'empty' || empty);
    // An empty or failed sentence waits, as the runs do, until the card has gone.
    c.stateLine.textContent = (c.state === 'ready' && !empty) || c.leaving !== null ? '' : words;
    c.stateLine.dataset.kpState = empty && c.state === 'ready' ? 'empty' : c.state;
    paintGhosts(c);
    c.busy?.place();
    roomForWords(c);
    holdHeight(c);
    visible(c);
    refresh(c, nowMs);
    syncTabStops(c);
}

/**
 * A timeline with no lane (empty or failed) gives its sentence a room of its own under the axis, as tall as the words
 * need at this width (a long failure reason wraps on a phone), so the sentence never runs out of the frame onto the
 * legend. The room is `--kp-gantt-words` on the body, read by the body's min-block-size in css/components.css.
 * @param {GanttModel} c
 */
function roomForWords(c) {
    if (c.state === 'loading' || !c.stateLine.textContent || c.body.querySelector('.kp-gantt__lane')) {
        c.body.style.removeProperty('--kp-gantt-words');
        return;
    }
    const range = c.el.ownerDocument.createRange();
    range.selectNodeContents(c.stateLine);
    const style = getComputedStyle(c.stateLine);
    const need = range.getBoundingClientRect().height + parseFloat(style.paddingBlockStart) + parseFloat(style.paddingBlockEnd);
    c.body.style.setProperty('--kp-gantt-words', `${Math.ceil(need)}px`);
}

/**
 * The scrolling viewport keeps the height it first had with data: a start that needs more rows than the lanes reserved scrolls
 * inside the frame instead of moving the page. A change the person asks for (range, Live, Zoom) or the page's own `loading`
 * releases it. @param {GanttModel} c
 */
function holdHeight(c) {
    if (c.state !== 'ready' || c.lanes.length === 0) return;
    if (c.held === null) {
        c.scroll.style.removeProperty('block-size');
        c.held = c.scroll.getBoundingClientRect().height;
    }
    if (c.held > 0) c.scroll.style.setProperty('block-size', `${c.held}px`);
}

/**
 * While the timeline loads, the data table's own loading card stands centred over its lanes (Kenny, 2026-10-16:
 * "zoals bij een table waar het icoon in het midden van de matrix staat en lijkt te laden"): js/busy-card.js, the
 * layer and panel js/datatable.js drawOverlay() builds, so every theme dresses it as it dresses its busy table. The
 * toolbar, the axis and the lane names stay readable beside it; the frame keeps its height (the ghost lanes, or the
 * lanes it had). It arrives the theme's way, except on the first render, and leaves as the busy table's layer leaves;
 * the runs are drawn once it has gone. The sentence is still read out (`role="status"`), no longer drawn.
 * @param {GanttModel} c
 */
function drawBusy(c) {
    const want = c.state === 'loading';
    if (want === (c.busy !== null)) {
        c.busy?.place();
        return;
    }
    const frameBox = /** @type {HTMLElement} */ (c.scroll.parentElement);
    if (!want) {
        const card = /** @type {import('./busy-card.js').BusyCard} */ (c.busy);
        c.busy = null;
        const gone = card.close();
        c.leaving = gone;
        void gone.then(() => {
            if (c.leaving !== gone) return;
            c.leaving = null;
            if (gantts.get(c.el) === c) {
                paint(c);
                tick(c);
            }
        });
        return;
    }
    for (const old of frameBox.querySelectorAll(':scope > .kp-gantt__busy')) old.remove();
    c.leaving = null;
    c.busy = openBusyCard(frameBox, {
        words: c.strings.ganttLoading,
        area: () => {
            // A dated line is short: its card covers the whole frame, the line and its dates [kpadopt4].
            if (c.line) return [c.scroll];
            const tracks = /** @type {HTMLElement[]} */ ([...c.body.querySelectorAll(':scope > .kp-gantt__track')]);
            const scroll = c.scroll.getBoundingClientRect();
            const axis = c.axis.getBoundingClientRect();
            if (!tracks.length) return [];
            // The lanes in view, under the axis.
            const boxes = tracks.map((t) => t.getBoundingClientRect());
            return [
                {
                    // A dated line has its axis under the lane [kpadopt4].
                    top: c.line ? Math.min(...boxes.map((b) => b.top)) : Math.max(axis.bottom, Math.min(...boxes.map((b) => b.top))),
                    left: Math.min(...boxes.map((b) => b.left)),
                    right: Math.max(...boxes.map((b) => b.right)),
                    bottom: Math.min(c.line ? axis.top : scroll.bottom, Math.max(...boxes.map((b) => b.bottom))),
                },
            ];
        },
        className: 'kp-gantt__busy',
        arrive: c.drawn,
    });
}

/** Ghost lanes while loading with no lanes yet. @param {GanttModel} c */
function paintGhosts(c) {
    const doc = c.el.ownerDocument;
    // While the busy card leaves the ghosts stay: nothing of the runs is drawn under a card on its way out.
    const need = (c.state === 'loading' || c.leaving !== null) && c.lanes.length === 0;
    if (!need) {
        for (const g of c.ghosts.splice(0)) g.remove();
        return;
    }
    if (c.ghosts.length) return;
    const shapes = [
        [0.08, 0.2, 0.52, 0.12],
        [0.3, 0.28],
        [0.14, 0.1, 0.6],
        [0.4, 0.2],
        [0.05, 0.5],
        [0.25, 0.1],
    ];
    // `data-kp-gantt-ghosts="2 3 2 1 1"`: the rows of each ghost lane, so the loading frame is as tall as the lanes will be.
    const rows = (c.el.dataset.kpGanttGhosts ?? (c.line ? '1' : '1 1 1'))
        .split(/\s+/)
        .map((n) => Math.max(1, Math.min(6, Number.parseInt(n, 10) || 1)));
    rows.forEach((count, i) => {
        const bars = /** @type {number[]} */ (shapes[i % shapes.length]);
        const label = make(doc, 'div', 'kp-gantt__lane kp-gantt__ghost');
        label.setAttribute('aria-hidden', 'true');
        label.append(make(doc, 'span', 'kp-skeleton'));
        label.style.setProperty('grid-row', String(i + 2));
        const track = make(doc, 'div', 'kp-gantt__track kp-gantt__ghost');
        track.setAttribute('aria-hidden', 'true');
        track.style.setProperty('grid-row', String(i + 2));
        track.style.setProperty('--kp-g-rows', String(count));
        for (const [k, at] of bars.entries()) {
            const piece = make(doc, 'span', 'kp-gantt__run kp-skeleton');
            piece.style.setProperty('--kp-g-row', String(k % count));
            piece.style.setProperty('--kp-g-at', String(at));
            piece.style.setProperty('--kp-g-width', String(0.05 + ((i + k) % 3) * 0.05));
            track.append(piece);
        }
        c.body.insertBefore(label, c.plot);
        c.body.insertBefore(track, c.plot);
        c.ghosts.push(label, track);
    });
    c.body.style.setProperty('--kp-g-lanes', String(rows.length));
}

/**
 * A lane's name: a link when the lane has `href`, and a second line when it has `sub` [kpadopt4].
 * @param {GanttModel} c @param {HTMLElement} label @param {GanttLane} lane
 */
function fillLaneLabel(c, label, lane) {
    const doc = c.el.ownerDocument;
    const key = `${lane.label}\u0000${lane.sub ?? ''}\u0000${lane.href ?? ''}`;
    if (label.dataset.kpLaneKey === key) return;
    label.dataset.kpLaneKey = key;
    label.title = lane.sub ? `${lane.label} · ${lane.sub}` : lane.label;
    const name = make(doc, 'span', 'kp-gantt__name', lane.label);
    /** @type {HTMLElement} */
    let holder = name;
    if (lane.href) {
        const link = make(doc, 'a', 'kp-gantt__lane-link');
        link.href = lane.href;
        link.append(name);
        holder = link;
    }
    if (lane.sub) {
        const words = make(doc, 'span', 'kp-gantt__words');
        if (holder === name) words.append(name, make(doc, 'span', 'kp-gantt__sub', lane.sub));
        else {
            holder.append(make(doc, 'span', 'kp-gantt__sub', lane.sub));
            words.append(holder);
        }
        holder = words;
    }
    label.replaceChildren(holder);
}

/** When a point happened, as a person reads it: a day alone, or the day and the time. @param {GanttModel} c @param {GanttPoint} point @param {number} ms */
function pointWhen(c, point, ms) {
    const day = formatDayKey(dayKey(ms, c.zone));
    return typeof point.at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(point.at) ? day : `${day} ${clock(c, ms)}`;
}

/** The name and the card of one point. @param {GanttModel} c @param {GanttPoint} point */
function pointWords(c, point) {
    const ms = toMs(point.at);
    const when = pointWhen(c, point, ms);
    const kind = c.kinds.find((k) => k.kind === point.kind);
    const planned = point.planned ? `, ${c.strings.ganttPlanned}` : '';
    return {
        name: `${c.strings.ganttPoint(point.label, when)}${planned}`,
        card: [point.label, when + planned, kind && kind.label !== point.label ? kind.label : '', point.detail ?? ''].filter(Boolean).join(' · '),
    };
}

/** The points as marks in their lanes, by id, in time order [kpadopt4]. @param {GanttModel} c @param {GanttLaneModel[]} lanes */
function paintPoints(c, lanes) {
    const doc = c.el.ownerDocument;
    /** @type {Map<string, HTMLButtonElement[]>} */
    const byLane = new Map();
    const live = new Set();
    const sorted = [...c.points].filter((p) => Number.isFinite(toMs(p.at))).sort((a, b) => toMs(a.at) - toMs(b.at));
    for (const point of sorted) {
        let el = c.pointEls.get(point.id);
        if (!el) {
            el = make(doc, 'button', 'kp-gantt__point');
            el.type = 'button';
            el.append(make(doc, 'span', 'kp-gantt__count'));
            c.pointEls.set(point.id, el);
            c.decorate?.(el, { kind: 'bar', host: c.el, key: keyOf(c.el), id: point.id });
        }
        const kind = c.kinds.find((k) => k.kind === point.kind);
        el.dataset.kpId = point.id;
        el.dataset.kpKind = point.kind;
        el.dataset.kpShape = kind?.shape ?? 'dot';
        if (kind?.series) el.dataset.kpSeries = String(kind.series);
        else delete el.dataset.kpSeries;
        if (kind?.tone) el.dataset.kpTone = kind.tone;
        else delete el.dataset.kpTone;
        el.toggleAttribute('data-kp-planned', point.planned === true);
        el.style.setProperty('--kp-g-s', rel(c, toMs(point.at)).toFixed(2));
        const words = pointWords(c, point);
        el.dataset.kpName = words.name;
        el.dataset.kpCard = words.card;
        live.add(point.id);
        const list = byLane.get(point.lane) ?? [];
        list.push(el);
        byLane.set(point.lane, list);
    }
    for (const [id, el] of c.pointEls)
        if (!live.has(id)) {
            el.remove();
            c.pointEls.delete(id);
        }
    for (const lane of lanes) {
        const want = byLane.get(lane.lane.id) ?? [];
        const have = [...lane.track.querySelectorAll(':scope > .kp-gantt__point')];
        if (want.length !== have.length || want.some((n, k) => n !== have[k])) lane.track.append(...want);
        lane.points = want;
    }
}

/**
 * Marks closer than the eye can tell apart become one mark with a count, whose name and card name them all [kpadopt4].
 * Measured against the plot's width, so it follows a resize and a new window.
 * @param {GanttModel} c
 */
function clusterPoints(c) {
    const width = c.plot.clientWidth || 1;
    for (const lane of c.lanes) {
        /** @type {HTMLButtonElement[][]} */
        const groups = [];
        let headAt = Number.NEGATIVE_INFINITY;
        for (const el of lane.points) {
            if (el.hidden) continue;
            const at = Number.parseFloat(el.style.getPropertyValue('--kp-g-s'));
            const px = ((at - headAt) / c.span) * width;
            const last = groups[groups.length - 1];
            // A mark with a count carries its plate after it: the next mark keeps clear of the plate too.
            if (last && px < (last.length > 1 ? CLUSTER_PX + CLUSTER_PLATE_PX : CLUSTER_PX)) last.push(el);
            else {
                groups.push([el]);
                headAt = at;
            }
        }
        for (const el of lane.points) {
            if (!el.hidden) continue;
            el.removeAttribute('data-kp-clustered');
            el.removeAttribute('data-kp-cluster');
        }
        for (const group of groups) {
            const [head, ...rest] = /** @type {[HTMLButtonElement, ...HTMLButtonElement[]]} */ (group);
            const count = /** @type {HTMLElement} */ (head.querySelector('.kp-gantt__count'));
            head.removeAttribute('data-kp-clustered');
            for (const el of rest) el.setAttribute('data-kp-clustered', '');
            if (rest.length === 0) {
                head.removeAttribute('data-kp-cluster');
                count.textContent = '';
                head.setAttribute('aria-label', head.dataset.kpName ?? '');
                head.setAttribute('data-kp-hovercard', head.dataset.kpCard ?? '');
                continue;
            }
            head.setAttribute('data-kp-cluster', String(group.length));
            count.textContent = c.strings.ganttClusterMore(rest.length);
            head.setAttribute('aria-label', c.strings.ganttCluster(group.length, group.map((el) => el.dataset.kpName ?? '').join('; ')));
            head.setAttribute('data-kp-hovercard', group.map((el) => el.dataset.kpCard ?? '').join('  |  '));
        }
    }
}

/**
 * The stretches under the marks [kpadopt4]: a lane's own as a thin band in its track, the whole plot's as a band behind
 * every lane, named in the legend. Drawn again on every paint; they hold no focus.
 * @param {GanttModel} c @param {GanttLaneModel[]} lanes
 */
function paintZones(c, lanes) {
    const doc = c.el.ownerDocument;
    for (const old of c.body.querySelectorAll('.kp-gantt__zone')) old.remove();
    /** @type {Map<string, string[]>} */
    const laneWords = new Map();
    for (const [i, zone] of c.zones.entries()) {
        const from = toMs(zone.from);
        const to = toMs(zone.to);
        if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
        const band = make(doc, 'i', 'kp-gantt__zone');
        band.setAttribute('aria-hidden', 'true');
        band.dataset.kpTone = zone.tone ?? 'warning';
        band.dataset.kpZone = zone.id ?? String(i);
        band.style.setProperty('--kp-g-s', rel(c, Math.min(from, to)).toFixed(2));
        band.style.setProperty('--kp-g-e', rel(c, Math.max(from, to)).toFixed(2));
        const lane = zone.lane === undefined ? null : lanes.find((l) => l.lane.id === zone.lane);
        if (lane) {
            band.dataset.kpLaneZone = '';
            lane.track.prepend(band);
            laneWords.set(lane.lane.id, [...(laneWords.get(lane.lane.id) ?? []), zone.label]);
        } else if (zone.lane === undefined) c.lines.append(band);
    }
    // A lane's stretches are part of its name, for a reader who cannot see the band.
    for (const lane of lanes) {
        const extra = laneWords.get(lane.lane.id);
        lane.track.setAttribute('aria-label', extra ? `${lane.lane.label}; ${extra.join('; ')}` : lane.lane.label);
    }
}

/** The kinds and the plot's stretches in the legend, after the states; the states go when there are no runs [kpadopt4]. @param {GanttModel} c */
function paintKinds(c) {
    const doc = c.el.ownerDocument;
    for (const old of c.legend.querySelectorAll(':scope > .kp-gantt__legend-kind, :scope > .kp-gantt__legend-zone')) old.remove();
    for (const kind of c.kinds) {
        const li = make(doc, 'li', 'kp-gantt__legend-kind');
        const mark = make(doc, 'span', 'kp-gantt__mark');
        mark.dataset.kpShape = kind.shape ?? 'dot';
        if (kind.series) mark.dataset.kpSeries = String(kind.series);
        if (kind.tone) mark.dataset.kpTone = kind.tone;
        mark.setAttribute('aria-hidden', 'true');
        li.append(mark, make(doc, 'span', '', kind.label));
        c.legend.append(li);
    }
    const seen = new Set();
    for (const zone of c.zones) {
        if (zone.lane !== undefined || seen.has(zone.label)) continue;
        seen.add(zone.label);
        const li = make(doc, 'li', 'kp-gantt__legend-zone');
        const swatch = make(doc, 'span', 'kp-gantt__band');
        swatch.dataset.kpTone = zone.tone ?? 'warning';
        swatch.setAttribute('aria-hidden', 'true');
        li.append(swatch, make(doc, 'span', '', zone.label));
        c.legend.append(li);
    }
    const runless = c.runs.length === 0 && (c.points.length > 0 || c.kinds.length > 0);
    for (const li of c.legend.querySelectorAll(':scope > .kp-gantt__legend-state')) /** @type {HTMLElement} */ (li).hidden = runless;
}

/** Hide a bar wholly outside the window (it takes no tab stop). @param {GanttModel} c */
function visible(c) {
    const w = windowOf(c);
    const now = w.now;
    for (const lane of c.lanes) {
        for (const b of lane.bars) {
            const end = b.e ?? now;
            b.bar.hidden = c.state === 'loading' || c.leaving !== null || end < w.from || b.s > w.end;
        }
        for (const point of lane.points) {
            const at = Number.parseFloat(point.style.getPropertyValue('--kp-g-s'));
            point.hidden = c.state === 'loading' || c.leaving !== null || at < w.from || at > w.end;
        }
    }
    clusterPoints(c);
}

/** Words that grow with the clock: a running bar's name and card. @param {GanttModel} c @param {number} nowMs */
function refresh(c, nowMs) {
    void nowMs;
    for (const lane of c.lanes)
        for (const b of lane.bars) {
            const { name, card } = wordsOf(c, b);
            if (b.bar.getAttribute('aria-label') !== name) b.bar.setAttribute('aria-label', name);
            if (b.bar.getAttribute('data-kp-hovercard') !== card) b.bar.setAttribute('data-kp-hovercard', card);
        }
}

/** The bars a person can reach, per lane, in time order. @param {GanttModel} c */
function reachableLanes(c) {
    const startOf = (/** @type {HTMLElement} */ el) => Number.parseFloat(el.style.getPropertyValue('--kp-g-s'));
    return c.lanes
        .map((lane) =>
            [
                ...lane.bars.filter((b) => !b.bar.hidden).map((b) => b.bar),
                ...lane.points.filter((p) => !p.hidden && !p.hasAttribute('data-kp-clustered')),
            ].sort((a, b) => startOf(a) - startOf(b)),
        )
        .filter((l) => l.length);
}

/** One tab stop: the active bar. @param {GanttModel} c */
function syncTabStops(c) {
    const all = [...c.bars.values(), ...c.pointEls.values()];
    const reach = reachableLanes(c).flat();
    let target = c.active ? (c.bars.get(c.active) ?? c.pointEls.get(c.active)) : undefined;
    if (!target || !reach.includes(target)) target = reach[0];
    for (const el of all) el.tabIndex = el === target ? 0 : -1;
}

/** @param {GanttModel} c @param {HTMLElement} to */
function focusBar(c, to) {
    c.active = to.dataset.kpId ?? c.active;
    syncTabStops(c);
    to.focus();
}

/** @param {GanttModel} c */
function paintSelection(c) {
    const sel = c.selected;
    c.selection.toggleAttribute('data-kp-active', sel !== null);
    c.selection.hidden = sel === null;
    // What the chip covers cannot be reached by keyboard either.
    c.ranges.toggleAttribute('inert', sel !== null);
    c.liveButton.toggleAttribute('inert', sel !== null);
    c.selectBox.hidden = sel === null;
    syncDays(c);
    if (!sel) {
        c.selectionText.textContent = '';
        return;
    }
    c.selectBox.style.setProperty('--kp-g-s', rel(c, sel.from).toFixed(2));
    c.selectBox.style.setProperty('--kp-g-e', rel(c, sel.to).toFixed(2));
    c.selectionText.textContent = c.strings.ganttSelected(stamp(c, sel.from), stamp(c, sel.to));
}

/** @param {GanttModel} c @param {'range' | 'zoom' | 'live'} why */
function announceWindow(c, why) {
    const w = windowOf(c);
    c.el.dataset.kpGanttLive = String(c.live);
    c.liveButton.setAttribute('aria-pressed', String(c.live));
    c.el.dispatchEvent(
        new CustomEvent(GANTT_WINDOW_EVENT, {
            bubbles: true,
            detail: { from: (w.from + c.base) * 1000, to: (w.end + c.base) * 1000, span: c.span, live: c.live, why },
        }),
    );
}

/** One second of the clock. @param {GanttModel} c */
function tick(c) {
    const w = frame(c);
    syncTicks(c, w);
    edgeTicks(c, w);
    visible(c);
    refresh(c, c.now());
    syncTabStops(c);
}

/**
 * Attach every run timeline under `root`.
 * @param {ParentNode} [root]
 * @param {GanttOptions} [options]
 * @returns {() => void} detach
 */
export function attachGantts(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el of /** @type {HTMLElement[]} */ ([...root.querySelectorAll(GANTT)])) {
        if (gantts.has(el)) continue;
        const now = options.now ?? (() => Date.now());
        /** @type {GanttModel} */
        const c = {
            el,
            zone: options.timeZone ?? el.dataset.kpTimeZone ?? CHART_TIME_ZONE,
            now,
            strings: resolveStrings(options.strings),
            ...(options.decorate ? { decorate: options.decorate } : {}),
            base: Math.floor(now() / 1000),
            span: 21_600,
            live: el.dataset.kpGanttLive !== 'false',
            to: 0,
            runs: [],
            lanesGiven: [],
            lanes: [],
            bars: new Map(),
            states: new Map(),
            state: 'ready',
            active: null,
            selected: null,
            body: el,
            scroll: el,
            axis: el,
            plot: el,
            lines: el,
            nowLine: el,
            brushBox: el,
            selectBox: el,
            stateLine: el,
            announcer: el,
            ranges: el,
            liveButton: /** @type {HTMLButtonElement} */ (/** @type {unknown} */ (el)),
            selection: el,
            selectionText: el,
            ticks: new Map(),
            legend: el,
            days: el.hasAttribute('data-kp-gantt-days'),
            dayStop: null,
            points: [],
            pointEls: new Map(),
            kinds: [],
            zones: [],
            fit: false,
            line: el.classList.contains('kp-gantt--line'),
            ghosts: [],
            held: null,
            busy: null,
            leaving: null,
            drawn: false,
            timer: 0,
            observer: null,
            drag: null,
            dragMoved: false,
            tickKey: '',
        };
        gantts.set(el, c);
        build(c);
        c.to = windowOf({ ...c, live: true }).end;
        void import('./segmented.js').then((m) => m.attachSegmented(c.ranges));
        void import('./hovercard.js').then((m) => m.attachHoverCards(el.ownerDocument));
        paint(c);
        tick(c);
        // What the first frame shows is the page, not news: a busy card laid before it is painted does not arrive.
        window.requestAnimationFrame(() => (c.drawn = true));

        /** @param {Event} event */
        const barOf = (event) =>
            event.target instanceof Element
                ? /** @type {HTMLButtonElement | null} */ (event.target.closest('.kp-gantt__run, .kp-gantt__point'))
                : null;
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const bar = barOf(event);
            if (bar && bar.dataset.kpId && bar.classList.contains('kp-gantt__point')) {
                if (c.dragMoved) return;
                const point = c.points.find((p) => p.id === bar.dataset.kpId);
                if (!point) return;
                c.active = point.id;
                syncTabStops(c);
                // A mark with a count opens with every point it stands for.
                const lane = c.lanes.find((l) => l.points.includes(bar));
                const at = lane ? lane.points.indexOf(bar) : -1;
                const together = [point];
                if (lane && bar.hasAttribute('data-kp-cluster'))
                    for (const next of lane.points.slice(at + 1)) {
                        if (!next.hasAttribute('data-kp-clustered')) break;
                        const p = c.points.find((q) => q.id === next.dataset.kpId);
                        if (p) together.push(p);
                    }
                el.dispatchEvent(
                    new CustomEvent(GANTT_OPEN_EVENT, {
                        bubbles: true,
                        detail: { id: point.id, point, points: together, source: event.detail === 0 ? 'keyboard' : 'pointer' },
                    }),
                );
                return;
            }
            if (bar && bar.dataset.kpId) {
                if (c.dragMoved) return;
                const run = c.runs.find((r) => r.id === bar.dataset.kpId);
                if (!run) return;
                c.active = run.id;
                syncTabStops(c);
                el.dispatchEvent(
                    new CustomEvent(GANTT_OPEN_EVENT, {
                        bubbles: true,
                        detail: { id: run.id, run, source: event.detail === 0 ? 'keyboard' : 'pointer' },
                    }),
                );
                return;
            }
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            if (!button) return;
            if (button === c.liveButton) {
                setLive(c, !c.live);
            } else if (button.hasAttribute('data-kp-gantt-day')) {
                const day = button.dataset.kpGanttDay ?? '';
                c.dayStop = day;
                const bounds = dayBounds(c, day);
                const lift = button.getAttribute('aria-pressed') === 'true';
                setGanttSelection(el, lift ? null : bounds);
                el.dispatchEvent(
                    new CustomEvent(GANTT_SELECT_EVENT, {
                        bubbles: true,
                        detail: lift ? { from: null, to: null, source: 'clear' } : { ...bounds, source: 'day', day },
                    }),
                );
            } else if (button.hasAttribute('data-kp-gantt-clear')) {
                setGanttSelection(el, null);
                el.dispatchEvent(new CustomEvent(GANTT_SELECT_EVENT, { bubbles: true, detail: { from: null, to: null, source: 'clear' } }));
            } else if (button.hasAttribute('data-kp-gantt-zoom') && c.selected) {
                const { from, to } = c.selected;
                c.span = Math.max(60, (to - from) / 1000);
                c.live = false;
                c.to = rel(c, to);
                c.selected = null;
                freshWindow(c);
                announceWindow(c, 'zoom');
            }
        };
        /** @param {Event} event */
        const onRange = (event) => {
            const value = /** @type {CustomEvent} */ (event).detail?.value;
            if (value === 'all') {
                c.fit = true;
                c.live = false;
                freshWindow(c);
                announceWindow(c, 'range');
                return;
            }
            const seconds = typeof value === 'string' ? rangeSeconds(value) : Number.NaN;
            if (!Number.isFinite(seconds)) return;
            c.fit = false;
            c.span = seconds;
            if (!c.live) c.to = Math.max(c.to, rel(c, c.now()));
            freshWindow(c);
            announceWindow(c, 'range');
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const dayButton = event.target instanceof HTMLButtonElement && event.target.hasAttribute('data-kp-gantt-day') ? event.target : null;
            if (dayButton && !(event.altKey || event.ctrlKey || event.metaKey)) {
                const buttons = /** @type {HTMLButtonElement[]} */ ([
                    ...c.axis.querySelectorAll('button[data-kp-gantt-day]:not([data-kp-gantt-crowded])'),
                ]);
                const at = buttons.indexOf(dayButton);
                const rtl = getComputedStyle(c.axis).direction === 'rtl';
                const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
                const to =
                    event.key === 'Home'
                        ? buttons[0]
                        : event.key === 'End'
                          ? buttons[buttons.length - 1]
                          : step
                            ? buttons[Math.min(buttons.length - 1, Math.max(0, at + step))]
                            : undefined;
                if (!to) return;
                event.preventDefault();
                c.dayStop = to.dataset.kpGanttDay ?? null;
                syncDays(c);
                to.focus();
                return;
            }
            const bar = barOf(event);
            if (!bar || event.altKey || event.ctrlKey || event.metaKey) return;
            const lanes = reachableLanes(c);
            const laneIndex = lanes.findIndex((l) => l.includes(bar));
            const lane = lanes[laneIndex];
            if (!lane) return;
            const at = lane.indexOf(bar);
            /** @type {HTMLElement | undefined} */
            let to;
            if (event.key === 'ArrowRight') to = lane[Math.min(lane.length - 1, at + 1)];
            else if (event.key === 'ArrowLeft') to = lane[Math.max(0, at - 1)];
            else if (event.key === 'Home') to = lane[0];
            else if (event.key === 'End') to = lane[lane.length - 1];
            else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const next = lanes[laneIndex + (event.key === 'ArrowDown' ? 1 : -1)];
                if (next) {
                    const startOf = (/** @type {HTMLElement} */ b) => Number.parseFloat(b.style.getPropertyValue('--kp-g-s'));
                    const mine = startOf(bar);
                    to = next.reduce(
                        (best, b) => (Math.abs(startOf(b) - mine) < Math.abs(startOf(best) - mine) ? b : best),
                        /** @type {HTMLElement} */ (next[0]),
                    );
                }
            }
            if (!to) return;
            event.preventDefault();
            focusBar(c, to);
        };

        // The brush: a drag across the plot selects a range; a click without a drag is the bar's.
        /** @param {PointerEvent} event */
        const plotX = (event) => event.clientX - c.plot.getBoundingClientRect().left;
        /** @param {number} x @returns {number} epoch ms */
        const timeAt = (x) => {
            const w = windowOf(c);
            const width = c.plot.clientWidth || 1;
            return (w.from + (Math.min(Math.max(x, 0), width) / width) * c.span + c.base) * 1000;
        };
        /** @param {PointerEvent} event */
        const onDown = (event) => {
            // A dated line has no brush: it is read, not searched [kpadopt4].
            if (event.button !== 0 || c.state === 'loading' || c.line) return;
            const x = plotX(event);
            if (x < 0 || x > c.plot.clientWidth) return;
            c.drag = { a: x, b: x };
            c.dragMoved = false;
        };
        /** @param {PointerEvent} event */
        const onMove = (event) => {
            if (!c.drag) return;
            c.drag.b = plotX(event);
            if (!c.dragMoved && Math.abs(c.drag.b - c.drag.a) > 6) {
                c.dragMoved = true;
                c.scroll.setPointerCapture(event.pointerId);
            }
            if (!c.dragMoved) return;
            const lo = Math.min(c.drag.a, c.drag.b);
            c.brushBox.hidden = false;
            c.brushBox.style.setProperty('--kp-g-x', `${lo}px`);
            c.brushBox.style.setProperty('--kp-g-w', `${Math.abs(c.drag.b - c.drag.a)}px`);
        };
        const endDrag = (/** @type {boolean} */ commit) => {
            const d = c.drag;
            c.drag = null;
            c.brushBox.hidden = true;
            if (d && commit && c.dragMoved) {
                const from = timeAt(Math.min(d.a, d.b));
                const to = timeAt(Math.max(d.a, d.b));
                c.selected = { from, to };
                paintSelection(c);
                el.dispatchEvent(new CustomEvent(GANTT_SELECT_EVENT, { bubbles: true, detail: { from, to, source: 'brush' } }));
            }
            // The click that follows a drag is not a click on a bar.
            if (c.dragMoved) window.setTimeout(() => (c.dragMoved = false), 0);
        };
        const onUp = () => endDrag(true);
        const onCancel = () => endDrag(false);

        c.ranges.addEventListener('kp-segmented-change', onRange);
        el.addEventListener('click', onClick);
        el.addEventListener('keydown', onKey);
        c.scroll.addEventListener('pointerdown', onDown);
        c.scroll.addEventListener('pointermove', onMove);
        c.scroll.addEventListener('pointerup', onUp);
        c.scroll.addEventListener('pointercancel', onCancel);
        c.timer = window.setInterval(() => tick(c), GANTT_TICK_MS);
        if (typeof ResizeObserver !== 'undefined') {
            let last = 0;
            c.observer = new ResizeObserver(() => {
                const width = c.plot.clientWidth;
                if (width === last) return;
                last = width;
                c.tickKey = '';
                tick(c);
                roomForWords(c);
            });
            c.observer.observe(c.plot);
        }
        undo.push(() => {
            c.ranges.removeEventListener('kp-segmented-change', onRange);
            el.removeEventListener('click', onClick);
            el.removeEventListener('keydown', onKey);
            c.scroll.removeEventListener('pointerdown', onDown);
            c.scroll.removeEventListener('pointermove', onMove);
            c.scroll.removeEventListener('pointerup', onUp);
            c.scroll.removeEventListener('pointercancel', onCancel);
            window.clearInterval(c.timer);
            c.observer?.disconnect();
            gantts.delete(el);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}

/** A new window: lanes may need fewer rows again, the axis starts over. @param {GanttModel} c */
function freshWindow(c) {
    for (const lane of c.lanes) lane.rows = 1;
    c.held = null;
    c.tickKey = '';
    paint(c);
    tick(c);
    paintSelection(c);
}

/** @param {GanttModel} c @param {boolean} live */
function setLive(c, live) {
    if (live === c.live) return;
    c.live = live;
    // Following now leaves the fitted window; the first range that is a length takes its place [kpadopt4].
    if (live && c.fit) {
        c.fit = false;
        const first = [...c.ranges.querySelectorAll('[data-value]')]
            .map((b) => /** @type {HTMLElement} */ (b).dataset.value ?? '')
            .find((w) => w !== 'all');
        if (first) {
            c.span = rangeSeconds(first);
            void import('./segmented.js').then((m) => m.setSegmentedValues(c.ranges, [first]));
        }
    }
    if (!live) c.to = windowOf({ ...c, live: true }).end;
    freshWindow(c);
    announceWindow(c, 'live');
}

/**
 * The runs and the lanes. Repaints in place, by id: a bar that is still there
 * keeps its node, its focus and its row, so a live update never moves a
 * reader. A timeline that was loading is ready from here on. `lanes` may be
 * left out: a run's `lane` is then its own label, in the order first seen.
 * @param {Element} el
 * @param {GanttRun[]} runs
 * @param {GanttLane[]} [lanes]
 */
export function setGanttRuns(el, runs, lanes) {
    const c = gantts.get(el);
    if (!c) return;
    c.runs = runs;
    if (lanes) c.lanesGiven = lanes;
    if (c.state === 'loading' || c.state === 'empty') c.state = 'ready';
    paint(c);
    tick(c);
}

/**
 * The timeline as a whole: `loading` (ghost lanes at their final size),
 * `ready`, `empty` or `error` (`words` over the plot).
 * @param {Element} el
 * @param {GanttState} state
 * @param {string} [words]
 */
export function setGanttState(el, state, words = '') {
    const c = gantts.get(el);
    if (!c) return;
    c.state = state;
    c.stateLine.dataset.kpWords = words;
    paint(c);
}

/**
 * Set the window; no event, the page asked. `span` in seconds; `live: false`
 * with `to` (epoch ms) holds the window there.
 * @param {Element} el
 * @param {{ span?: number, live?: boolean, to?: number }} window
 */
export function setGanttWindow(el, window) {
    const c = gantts.get(el);
    if (!c) return;
    if (window.span !== undefined) {
        c.span = window.span;
        c.fit = false;
    }
    if (window.live !== undefined) c.live = window.live;
    if (window.to !== undefined) c.to = rel(c, window.to);
    else if (!c.live) c.to = windowOf({ ...c, live: true }).end;
    c.liveButton.setAttribute('aria-pressed', String(c.live));
    c.el.dataset.kpGanttLive = String(c.live);
    const match = [...c.ranges.querySelectorAll('[data-value]')].find(
        (b) => rangeSeconds(/** @type {HTMLElement} */ (b).dataset.value ?? '') === c.span,
    );
    void import('./segmented.js').then((m) => m.setSegmentedValues(c.ranges, match ? [/** @type {HTMLElement} */ (match).dataset.value ?? ''] : []));
    freshWindow(c);
}

/**
 * Show a selected range (epoch ms) or none (null); no event, the page asked.
 * @param {Element} el
 * @param {{ from: number, to: number } | null} selection
 */
export function setGanttSelection(el, selection) {
    const c = gantts.get(el);
    if (!c) return;
    c.selected = selection;
    paintSelection(c);
}

/**
 * Name the series of the runs in the legend, after the states [kpadopt3]: a swatch in the series' colour and its words per
 * entry, in the order given; none takes them away again. The states stay as they are.
 * @param {Element} el
 * @param {GanttLegendEntry[]} entries
 */
export function setGanttLegend(el, entries) {
    const c = gantts.get(el);
    if (!c) return;
    const doc = c.el.ownerDocument;
    for (const old of c.legend.querySelectorAll(':scope > .kp-gantt__legend-series')) old.remove();
    for (const { series, label } of entries) {
        const li = make(doc, 'li', 'kp-gantt__legend-series');
        const swatch = make(doc, 'span', 'kp-gantt__swatch');
        swatch.dataset.kpState = 'ok';
        swatch.dataset.kpSeries = String(series);
        swatch.setAttribute('aria-hidden', 'true');
        li.append(swatch, make(doc, 'span', '', label));
        c.legend.append(li);
    }
}

/**
 * The moments on the timeline [kpadopt4]: each point a mark in its lane, in the colour and shape of its kind. Repaints in
 * place, by id, as setGanttRuns does; a timeline that was loading is ready from here on. `lanes` may be left out, as there.
 * @param {Element} el
 * @param {GanttPoint[]} points
 * @param {GanttLane[]} [lanes]
 */
export function setGanttPoints(el, points, lanes) {
    const c = gantts.get(el);
    if (!c) return;
    c.points = points;
    if (lanes) c.lanesGiven = lanes;
    if (c.state === 'loading' || c.state === 'empty') c.state = 'ready';
    paint(c);
    tick(c);
}

/**
 * The kinds of the points, named in the legend in the order given [kpadopt4]: `shape` (`dot` by default, `diamond`,
 * `square`, `triangle`, `ring`) and a colour, `series` 1 to 5 (`--chart-N`) or `tone`. A timeline with points and no runs
 * leaves the run states out of its legend.
 * @param {Element} el
 * @param {GanttKind[]} kinds
 */
export function setGanttKinds(el, kinds) {
    const c = gantts.get(el);
    if (!c) return;
    c.kinds = kinds;
    paint(c);
}

/**
 * The stretches under the marks [kpadopt4]: with `lane`, a thin band in that lane (waiting since the last contact); without,
 * a band behind every lane (the days a follow-up is due), named in the legend. `tone` `warning` (default), `info`, `muted`.
 * @param {Element} el
 * @param {GanttZone[]} zones
 */
export function setGanttZones(el, zones) {
    const c = gantts.get(el);
    if (!c) return;
    c.zones = zones;
    paint(c);
}
