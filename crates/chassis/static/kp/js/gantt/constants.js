// The attribute names, events and fixed sizes of the run timeline.

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
/** Fired on the timeline, bubbling, when the Retry of its failed state is pressed [state-plates-1019]. */
export const GANTT_RETRY_EVENT = 'kp-gantt-retry';
/** The steps an axis chooses from, in seconds. */
export const GANTT_STEPS = Object.freeze([60, 300, 900, 1800, 3600, 10_800, 21_600, 43_200, 86_400, 172_800, 604_800, 1_209_600, 2_419_200]);
/** A week step and longer starts on a Monday: 1970-01-05, in seconds [kpadopt4]. */
export const MONDAY = 345_600;
/** Point marks closer than this, in px, are one mark with a count [kpadopt4]. */
export const CLUSTER_PX = 14;
/** The room a count plate takes after its mark, in px [kpadopt4]. */
export const CLUSTER_PLATE_PX = 24;
/**
 * @typedef {'queued' | 'running' | 'ok' | 'failed' | 'planned'} GanttRunState
 * @typedef {object} GanttRun
 * @property {string} id what the page calls the run; reported by `kp-gantt-open`
 * @property {string} lane the lane's id
 * @property {string} label what the run is, one line
 * @property {number | string} start epoch ms or an ISO string; for a queued run, the moment it was queued; for a planned run, when it is to begin
 * @property {number | string | null} [end] when it ended, or for a planned run when it is to end; ignored for a queued or running run
 * @property {GanttRunState} state
 * @property {string} [detail] more words for the hover card
 * @property {number | string | null} [plannedEnd] a running run's planned end (epoch ms or an ISO string): the time it still has is drawn after now [wish-1028]
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
 * @typedef {import('../strings.js').Strings} Strings
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
 *   stateLine: HTMLElement, plate: HTMLElement, plateKey: string, plateText: string, plateArt: Node | string | null, announcer: HTMLElement, ranges: HTMLElement, liveButton: HTMLButtonElement,
 *   selection: HTMLElement, selectionText: HTMLElement, ticks: Map<number, { label: HTMLElement, line: HTMLElement }>,
 *   legend: HTMLElement, days: boolean, dayStop: string | null,
 *   points: GanttPoint[], pointEls: Map<string, HTMLButtonElement>, kinds: GanttKind[], zones: GanttZone[], fit: boolean, line: boolean,
 *   ghosts: HTMLElement[], held: number | null, busy: import('../busy-card.js').BusyCard | null, leaving: Promise<void> | null, drawn: boolean, timer: number, observer: ResizeObserver | null, drag: { a: number, b: number } | null, dragMoved: boolean, tickKey: string, labels: Map<HTMLElement, { key: string, width: number }>, outside: Map<HTMLElement, HTMLElement> }} GanttModel
 */

/** The timelines whose own sideways scroll has been put at the live end once [wish-1028]. @type {WeakSet<Element>} */
export const OPENED = new WeakSet();
/** @type {WeakMap<Element, GanttModel>} */
export const gantts = new WeakMap();
/** Two digits. @param {number} n */
export const two = (n) => String(n).padStart(2, '0');
/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};
/** @param {number | string} when @returns {number} */
export const toMs = (when) => (typeof when === 'number' ? when : Date.parse(when));
/** @param {Element} host @returns {string | undefined} */
export const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;
