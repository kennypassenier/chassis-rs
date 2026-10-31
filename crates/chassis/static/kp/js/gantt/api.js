// The setters a page calls to fill the timeline.
import { gantts, make } from './constants.js';
import { paint } from './paint.js';
import { paintSelection, tick } from './selection.js';
import { rangeSeconds, rel } from './scale.js';
import { windowOf } from './window.js';
import { freshWindow } from './model.js';
import { syncLegend } from './chrome.js';
/** @typedef {import('./constants.js').GanttKind} GanttKind */
/** @typedef {import('./constants.js').GanttLane} GanttLane */
/** @typedef {import('./constants.js').GanttLegendEntry} GanttLegendEntry */
/** @typedef {import('./constants.js').GanttPoint} GanttPoint */
/** @typedef {import('./constants.js').GanttRun} GanttRun */
/** @typedef {import('./constants.js').GanttState} GanttState */
/** @typedef {import('./constants.js').GanttZone} GanttZone */

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
    if (c.state === 'loading' || c.state === 'empty' || c.state === 'error') c.state = 'ready';
    paint(c);
    tick(c);
}
/**
 * The timeline as a whole: `loading` (ghost lanes at their final size),
 * `ready`, `empty` or `error`. An empty or failed timeline is the package's state plate over the whole plot (`words` its
 * heading, `text` its sentence, `art` a picture over the heading), an error with a Retry that fires `kp-gantt-retry`
 * [state-plates-1019].
 * @param {Element} el
 * @param {GanttState} state
 * @param {string} [words]
 * @param {{ text?: string, art?: Node | string | null }} [plate]
 */
export function setGanttState(el, state, words = '', { text = '', art = null } = {}) {
    const c = gantts.get(el);
    if (!c) return;
    c.state = state;
    c.stateLine.dataset.kpWords = words;
    c.plateText = text;
    c.plateArt = art;
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
    void import('../segmented.js').then((m) => m.setSegmentedValues(c.ranges, match ? [/** @type {HTMLElement} */ (match).dataset.value ?? ''] : []));
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
    syncLegend(c);
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
    if (c.state === 'loading' || c.state === 'empty' || c.state === 'error') c.state = 'ready';
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
