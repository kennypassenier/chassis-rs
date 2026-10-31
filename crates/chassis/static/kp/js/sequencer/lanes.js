// Paints the lanes and places elements in them.
import { make, px } from './instance.js';
import { round } from './units.js';
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./units.js').SequencerLane} SequencerLane */
/** @typedef {import('./instance.js').SequencerModel} SequencerModel */

/** @param {SequencerModel} c @param {SequencerItem} item */
export function seriesOf(c, item) {
    const at = c.lanes.findIndex((l) => l.id === item.lane);
    return item.series ?? /** @type {1 | 2 | 3 | 4 | 5} */ ((Math.max(0, at) % 5) + 1);
}
/** The lanes the page gave, plus a lane for every item's lane that none names. @param {SequencerModel} c @param {SequencerLane[]} given */
export function lanesFor(c, given) {
    /** @type {SequencerLane[]} */
    const lanes = given.map((l) => ({ id: String(l.id), label: String(l.label ?? l.id) }));
    for (const item of c.items) if (!lanes.some((l) => l.id === item.lane)) lanes.push({ id: item.lane, label: item.lane });
    return lanes;
}
/** Draw the lanes (names and tracks) when they changed. @param {SequencerModel} c */
export function paintLanes(c) {
    const doc = c.el.ownerDocument;
    const ghostOnly = c.lanes.length === 0 && c.state === 'loading';
    const key = ghostOnly ? 'ghost' : JSON.stringify(c.lanes.map((l) => [l.id, l.label, c.rows.counts.get(l.id) ?? 1]));
    if (key !== c.laneKey) {
        c.laneKey = key;
        for (const e of c.laneEls.splice(0)) e.remove();
        /** @type {{ id: string, label: string, rows: number, ghost: boolean }[]} */
        const spec = ghostOnly
            ? (c.el.dataset.kpSequencerGhosts ?? '1 1 1')
                  .split(/\s+/)
                  .map((n, i) => ({ id: `g${i}`, label: '', rows: Math.max(1, Math.min(6, Number.parseInt(n, 10) || 1)), ghost: true }))
            : c.lanes.map((l) => ({ id: l.id, label: l.label, rows: c.rows.counts.get(l.id) ?? 1, ghost: false }));
        spec.forEach((lane, i) => {
            const name = make(doc, 'div', `kp-gantt__lane${lane.ghost ? ' kp-gantt__ghost' : ''}`);
            const track = make(doc, 'div', `kp-gantt__track kp-sequencer__track${lane.ghost ? ' kp-gantt__ghost' : ''}`);
            for (const e of [name, track]) {
                e.style.setProperty('grid-row', String(i + 2));
                if (lane.ghost) e.setAttribute('aria-hidden', 'true');
            }
            if (lane.ghost) {
                name.append(make(doc, 'span', 'kp-skeleton'));
                const shapes = [
                    [0.08, 0.2, 0.52],
                    [0.3, 0.28],
                    [0.14, 0.1, 0.6],
                ];
                (shapes[i % shapes.length] ?? []).forEach((at, k) => {
                    const piece = make(doc, 'span', 'kp-gantt__run kp-skeleton');
                    piece.style.setProperty('--kp-g-row', String(k % lane.rows));
                    piece.style.setProperty('--kp-g-at', String(at));
                    piece.style.setProperty('--kp-g-width', String(0.05 + ((i + k) % 3) * 0.05));
                    track.append(piece);
                });
            } else {
                name.append(make(doc, 'span', '', lane.label));
                name.dataset.kpLane = lane.id;
            }
            track.style.setProperty('--kp-g-rows', String(lane.rows));
            c.body.insertBefore(name, c.lines);
            c.body.insertBefore(track, c.lines);
            c.laneEls.push(name, track);
        });
        c.body.style.setProperty('--kp-g-lanes', String(Math.max(1, spec.length)));
    }
}
/** Where each lane starts, in px from the top of the bars' layer. @param {SequencerModel} c */
export function measureLanes(c) {
    const tracks = /** @type {HTMLElement[]} */ (c.laneEls.filter((e) => e.classList.contains('kp-gantt__track')));
    c.rowPx = c.probe.offsetHeight || 28;
    c.padPx = c.probe.offsetWidth || 4;
    const origin = c.layer.getBoundingClientRect().top;
    c.laneTops = tracks.map((t, i) => ({ id: c.lanes[i]?.id ?? '', top: t.getBoundingClientRect().top - origin }));
}
/** @param {HTMLElement} el @param {string} name @param {string} value */
export function setProp(el, name, value) {
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}
/** The place of one bar: custom properties only. @param {SequencerModel} c @param {HTMLElement} el @param {SequencerItem} item @param {number} row */
export function place(c, el, item, row) {
    const top = c.laneTops.find((l) => l.id === item.lane)?.top ?? 0;
    setProp(el, '--kp-g-s', String(item.start));
    setProp(el, '--kp-g-e', String(round(item.start + item.duration)));
    setProp(el, '--kp-tl-top', px(top));
    setProp(el, '--kp-tl-line', String(row));
}
