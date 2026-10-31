// Zones, the legend and the chrome around the plot.
import { make, toMs } from './constants.js';
import { rel } from './scale.js';
/** @typedef {import('./constants.js').GanttLaneModel} GanttLaneModel */
/** @typedef {import('./constants.js').GanttModel} GanttModel */

/**
 * The stretches under the marks [kpadopt4]: a lane's own as a thin band in its track, the whole plot's as a band behind
 * every lane, named in the legend. Drawn again on every paint; they hold no focus.
 * @param {GanttModel} c @param {GanttLaneModel[]} lanes
 */
export function paintZones(c, lanes) {
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
/**
 * The legend's states and the legend as a whole: the states go when there are no runs [kpadopt4], when the timeline asks for none
 * (`data-kp-gantt-legend="off"`) and, for `planned`, when no run is planned; a legend with nothing left is not drawn [gaps-time-1019].
 * @param {GanttModel} c
 */
export function syncLegend(c) {
    const runless = c.runs.length === 0 && (c.points.length > 0 || c.kinds.length > 0);
    const off = c.el.getAttribute('data-kp-gantt-legend') === 'off';
    const planned = c.runs.some((run) => run.state === 'planned');
    const only = legendStates(c);
    for (const li of /** @type {NodeListOf<HTMLElement>} */ (c.legend.querySelectorAll(':scope > .kp-gantt__legend-state'))) {
        const state = li.firstElementChild?.getAttribute('data-kp-state') ?? '';
        li.hidden = runless || off || (only === null ? state === 'planned' && !planned : !only.has(state));
    }
    c.legend.hidden = [...c.legend.children].every((li) => /** @type {HTMLElement} */ (li).hidden);
}
/**
 * The states the legend is limited to [wish-1028, Kitchen 1], or null for all of them: `data-kp-gantt-legend="auto"` is the states the
 * runs use now; a list ("ok running planned") is those states, whether a run uses them or not.
 * @param {GanttModel} c
 * @returns {Set<string> | null}
 */
function legendStates(c) {
    const asked = (c.el.getAttribute('data-kp-gantt-legend') ?? '').trim().toLowerCase();
    if (asked === 'auto') return new Set(c.runs.map((run) => run.state));
    if (asked === '' || asked === 'off' || asked === 'all') return null;
    const names = asked.split(/[\s,]+/).filter((name) => ['ok', 'failed', 'running', 'queued', 'planned'].includes(name));
    return names.length ? new Set(names) : null;
}
/**
 * The toolbar, the legend and the hint as the options ask [gaps-time-1019]; drawn again when an option changes.
 * @param {GanttModel} c
 */
export function paintChrome(c) {
    const bare = c.el.getAttribute('data-kp-gantt-toolbar') === 'off';
    c.el.toggleAttribute('data-kp-gantt-bare', bare);
    // The range buttons and Live are not in the way of a screen reader or the keyboard either; a selection the page makes (a day
    // button, setGanttSelection) still shows its chip in the toolbar's place.
    c.ranges.toggleAttribute('hidden', bare);
    c.liveButton.toggleAttribute('hidden', bare);
    syncLegend(c);
    const hint = /** @type {HTMLElement | null} */ (c.el.querySelector(':scope > .kp-gantt__hint'));
    if (hint) {
        hint.hidden = c.el.getAttribute('data-kp-gantt-hint') === 'off';
        hint.textContent = c.el.hasAttribute('data-kp-gantt-points')
            ? c.strings.ganttPointsHint
            : bare
              ? c.strings.ganttHintOpen
              : c.strings.ganttHint;
    }
}
/** The kinds and the plot's stretches in the legend, after the states; the states go when there are no runs [kpadopt4]. @param {GanttModel} c */
export function paintKinds(c) {
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
    syncLegend(c);
}
