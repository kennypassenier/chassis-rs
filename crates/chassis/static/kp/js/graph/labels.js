// Pure label and edge geometry: arrows, bends and label fitting.
/** @typedef {import('./options.js').GraphEdge} GraphEdge */

/**
 * The arrowhead of a link [graph-1020]: a triangle whose tip stands `clear` px short of the node at the link's end, turned to
 * follow the curve there. The link is the quadratic curve `from`, `bend`, `to`. `at: 'from'` puts it at the other end.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} bend
 * @param {{ x: number, y: number }} to
 * @param {number} clear  how far from the end node's centre the tip stands (its radius and a gap)
 * @param {number} [size]
 * @returns {string} the `d` of the head
 */
export function graphArrow(from, bend, to, clear, size = 9) {
    const at = (/** @type {number} */ t) => ({
        x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * bend.x + t * t * to.x,
        y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * bend.y + t * t * to.y,
    });
    // The curve is shortened to where it is `clear` from the end (the distance falls along the way, so a bisection finds it).
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
        const mid = (lo + hi) / 2;
        const p = at(mid);
        if (Math.hypot(p.x - to.x, p.y - to.y) > clear) lo = mid;
        else hi = mid;
    }
    const t = lo;
    const tip = at(t);
    let dx = 2 * (1 - t) * (bend.x - from.x) + 2 * t * (to.x - bend.x);
    let dy = 2 * (1 - t) * (bend.y - from.y) + 2 * t * (to.y - bend.y);
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const bx = tip.x - dx * size;
    const by = tip.y - dy * size;
    const w = size * 0.45;
    const f = (/** @type {number} */ n) => n.toFixed(1);
    return `M${f(tip.x)},${f(tip.y)} L${f(bx - dy * w)},${f(by + dx * w)} L${f(bx + dy * w)},${f(by - dx * w)} Z`;
}
/**
 * Each edge's bend: edges between the same two nodes fan out (0, +26, −26,
 * +52 …) so two kinds never draw on top of each other.
 * @param {GraphEdge[]} edges
 * @returns {number[]}
 */
export function graphBends(edges) {
    /** @type {Map<string, number>} */
    const seen = new Map();
    return edges.map((e) => {
        const key = [e.from, e.to].sort().join('\u0000');
        const k = seen.get(key) ?? 0;
        seen.set(key, k + 1);
        if (k === 0) return 0;
        const size = Math.ceil(k / 2) * 26;
        return size * (k % 2 ? 1 : -1) * (e.from < e.to ? 1 : -1);
    });
}
/**
 * A label kept to `length` letters: the whole name, or its first letters and
 * an ellipsis (`Pump h…`).
 * @param {string} full
 * @param {number} length
 * @returns {string}
 */
export const graphLabelText = (full, length) => (length >= full.length ? full : `${full.slice(0, length).trimEnd()}…`);
/**
 * @typedef {{ full: string, length: number }} GraphLabel
 * @typedef {{ x: number, y: number, width: number, height: number }} GraphBox
 */

/**
 * Shorten labels until each lies inside the W×H box and no two touch: the
 * longer of two that touch loses a letter, an ellipsis marks the cut, and the
 * full name stays in the node's title and accessible name. `measure(label)`
 * gives the box of the label as `graphLabelText(label.full, label.length)`
 * draws it; each label's `length` is shortened in place.
 * @template {GraphLabel} L
 * @param {L[]} labels
 * @param {number} W
 * @param {number} H
 * @param {(label: L) => GraphBox} measure
 */
export function fitGraphLabels(labels, W, H, measure) {
    // The halo (a 4 px stroke) reaches up to 3 px past each box as drawn:
    // keep that much and one more from the edge, and twice that and one
    // more between two labels.
    const pad = 4;
    for (const l of labels) {
        let b = measure(l);
        while (l.length > 1 && (b.x < pad || b.x + b.width > W - pad || b.y < pad || b.y + b.height > H - pad)) {
            l.length -= 1;
            b = measure(l);
        }
    }
    const gap = 7;
    for (let guard = 0; guard < 2000; guard += 1) {
        const boxes = labels.map(measure);
        let found = false;
        outer: for (let i = 0; i < labels.length; i += 1) {
            for (let j = i + 1; j < labels.length; j += 1) {
                const a = boxes[i];
                const b = boxes[j];
                const touch = a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
                if (!touch) continue;
                const longer = labels[i].length >= labels[j].length ? labels[i] : labels[j];
                const other = longer === labels[i] ? labels[j] : labels[i];
                const victim = longer.length > 1 ? longer : other.length > 1 ? other : null;
                if (!victim) continue;
                victim.length -= 1;
                found = true;
                break outer;
            }
        }
        if (!found) break;
    }
}
