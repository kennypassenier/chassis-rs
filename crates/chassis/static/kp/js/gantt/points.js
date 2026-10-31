// Lane labels and the single points on the axis, clustered when close.
import { dayKey, formatDayKey } from '../calendar.js';
import { CLUSTER_PLATE_PX, CLUSTER_PX, keyOf, make, toMs } from './constants.js';
import { clock, rel } from './scale.js';
/** @typedef {import('./constants.js').GanttLane} GanttLane */
/** @typedef {import('./constants.js').GanttLaneModel} GanttLaneModel */
/** @typedef {import('./constants.js').GanttModel} GanttModel */
/** @typedef {import('./constants.js').GanttPoint} GanttPoint */

/**
 * A lane's name: a link when the lane has `href`, and a second line when it has `sub` [kpadopt4].
 * @param {GanttModel} c @param {HTMLElement} label @param {GanttLane} lane
 */
export function fillLaneLabel(c, label, lane) {
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
export function paintPoints(c, lanes) {
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
export function clusterPoints(c) {
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
