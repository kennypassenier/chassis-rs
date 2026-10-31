// The model of one run timeline, and the moves of its window that every part asks for.
import { CHART_TIME_ZONE } from '../chart.js';
import { resolveStrings } from '../strings.js';
import { paint } from './paint.js';
import { announceWindow, paintSelection, tick } from './selection.js';
import { rangeSeconds } from './scale.js';
import { windowOf } from './window.js';
/** @typedef {import('./constants.js').GanttModel} GanttModel */
/** @typedef {import('./constants.js').GanttOptions} GanttOptions */

/** The window a new timeline shows, in seconds: six hours. */
const DEFAULT_SPAN_S = 21_600;

/**
 * The model of a timeline not drawn yet: every part points at the element until build() lays the real ones.
 * @param {HTMLElement} el
 * @param {GanttOptions} options
 * @returns {GanttModel}
 */
export function newModel(el, options) {
    const now = options.now ?? (() => Date.now());
    return {
        el,
        zone: options.timeZone ?? el.dataset.kpTimeZone ?? CHART_TIME_ZONE,
        now,
        strings: resolveStrings(options.strings),
        ...(options.decorate ? { decorate: options.decorate } : {}),
        base: Math.floor(now() / 1000),
        span: DEFAULT_SPAN_S,
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
        plate: el,
        plateKey: '',
        plateText: '',
        plateArt: null,
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
        labels: new Map(),
        outside: new Map(),
    };
}
/** A new window: lanes may need fewer rows again, the axis starts over. @param {GanttModel} c */
export function freshWindow(c) {
    for (const lane of c.lanes) lane.rows = 1;
    c.held = null;
    c.tickKey = '';
    paint(c);
    tick(c);
    paintSelection(c);
}
/** @param {GanttModel} c @param {boolean} live */
export function setLive(c, live) {
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
            void import('../segmented.js').then((m) => m.setSegmentedValues(c.ranges, [first]));
        }
    }
    if (!live) c.to = windowOf({ ...c, live: true }).end;
    freshWindow(c);
    announceWindow(c, 'live');
}
