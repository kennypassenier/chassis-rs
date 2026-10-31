// Pure layout: the hub, the rings and the room a graph needs.
import { radiusOf } from './instance.js';
/** @typedef {import('./labels.js').GraphBox} GraphBox */
/** @typedef {import('./options.js').GraphData} GraphData */
/** @typedef {import('./options.js').GraphNode} GraphNode */

/** @param {Element} host @returns {string | undefined} */
export const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;
/**
 * The hub: the one named, else the node with the most links.
 * @param {GraphData} data
 * @returns {string | null}
 */
export function hubOf(data) {
    if (data.hub && data.nodes.some((n) => n.id === data.hub)) return data.hub;
    /** @type {Map<string, number>} */
    const degree = new Map();
    for (const e of data.edges) {
        degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
        degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    /** @type {string | null} */
    let best = null;
    let most = -1;
    for (const node of data.nodes) {
        const d = degree.get(node.id) ?? 0;
        if (d > most) {
            most = d;
            best = node.id;
        }
    }
    return best;
}
/**
 * The ring's order: the nodes by label, then the outside ones; the first at
 * the top, clockwise.
 * @param {GraphData} data
 * @param {string | null} hub
 * @returns {GraphNode[]}
 */
export const ringOf = (data, hub) =>
    data.nodes
        .filter((n) => n.id !== hub)
        .sort((a, b) => Number(!!a.external) - Number(!!b.external) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
/**
 * @typedef {{ ring?: number, inset?: { top?: number, bottom?: number }, phase?: number, stretch?: number }} GraphLayoutOptions
 * @typedef {{ cx: number, cy: number, rx: number, ry: number }} GraphRing
 */

/**
 * The ring's centre and radii in a W×H box. `ring` is its size as a share of the box (0.36), `inset` keeps a strip at the top
 * and the bottom clear (for chrome drawn inside the picture [graph-1020]).
 * @param {number} W
 * @param {number} H
 * @param {GraphLayoutOptions} [options]
 * @returns {GraphRing}
 */
function ringGeometry(W, H, { ring = 0.36, inset, stretch = 1 } = {}) {
    const top = inset?.top ?? 0;
    const bottom = inset?.bottom ?? 0;
    const Hs = H - top - bottom;
    const cx = W / 2;
    const cy = top + Hs / 2 - 10;
    const R = Math.min(W, Hs) * ring;
    let rx = R * (W > 600 ? 1.35 : 1);
    let ry = R;
    if (W < 600) {
        rx = Math.min(rx, W * 0.24);
        ry = Math.max(ry, Hs * ring);
    }
    return { cx, cy, rx: rx * stretch, ry };
}
/**
 * Put the hub in the middle and the ring's nodes on the ellipse.
 * @param {GraphData} data
 * @param {GraphRing} geo
 * @param {number} [phase]  a turn of the ring in nodes (0.25 = a quarter of the step between two nodes); 0 is the approved look
 * @param {number} [inner]  the share of the radii every second node stands at (two rings alternating); 1 is one ring, the approved look
 * @param {number} [first]  the node that stands on the outer ring where an odd ring has two neighbours on one ring (0 is the first node)
 * @returns {Map<string, { x: number, y: number, angle: number }>}
 */
function placeRing(data, { cx, cy, rx, ry }, phase = 0, inner = 1, first = 0) {
    /** @type {Map<string, { x: number, y: number, angle: number }>} */
    const at = new Map();
    const hub = hubOf(data);
    if (hub) at.set(hub, { x: cx, y: cy, angle: Math.PI / 2 });
    const ring = ringOf(data, hub);
    ring.forEach((n, i) => {
        const angle = -Math.PI / 2 + ((i + phase) / Math.max(1, ring.length)) * Math.PI * 2;
        const k = ((i - first + ring.length) % ring.length) % 2 === 1 ? inner : 1;
        at.set(n.id, { x: cx + Math.cos(angle) * rx * k, y: cy + Math.sin(angle) * ry * k, angle });
    });
    return at;
}
/**
 * Where every node sits in a W×H box: the hub in the middle, the others on an
 * ellipse around it (stretched sideways on a wide box). On a narrow box the
 * ellipse gives up width for height, so the labels beside the ring keep room.
 * `options.ring` sizes the ring (a share of the box, 0.36) and `options.inset`
 * keeps a strip at the top or the bottom clear and `options.phase` turns the ring by a share of the step between two nodes
 * (0, the approved look, unless a page asks) [graph-1020].
 * @param {GraphData} data
 * @param {number} W
 * @param {number} H
 * @param {GraphLayoutOptions} [options]
 * @returns {Map<string, { x: number, y: number, angle: number }>}
 */
export const graphLayout = (data, W, H, options) => placeRing(data, ringGeometry(W, H, options), options?.phase ?? 0);
/**
 * The layout for names that stand whole under their nodes [graph-1020]: the ring is narrowed until every name lies inside the
 * box, and the box grows taller (up to `maxHeight`) until no name touches another or a node. Nothing is cut: the picture gets the
 * room the names need. `widthOf(node)` is the width of the node's name as drawn.
 *
 * When names so long that even the tallest picture cannot hold them on one line are given a `wrapOf(node, target)`, the same search runs
 * again with every name wider than `target` on several centred lines (`{ width, lines }`, the widest line's width) and the
 * best of the tries wins; the lines come back in `wraps` by node id. Names that fit stay on one line, so a set that cleared before
 * is drawn as it was.
 * @param {GraphData} data
 * @param {number} W
 * @param {number} H
 * @param {(node: GraphNode) => number} widthOf
 * @param {GraphLayoutOptions & { radiusOf?: (node: GraphNode) => number, line?: number, maxHeight?: number, wrapOf?: (node: GraphNode, target: number) => { width: number, lines: string[] } | null }} [options]
 * @returns {{ at: Map<string, { x: number, y: number, angle: number }>, H: number, wraps: Map<string, string[]> }}
 */
export function graphRoom(data, W, H, widthOf, { radiusOf: rOf = (n) => radiusOf(n), line = 18, maxHeight = 1400, wrapOf, ...layout } = {}) {
    const pad = 8;
    const gap = 8;
    const hub = hubOf(data);
    const ring = ringOf(data, hub);
    const nodes = [...(hub ? data.nodes.filter((n) => n.id === hub) : []), ...ring];
    const top = layout.inset?.top ?? 0;
    const bottom = layout.inset?.bottom ?? 0;
    const hits = (/** @type {GraphBox} */ a, /** @type {GraphBox} */ b) =>
        a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
    const union = (/** @type {{ circle: GraphBox, label: GraphBox }} */ { circle, label }) => {
        const x = Math.min(circle.x, label.x);
        const y = Math.min(circle.y, label.y);
        return {
            x,
            y,
            width: Math.max(circle.x + circle.width, label.x + label.width) - x,
            height: Math.max(circle.y + circle.height, label.y + label.height) - y,
        };
    };
    /**
     * One search: the widths and line counts of the names are fixed, the height and the turn of the ring are searched.
     * @param {Map<string, number>} widths
     * @param {Map<string, number>} rows
     */
    const search = (widths, rows, rings = [[1, 0]], turns = [0, 0.25, 0.5, 0.75], grow = 1.1, whole = false) => {
        let height = H;
        /** @type {{ misses: number, at: Map<string, { x: number, y: number, angle: number }>, H: number } | null} */
        let best = null;
        for (let guard = 0; guard < 40; guard += 1) {
            const geo = ringGeometry(W, height, layout);
            // The ring may be turned a quarter step at a time: two neighbours at the top or the bottom of a narrow ring stand side by side
            // on one line, and a turn lets one stand lower than the other, so the names are not on one line. The first turn that clears
            // every name wins, and 0 (the ring as it is everywhere else) is tried first.
            for (const [phase, [inner, first]] of turns.flatMap((turn) =>
                rings.map((pair) => /** @type {[number, [number, number]]} */ ([turn, pair])),
            )) {
                const sized = { ...geo };
                // The ring's width: as wide as the box allows (a narrow box gives up the sides' room for labels, since the names are
                // under the nodes now), and every name stays inside the box, whatever its place on the ring.
                let rx = W > 600 ? sized.rx : Infinity;
                for (const [i, n] of ring.entries()) {
                    const cos = Math.cos(-Math.PI / 2 + ((i + phase) / Math.max(1, ring.length)) * Math.PI * 2);
                    const half = Math.max((widths.get(n.id) ?? 0) / 2, rOf(n)) + pad;
                    if (cos > 0.001) rx = Math.min(rx, (W - half - sized.cx) / cos);
                    else if (cos < -0.001) rx = Math.min(rx, (sized.cx - half) / -cos);
                }
                sized.rx = Math.max(24, Number.isFinite(rx) ? rx : sized.rx);
                const at = placeRing(data, sized, phase, inner, first);
                const boxes = nodes.map((n) => {
                    const p = /** @type {{ x: number, y: number }} */ (at.get(n.id));
                    const r = rOf(n) + (n.flag === 'mismatch' ? 5 : 0);
                    const w = widths.get(n.id) ?? 0;
                    return {
                        circle: { x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r },
                        label: { x: p.x - w / 2, y: p.y + r + 4, width: w, height: line * (rows.get(n.id) ?? 1) },
                    };
                });
                let misses = 0;
                for (const [i, a] of boxes.entries()) {
                    if (
                        a.label.x < pad ||
                        a.label.x + a.label.width > W - pad ||
                        a.circle.y < top + pad ||
                        a.label.y + a.label.height > height - bottom - pad
                    )
                        misses += 1;
                    // `whole`: a node and its name are one box (the union of the two), as they are measured on the page.
                    for (const b of boxes.slice(i + 1))
                        if (whole ? hits(union(a), union(b)) : hits(a.label, b.label) || hits(a.label, b.circle) || hits(b.label, a.circle))
                            misses += 1;
                }
                if (!best || misses < best.misses) best = { misses, at, H: height };
                if (misses === 0) break;
            }
            if (best?.misses === 0 || height >= maxHeight) break;
            height = Math.min(maxHeight, Math.round(height * grow));
        }
        return /** @type {NonNullable<typeof best>} */ (best);
    };
    const one = search(new Map(nodes.map((n) => [n.id, widthOf(n)])), new Map());
    /** @type {Map<string, string[]>} */
    const wraps = new Map();
    if (one.misses === 0 || !wrapOf) return { at: one.at, H: one.H, wraps };
    // Each name wider than the target goes on as many centred lines as it needs, broken after its hyphens or at its spaces; the
    // narrower the lines, the shorter the picture, until the lines are too many to stand side by side. Of the targets tried the
    // picture with the fewest touching names wins, then the shortest.
    // Two rings alternating: where the ring is narrow the neighbours at its top and bottom stand side by side, and every second one
    // moves toward the hub so that the names are not on one line. An odd ring has one pair of neighbours on the same ring; which pair
    // is searched too, so that it stands where the ring is tall.
    const rings = [[1, 0], ...[0.8, 0.65, 0.5].flatMap((share) => ring.map((_, first) => /** @type {[number, number]} */ ([share, first])))];
    const turns = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
    /** @type {{ misses: number, at: Map<string, { x: number, y: number, angle: number }>, H: number, wraps: Map<string, string[]> } | null} */
    let wrapped = null;
    for (const target of [104, 88, 72]) {
        const widths = new Map(nodes.map((n) => [n.id, widthOf(n)]));
        const rows = new Map();
        /** @type {Map<string, string[]>} */
        const lines = new Map();
        for (const n of nodes) {
            const w = wrapOf(n, target);
            if (!w || w.lines.length < 2) continue;
            widths.set(n.id, w.width);
            rows.set(n.id, w.lines.length);
            lines.set(n.id, w.lines);
        }
        const found = search(widths, rows, rings, turns, 1.05, true);
        if (!wrapped || found.misses < wrapped.misses || (found.misses === wrapped.misses && found.H < wrapped.H))
            wrapped = { ...found, wraps: lines };
    }
    const two = /** @type {NonNullable<typeof wrapped>} */ (wrapped);
    return two.misses < one.misses || (two.misses === one.misses && two.H < one.H)
        ? { at: two.at, H: two.H, wraps: two.wraps }
        : { at: one.at, H: one.H, wraps: new Map() };
}
