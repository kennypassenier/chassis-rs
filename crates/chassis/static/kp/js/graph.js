// A picture of the network: a hub-and-ring graph [scope-143, port2-6].
//
// `figure.kp-graph[data-kp-graph]` (css/components.css) is one node in the
// middle and the rest on a ring around it, the links drawn by kind (a colour
// and a dash each, listed above the picture). This module builds it:
//
//   attachGraphs(root)        the bar with the kinds and Show all, the
//                             picture (one tab stop: the arrows walk the
//                             ring, Enter or Space picks, Esc shows all),
//                             and the hint under it in the page's flow
//   setGraphData(el, data)    its nodes, edges and kinds; ids that stay keep
//                             their selection and the focus
//   setGraphState(el, state)  loading, empty or error, at the final height
//   graphSelect(el, ids)      pick these nodes from the page
//   graphHideKind(el, kind)   hide or show one kind of link from the page
//   graphZoom(el, action)     zoom in, out or reset the view from the page
//   graphDetail(el, id)       open the details of a node (or close them)
//   setGraphOptions(el, o)    set the options below as attributes
//
// and the pure halves the drawing is made of: hubOf(), ringOf(),
// graphLayout(), graphRoom(), graphArrow(), graphBends(), graphLabelText()
// and fitGraphLabels(). A hover, a pick, a zoom or a hidden kind changes
// classes and one transform only, never a node, so the element under the
// pointer is never rebuilt. Nothing runs on import; the attach function
// returns a detach.
//
// Options [graph-1020], every one off or at the approved look by default and
// switchable at runtime (an attribute change redraws):
//
//   data-kp-labels="below"      the name stands under its node, whole; the
//                               layout makes room (a taller picture, a
//                               narrower ring) instead of cutting a name
//   data-kp-chrome="inside"     Show all and the hint sit inside the picture
//   data-kp-colour="fixed"      a node keeps one colour in every theme (its
//                               hue at a fixed lightness); a node's own
//                               `colour` wins in every mode
//   data-kp-direction="arrows"  an arrowhead at the end of each link, in the
//                               kind's colour (open for a dashed kind)
//   data-kp-zoom                wheel or pinch zooms, drag pans, + - 0 and
//                               Shift+arrows from the keyboard, a Reset
//   data-kp-detail              a picked node opens a details panel inside
//                               the picture, filled by the page (the `detail`
//                               hook or the `kp-graph-detail` event); Esc
//                               closes it
//   data-kp-ring-radius="0.42"  the ring's size, a share of the picture
//   data-kp-node-radius="18"    the base node radius in px (14)

import { hostStatePlate } from './state-plate.js';
import { resolveStrings } from './strings.js';

/** A hub-and-ring graph: `figure.kp-graph[data-kp-graph]`. */
export const GRAPH = '[data-kp-graph]';
/** Fired on the graph, bubbling, when its selection, hover or hidden kinds change: `detail` `{ selected, hover, hiddenKinds }`. */
export const GRAPH_CHANGE_EVENT = 'kp-graph-change';
/** Fired on the graph, bubbling, when the Retry of its failed state is pressed [state-plates-1019]. */
export const GRAPH_RETRY_EVENT = 'kp-graph-retry';
/** Fired on the graph, bubbling, when a picked node's details open [graph-1020]: `detail` `{ id, node, slot, host }`; the page fills `slot`. */
export const GRAPH_DETAIL_EVENT = 'kp-graph-detail';
/** The attributes that are the graph's options; a change to one redraws [graph-1020]. */
export const GRAPH_OPTION_ATTRIBUTES = [
    'data-kp-labels',
    'data-kp-chrome',
    'data-kp-colour',
    'data-kp-direction',
    'data-kp-zoom',
    'data-kp-detail',
    'data-kp-ring-radius',
    'data-kp-node-radius',
];

/**
 * @typedef {{ id: string, label: string, kind?: string, hue?: number, colour?: string, radius?: number, weight?: number | null,
 *   flag?: 'mismatch' | null, description: string, external?: boolean }} GraphNode
 * @typedef {{ from: string, to: string, kind: string, detail?: string, arrows?: 'to' | 'from' | 'both' | 'none' }} GraphEdge
 * @typedef {{ kind: string, label: string, hint: string, style: 'solid' | 'dash' | 'dot' | 'long-dash', colour: string }} GraphKind
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[], kinds: GraphKind[], hub?: string }} GraphData
 */

/**
 * What `decorate` is told about the control it is handed: the same shape every kp module's `decorate` takes
 * (`DataTableDecorateInfo`). `kind` is `node` (a node of the picture; `value` is its id, `label` its name), `kind` (a
 * toggle in the list of kinds; `value` is the kind), `show-all`, or one of the option controls [graph-1020]: `zoom-in`, `zoom-out`, `zoom-reset` and `detail-close` (`value` is the node whose details they close). `host` is the graph and `key` its `data-kp-key`.
 * @typedef {{ kind: 'node' | 'kind' | 'show-all' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'detail-close', host: HTMLElement, key?: string, index?: number, label?: string, value?: string }} GraphDecorateInfo
 */

/**
 * What the page hands the `detail` hook, and what the `kp-graph-detail` event carries: the picked node, the slot to fill
 * (an element inside the details panel) and the graph.
 * @typedef {{ id: string, node: GraphNode, slot: HTMLElement, host: HTMLElement, key?: string }} GraphDetailInfo
 * @typedef {{ labels: 'beside' | 'below', chrome: 'outside' | 'inside', colour: 'theme' | 'fixed', direction: 'none' | 'arrows',
 *   zoom: boolean, detail: boolean, ring: number | null, node: number | null }} GraphOptions
 */

/**
 * The graph's options as its attributes say them; anything missing or unreadable is the approved look.
 * @param {Element} host
 * @returns {GraphOptions}
 */
export function graphOptionsOf(host) {
    const num = (/** @type {string} */ name, /** @type {number} */ lo, /** @type {number} */ hi) => {
        const raw = host.getAttribute(name);
        const v = raw == null || raw.trim() === '' ? NaN : Number(raw);
        return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
    };
    const flag = (/** @type {string} */ name) => host.hasAttribute(name) && host.getAttribute(name) !== 'off' && host.getAttribute(name) !== 'false';
    return {
        labels: host.getAttribute('data-kp-labels') === 'below' ? 'below' : 'beside',
        chrome: host.getAttribute('data-kp-chrome') === 'inside' ? 'inside' : 'outside',
        colour: host.getAttribute('data-kp-colour') === 'fixed' ? 'fixed' : 'theme',
        direction: host.getAttribute('data-kp-direction') === 'arrows' ? 'arrows' : 'none',
        zoom: flag('data-kp-zoom'),
        detail: flag('data-kp-detail'),
        ring: num('data-kp-ring-radius', 0.15, 0.48),
        node: num('data-kp-node-radius', 6, 40),
    };
}

/**
 * Set options on a graph (they are attributes, so markup and script say the same thing); `null` or `false` takes one off.
 * @param {Element} el
 * @param {Partial<{ [K in keyof GraphOptions]: GraphOptions[K] | null | false }>} options
 */
export function setGraphOptions(el, options) {
    /** @type {Record<string, string>} */
    const names = { labels: 'data-kp-labels', chrome: 'data-kp-chrome', colour: 'data-kp-colour', direction: 'data-kp-direction', zoom: 'data-kp-zoom', detail: 'data-kp-detail', ring: 'data-kp-ring-radius', node: 'data-kp-node-radius' };
    for (const [key, value] of Object.entries(options)) {
        const name = names[key];
        if (!name) continue;
        if (value == null || value === false) el.removeAttribute(name);
        else el.setAttribute(name, value === true ? '' : String(value));
    }
}

/** @param {Element} host @returns {string | undefined} */
const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;

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
        const k = (i - first + ring.length) % ring.length % 2 === 1 ? inner : 1;
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
    const hits = (/** @type {GraphBox} */ a, /** @type {GraphBox} */ b) => a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
    const union = (/** @type {{ circle: GraphBox, label: GraphBox }} */ { circle, label }) => {
        const x = Math.min(circle.x, label.x);
        const y = Math.min(circle.y, label.y);
        return { x, y, width: Math.max(circle.x + circle.width, label.x + label.width) - x, height: Math.max(circle.y + circle.height, label.y + label.height) - y };
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
            for (const [phase, [inner, first]] of turns.flatMap((turn) => rings.map((pair) => /** @type {[number, [number, number]]} */ ([turn, pair])))) {
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
                    return { circle: { x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r }, label: { x: p.x - w / 2, y: p.y + r + 4, width: w, height: line * (rows.get(n.id) ?? 1) } };
                });
                let misses = 0;
                for (const [i, a] of boxes.entries()) {
                    if (a.label.x < pad || a.label.x + a.label.width > W - pad || a.circle.y < top + pad || a.label.y + a.label.height > height - bottom - pad) misses += 1;
                    // `whole`: a node and its name are one box (the union of the two), as they are measured on the page.
                    for (const b of boxes.slice(i + 1)) if (whole ? hits(union(a), union(b)) : hits(a.label, b.label) || hits(a.label, b.circle) || hits(b.label, a.circle)) misses += 1;
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
        if (!wrapped || found.misses < wrapped.misses || (found.misses === wrapped.misses && found.H < wrapped.H)) wrapped = { ...found, wraps: lines };
    }
    const two = /** @type {NonNullable<typeof wrapped>} */ (wrapped);
    return two.misses < one.misses || (two.misses === one.misses && two.H < one.H) ? { at: two.at, H: two.H, wraps: two.wraps } : { at: one.at, H: one.H, wraps: new Map() };
}

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

/**
 * A node's radius: 14, or 10 to 24 by its weight; an outside node 9. A page's own `radius` on the node wins, and `base`
 * (14) scales the rest [graph-1020].
 * @param {GraphNode} n
 * @param {number} [base]
 */
const radiusOf = (n, base = 14) => {
    if (n.radius != null && n.radius > 0) return n.radius;
    const r = n.external ? 9 : n.weight != null ? 10 + 14 * Math.sqrt(Math.max(0, Math.min(1, n.weight))) : 14;
    return base === 14 ? r : (r * base) / 14;
};

/** Is `el` laid out (not hidden, not inside something hidden)? @param {Element | null} el */
const isShown = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

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

const SVG_NS = 'http://www.w3.org/2000/svg';

/** @param {Document} doc @param {string} tag @param {Record<string, string | number>} [attrs] @returns {SVGElement} */
const svgEl = (doc, tag, attrs = {}) => {
    const el = /** @type {SVGElement} */ (doc.createElementNS(SVG_NS, tag));
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
    return el;
};

/**
 * @typedef {GraphLabel & { text: SVGTextElement }} DrawnLabel
 * @typedef {{ k: number, x: number, y: number }} GraphView
 * @typedef {{ el: HTMLElement, data: GraphData | null, state: 'loading' | 'ready' | 'empty' | 'error', words: string, text: string, art: Node | string | null,
 *   selected: Set<string>, hidden: Set<string>, hover: string | null, focus: string | null, drawnWidth: number,
 *   bar: HTMLElement, showAll: HTMLButtonElement, legend: HTMLElement, box: HTMLElement, svg: SVGSVGElement,
 *   note: HTMLElement, plate: HTMLElement, drawn: boolean, hint: HTMLElement, decorate?: (part: Element, info: GraphDecorateInfo) => void,
 *   strings: import('./strings.js').Strings, labels: DrawnLabel[], size: [number, number],
 *   options: GraphOptions, world: SVGGElement | null, at: Map<string, { x: number, y: number, angle: number }>, view: GraphView,
 *   zoomBox: HTMLElement, zoomIn: HTMLButtonElement, zoomOut: HTMLButtonElement, zoomReset: HTMLButtonElement,
 *   panel: HTMLElement, detail: string | null, detailShown: string | null, detailHook?: (info: GraphDetailInfo) => Node | string | null | void,
 *   readyHeight: number, readyWidth: number }} GraphModel
 */

/** @type {WeakMap<Element, GraphModel>} */
const graphs = new WeakMap();

/** How far a view may zoom, and by how much a key or a button steps [graph-1020]. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

let detailCount = 0;

/** @param {GraphModel} g */
function graphChanged(g) {
    g.el.dispatchEvent(
        new CustomEvent(GRAPH_CHANGE_EVENT, { bubbles: true, detail: { selected: [...g.selected], hover: g.hover, hiddenKinds: [...g.hidden], detail: g.detail } }),
    );
}

/** Selection, hover and hidden kinds change classes only, never the nodes. @param {GraphModel} g */
function restyleGraph(g) {
    const lit = new Set(g.selected);
    if (g.hover) lit.add(g.hover);
    g.el.toggleAttribute('data-kp-focus', lit.size > 0);
    const on = new Set(lit);
    for (const path of g.svg.querySelectorAll('.kp-graph__edge, .kp-graph__arrow')) {
        const a = path.getAttribute('data-kp-from') ?? '';
        const b = path.getAttribute('data-kp-to') ?? '';
        const hidden = g.hidden.has(path.getAttribute('data-kp-kind') ?? '');
        const isOn = !hidden && (lit.has(a) || lit.has(b));
        path.classList.toggle('is-hidden', hidden);
        path.classList.toggle('is-on', isOn);
        path.classList.toggle('is-dim', lit.size > 0 && !isOn && !hidden);
        if (isOn) {
            on.add(a);
            on.add(b);
        }
    }
    for (const node of g.svg.querySelectorAll('.kp-graph__node')) {
        const id = node.getAttribute('data-kp-id') ?? '';
        node.classList.toggle('is-on', on.has(id));
        node.classList.toggle('is-dim', lit.size > 0 && !on.has(id));
        node.classList.toggle('is-picked', g.selected.has(id));
        node.setAttribute('aria-pressed', String(g.selected.has(id)));
    }
    for (const button of g.legend.querySelectorAll('[data-kp-kind]'))
        button.setAttribute('aria-pressed', String(!g.hidden.has(button.getAttribute('data-kp-kind') ?? '')));
    g.showAll.toggleAttribute('data-kp-idle', g.selected.size === 0 && g.hidden.size === 0 && !g.detail);
}

/** Fit the drawn labels, writing each shortened text into its element. @param {DrawnLabel[]} labels @param {number} W @param {number} H */
function fitDrawnLabels(labels, W, H) {
    fitGraphLabels(labels, W, H, (l) => {
        const text = graphLabelText(l.full, l.length);
        if (l.text.textContent !== text) l.text.textContent = text;
        return l.text.getBBox();
    });
}

/** The strip kept clear at the top and the bottom for what is drawn inside the picture: Show all and the zoom controls over the top, the hint, as tall as it is, at the foot [graph-1020]. @param {GraphOptions} o @param {number} hintHeight */
const insetOf = (o, hintHeight) => ({ top: o.chrome === 'inside' || o.zoom ? 44 : 0, bottom: o.chrome === 'inside' ? Math.max(34, Math.ceil(hintHeight) + 12) : 0 });

/**
 * The ghost of the coming network, drawn while loading [PACKAGE_FINDINGS, 2026-10-06]: the last network's nodes and
 * links, or a hub with a ring of six when nothing was drawn yet, in the package's own edge, node, ring and core
 * classes so the theme's settled shape draws it, quieted by the `kp-graph__ghost` rules. Each link carries `pathLength` 100
 * (a register's travelling dash is a percentage of the link). Every part carries `--i`
 * (its order from the hub round the ring) and the group `--n` (how many), for a register's staggered motion.
 * @param {Document} doc
 * @param {GraphData | null} last
 * @param {number} W
 * @param {number} H
 * @param {GraphLayoutOptions} layoutOptions
 * @param {number} base  the base node radius
 * @returns {SVGGElement}
 */
function ghostOf(doc, last, W, H, layoutOptions, base) {
    /** @type {GraphData} */
    const data = last?.nodes.length
        ? last
        : {
              nodes: ['hub', 'a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, label: id, description: '' })),
              edges: ['a', 'b', 'c', 'd', 'e', 'f'].map((to) => ({ from: 'hub', to, kind: 'link' })),
              kinds: [],
              hub: 'hub',
          };
    const at = graphLayout(data, W, H, layoutOptions);
    const hub = hubOf(data);
    const order = [...(hub ? [hub] : []), ...ringOf(data, hub).map((n) => n.id)];
    const bends = graphBends(data.edges);
    const kinds = new Map(data.kinds.map((k) => [k.kind, k]));
    const sorted = data.nodes.filter((n) => !n.external).sort((a, b) => a.label.localeCompare(b.label));
    const root = svgEl(doc, 'g', { class: 'kp-graph__ghost', 'aria-hidden': 'true', style: `--n: ${order.length}` });
    const edges = svgEl(doc, 'g', { class: 'kp-graph__edges' });
    data.edges.forEach((e, i) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        if (!a || !b) return;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const mx = (a.x + b.x) / 2 - ((b.y - a.y) / len) * bends[i];
        const my = (a.y + b.y) / 2 + ((b.x - a.x) / len) * bends[i];
        const kind = kinds.get(e.kind);
        edges.append(
            svgEl(doc, 'path', {
                class: 'kp-graph__edge',
                d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`,
                pathLength: '100',
                'data-kp-kind': e.kind,
                'data-kp-style': kind?.style ?? 'solid',
                style: `--i: ${Math.max(0, order.indexOf(e.from === hub ? e.to : e.from))}${kind?.colour ? `; --kp-graph-edge-colour: ${kind.colour}` : ''}`,
            }),
        );
    });
    root.append(edges);
    order.forEach((id, i) => {
        const n = data.nodes.find((x) => x.id === id);
        const p = at.get(id);
        if (!n || !p) return;
        const r = radiusOf(n, base);
        const hue = n.hue ?? Math.round((sorted.indexOf(n) / Math.max(1, sorted.length)) * 360);
        const node = svgEl(doc, 'g', {
            class: `kp-graph__node${n.external ? ' kp-graph__node--external' : ''}${id === hub ? ' kp-graph__node--hub' : ''}`,
            style: `--i: ${i}${n.external ? '' : `; --kp-graph-hue: ${hue}`}`,
        });
        node.append(svgEl(doc, 'circle', { class: 'kp-graph__ring', cx: p.x, cy: p.y, r }));
        if (!n.external) node.append(svgEl(doc, 'circle', { class: 'kp-graph__core', cx: p.x, cy: p.y, r: Math.max(4, r - 6) }));
        root.append(node);
    });
    return /** @type {SVGGElement} */ (root);
}

/** Show a view: one transform on the world group, nothing else moves. @param {GraphModel} g @param {boolean} [eased] */
function applyView(g, eased = false) {
    const { world, view } = g;
    const identity = view.k === 1 && view.x === 0 && view.y === 0;
    if (world) {
        if (eased) {
            world.classList.add('is-eased');
            const done = () => world.classList.remove('is-eased');
            world.addEventListener('transitionend', done, { once: true });
            g.el.ownerDocument.defaultView?.setTimeout(done, 450);
        }
        world.style.transform = identity ? '' : `translate(${view.x.toFixed(2)}px, ${view.y.toFixed(2)}px) scale(${view.k.toFixed(4)})`;
    }
    g.zoomReset.setAttribute('aria-disabled', String(identity));
    g.zoomIn.setAttribute('aria-disabled', String(view.k >= ZOOM_MAX));
    g.zoomOut.setAttribute('aria-disabled', String(view.k <= ZOOM_MIN));
    g.el.toggleAttribute('data-kp-zoomed', !identity);
}

/** Keep part of the drawing in sight: a pan may not carry it away. @param {GraphModel} g */
function clampView(g) {
    const [W, H] = g.size;
    const keep = 60;
    const { view } = g;
    view.x = Math.min(W - keep, Math.max(keep - W * view.k, view.x));
    view.y = Math.min(H - keep, Math.max(keep - H * view.k, view.y));
}

/** Zoom to `k` about the picture point (px, py), so the point under the pointer stays under it. @param {GraphModel} g @param {number} k @param {number} px @param {number} py @param {boolean} [eased] */
function zoomTo(g, k, px, py, eased = false) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
    const { view } = g;
    const ratio = next / view.k;
    view.x = px - (px - view.x) * ratio;
    view.y = py - (py - view.y) * ratio;
    view.k = next;
    clampView(g);
    applyView(g, eased);
}

/** Where a pointer is in the picture's own units. @param {GraphModel} g @param {number} clientX @param {number} clientY */
function pictureAt(g, clientX, clientY) {
    const rect = g.svg.getBoundingClientRect();
    const [W, H] = g.size;
    return { x: ((clientX - rect.left) * W) / (rect.width || W), y: ((clientY - rect.top) * H) / (rect.height || H) };
}

/** Bring a node into the view without moving it further than needed (a focus walk on a zoomed picture). @param {GraphModel} g @param {string | null} id */
function revealNode(g, id) {
    const p = id ? g.at.get(id) : null;
    if (!p || !g.options.zoom || (g.view.k === 1 && g.view.x === 0 && g.view.y === 0)) return;
    const [W, H] = g.size;
    const pad = 48;
    const sx = p.x * g.view.k + g.view.x;
    const sy = p.y * g.view.k + g.view.y;
    if (sx < pad) g.view.x += pad - sx;
    else if (sx > W - pad) g.view.x -= sx - (W - pad);
    if (sy < pad + 40) g.view.y += pad + 40 - sy;
    else if (sy > H - pad) g.view.y -= sy - (H - pad);
    clampView(g);
    applyView(g, true);
}

/** Put Show all and the hint where the option says. @param {GraphModel} g */
function placeChrome(g) {
    const inside = g.options.chrome === 'inside';
    const showParent = inside ? g.box : g.bar;
    if (g.showAll.parentElement !== showParent) showParent.append(g.showAll);
    if (inside) {
        if (g.hint.parentElement !== g.box) g.box.append(g.hint);
    } else if (g.hint.parentElement !== g.el) g.box.after(g.hint);
}

/** The words under the picture follow the options on: they are what a pointer and the keys do now. @param {GraphModel} g */
function sayHint(g) {
    const { options: o, strings: s } = g;
    const words = [s.graphHint, ...(o.zoom ? [s.graphZoomHint] : []), ...(o.detail ? [s.graphDetailHint] : [])].join(' ');
    if (g.hint.textContent !== words) g.hint.textContent = words;
    g.svg.setAttribute('aria-label', `${g.el.getAttribute('aria-label') ?? s.graphUnnamed}. ${words}`);
}

/**
 * Open, refresh or close the details panel inside the picture for `g.detail` [graph-1020]. It is built when it opens (the page
 * fills its slot through the `kp-graph-detail` event or the `detail` hook); a redraw of the picture never rebuilds it.
 * @param {GraphModel} g
 */
function renderDetail(g) {
    const { panel } = g;
    const node = g.options.detail && g.state === 'ready' && g.detail ? g.data?.nodes.find((n) => n.id === g.detail) : null;
    if (!node) {
        if (!panel.hidden || g.detailShown) panel.replaceChildren();
        panel.hidden = true;
        g.detailShown = null;
        g.el.removeAttribute('data-kp-detail-open');
        return;
    }
    if (g.detailShown === node.id && !panel.hidden) return;
    const doc = g.el.ownerDocument;
    detailCount += 1;
    const title = make(doc, 'h3', 'kp-graph__detail-title', node.label);
    title.id = `kp-graph-detail-${detailCount}`;
    const close = make(doc, 'button', 'kp-button kp-button--sm kp-graph__detail-close', g.strings.graphDetailClose);
    close.type = 'button';
    close.title = g.strings.graphDetailCloseTitle;
    g.decorate?.(close, { kind: 'detail-close', host: g.el, key: keyOf(g.el), value: node.id, label: node.label });
    const body = make(doc, 'div', 'kp-graph__detail-body');
    panel.replaceChildren(make(doc, 'div', 'kp-graph__detail-head'), body);
    /** @type {HTMLElement} */ (panel.firstElementChild).append(title, close);
    panel.setAttribute('aria-labelledby', title.id);
    panel.hidden = false;
    g.detailShown = node.id;
    g.el.setAttribute('data-kp-detail-open', '');
    /** @type {GraphDetailInfo} */
    const info = { id: node.id, node, slot: body, host: g.el, ...(keyOf(g.el) ? { key: keyOf(g.el) } : {}) };
    g.el.dispatchEvent(new CustomEvent(GRAPH_DETAIL_EVENT, { bubbles: true, detail: info }));
    const made = g.detailHook?.(info);
    if (made != null && made !== undefined) body.append(made instanceof Node ? made : doc.createTextNode(String(made)));
    // Nothing from the page: the node's own words, so the panel is never an empty box.
    if (!body.childNodes.length) body.append(make(doc, 'p', 'kp-graph__detail-text', node.description));
}

/**
 * The room tried, in order, for names beside the ring at a phone width [graph-1020]: the picture as tall as ever, then taller; on each
 * height the ring as wide as ever, then a little narrower or wider; on each width the ring unturned, then turned a quarter step at a time.
 */
const SIDE_ROOM = [1, 1.1, 1.2, 1.3, 1.4].flatMap((height) => [1, 0.9, 1.1, 0.8, 1.2].flatMap((stretch) => [0, 0.25, 0.5, 0.75].map((phase) => ({ height, stretch, phase }))));

/** How many pairs of node groups (a node and its name) of a drawn world come closer than 3 px? @param {SVGGElement} world */
function groupsTouching(world) {
    const boxes = [...world.querySelectorAll('.kp-graph__node')].map((n) => /** @type {SVGGraphicsElement} */ (n).getBBox());
    const gap = 3;
    let pairs = 0;
    for (const [i, a] of boxes.entries())
        for (const b of boxes.slice(i + 1)) if (a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap) pairs += 1;
    return pairs;
}

/**
 * A name on as few centred lines as keep each within `target` [graph-1020]: broken after a hyphen or at a space, and of all the ways
 * to break it into that many lines the one whose widest line is narrowest, so the lines are as even as the name allows. A name that
 * fits, or has no break point, is one line. `widthOf(text)` is the width of a piece as drawn.
 * @param {string} label
 * @param {number} target
 * @param {(text: string) => number} widthOf
 * @returns {string[]}
 */
function graphLabelLines(label, target, widthOf) {
    if (widthOf(label) <= target) return [label];
    const pieces = label.split(/(?<=[-_/ ])/);
    if (pieces.length < 2) return [label];
    const join = (/** @type {number} */ from, /** @type {number} */ to) => pieces.slice(from, to).join('').trimEnd();
    const width = (/** @type {number} */ from, /** @type {number} */ to) => widthOf(join(from, to));
    // The fewest lines: take pieces while they fit.
    let rows = 1;
    for (let from = 0, to = 1; to <= pieces.length; to += 1) {
        if (to - from > 1 && width(from, to) > target) {
            rows += 1;
            from = to - 1;
        }
    }
    rows = Math.min(rows, pieces.length);
    // Of the ways to cut `pieces` into `rows` lines, the one with the narrowest widest line (pieces are few, so every way is tried).
    /** @type {(from: number, left: number) => { widest: number, cuts: number[] }} */
    const cut = (from, left) => {
        if (left === 1) return { widest: width(from, pieces.length), cuts: [] };
        /** @type {{ widest: number, cuts: number[] }} */
        let best = { widest: Infinity, cuts: [] };
        for (let to = from + 1; to <= pieces.length - (left - 1); to += 1) {
            const rest = cut(to, left - 1);
            const widest = Math.max(width(from, to), rest.widest);
            if (widest < best.widest) best = { widest, cuts: [to, ...rest.cuts] };
        }
        return best;
    };
    const { cuts } = cut(0, rows);
    const edges = [0, ...cuts, pieces.length];
    return edges.slice(1).map((to, i) => join(edges[i], to));
}

/** Draw the whole graph for the box's width. @param {GraphModel} g */
function drawGraph(g, attempt = 0, tried = { best: 0, count: Infinity, locked: false }) {
    const doc = g.el.ownerDocument;
    const o = graphOptionsOf(g.el);
    g.options = o;
    placeChrome(g);
    sayHint(g);
    g.zoomBox.hidden = !o.zoom;
    if (!o.zoom && (g.view.k !== 1 || g.view.x !== 0 || g.view.y !== 0)) g.view = { k: 1, x: 0, y: 0 };
    const width = g.box.clientWidth;
    g.drawnWidth = width;
    const W = Math.max(280, width || 800);
    let H = W < 600 ? 480 : Math.max(420, Math.min(560, Math.round(W * 0.6)));
    // Names beside the ring at a phone width [graph-1020]: the placement by angle is the approved look, and when two groups (a node and
    // its name) touch, the picture is drawn again with more room: taller first, then the ring turned a quarter step at a time.
    const roomy = SIDE_ROOM[attempt] ?? SIDE_ROOM[SIDE_ROOM.length - 1];
    if (o.labels !== 'below' && W < 600) H = Math.round(H * roomy.height);
    const hadFocus = g.svg.contains(doc.activeElement) ? g.focus : null;
    g.svg.replaceChildren();
    g.world = null;
    const data = g.data;
    g.el.dataset.kpState = g.state;
    const below = o.labels === 'below';
    const inset = insetOf(o, o.chrome === 'inside' && isShown(g.hint) ? g.hint.getBoundingClientRect().height : 0);
    /** @type {GraphLayoutOptions} */
    const layoutOptions = { ...(o.ring != null ? { ring: o.ring } : {}), inset, ...(!below && W < 600 && roomy.phase || roomy.stretch !== 1 ? { phase: roomy.phase, stretch: roomy.stretch } : {}) };
    const base = o.node ?? 14;
    // The names stand whole under their nodes: the layout makes room, so a picture that is loading, empty or failed keeps the
    // height of the last one drawn and nothing jumps [graph-1020].
    /** @type {Map<string, { x: number, y: number, angle: number }> | null} */
    let at = null;
    /** @type {Map<string, string[]>} */
    let wraps = new Map();
    if (g.state === 'ready' && data) {
        if (below) {
            const measure = (/** @type {GraphNode} */ n) => {
                const text = /** @type {SVGTextElement} */ (svgEl(doc, 'text', { class: 'kp-graph__label' }));
                text.textContent = n.label;
                g.svg.append(text);
                const measured = isShown(g.svg) ? text.getComputedTextLength() : 0;
                text.remove();
                return (measured || n.label.length * 7.2) + 6;
            };
            // A name that cannot stand on one line in the tallest picture goes on two centred lines, broken at its best hyphen or space.
            /** @type {Map<string, number>} */
            const widths = new Map();
            const measureText = (/** @type {string} */ label) => {
                const known = widths.get(label);
                if (known != null) return known;
                const text = /** @type {SVGTextElement} */ (svgEl(doc, 'text', { class: 'kp-graph__label' }));
                text.textContent = label;
                g.svg.append(text);
                const measured = isShown(g.svg) ? text.getComputedTextLength() : 0;
                text.remove();
                widths.set(label, measured || label.length * 7.2);
                return widths.get(label) ?? 0;
            };
            const wrapOf = (/** @type {GraphNode} */ n, /** @type {number} */ target) => {
                const lines = graphLabelLines(n.label, target, measureText);
                return lines.length < 2 ? null : { width: Math.max(...lines.map(measureText)) + 6, lines };
            };
            const room = graphRoom(data, W, H, measure, { ...layoutOptions, radiusOf: (n) => radiusOf(n, base), wrapOf });
            at = room.at;
            H = room.H;
            wraps = room.wraps;
            g.readyHeight = H;
            g.readyWidth = W;
        } else {
            at = graphLayout(data, W, H, layoutOptions);
            g.readyHeight = H;
            g.readyWidth = W;
        }
    } else if (g.readyWidth === W && g.readyHeight > H) H = g.readyHeight;
    g.box.style.setProperty('--kp-graph-h', `${H}px`);
    g.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    g.svg.setAttribute('height', String(H));
    // Loading is the ghost of the coming network in the picture, moved by the register's decided loading picture
    // (research/character-graph, decided 2026-10-06 21:37); the sentence stands at the foot. Empty and failed are the
    // package's state plate filling the picture, with a Retry on a failure [state-plates-1019].
    const loading = g.state === 'loading';
    g.note.textContent = loading ? g.words || g.strings.graphLoading : '';
    g.note.hidden = !loading;
    g.plate.replaceChildren();
    g.plate.hidden = loading || g.state === 'ready';
    if (loading) g.svg.append(ghostOf(doc, g.data, W, H, layoutOptions, base));
    else if (!g.plate.hidden)
        g.plate.append(
            hostStatePlate(g.el, {
                kind: g.state === 'error' ? 'error' : 'empty',
                title: g.words || (g.state === 'error' ? g.strings.graphFailed : g.strings.graphEmpty),
                ...(g.text ? { text: g.text } : {}),
                art: g.art,
                retryEvent: GRAPH_RETRY_EVENT,
            }),
        );
    g.drawn = true;
    g.size = [W, H];
    if (g.state !== 'ready' || !data || !at) {
        g.legend.replaceChildren();
        g.legend.hidden = true;
        g.showAll.setAttribute('data-kp-idle', '');
        g.at = new Map();
        renderDetail(g);
        applyView(g);
        return;
    }
    g.at = at;
    const hub = hubOf(data);
    const bends = graphBends(data.edges);
    const kinds = new Map(data.kinds.map((k) => [k.kind, k]));
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    const name = (/** @type {string} */ id) => byId.get(id)?.label ?? id;
    const world = /** @type {SVGGElement} */ (svgEl(doc, 'g', { class: 'kp-graph__world' }));
    g.world = world;
    const edges = svgEl(doc, 'g', { class: 'kp-graph__edges' });
    data.edges.forEach((e, i) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        if (!a || !b) return;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const mx = (a.x + b.x) / 2 - ((b.y - a.y) / len) * bends[i];
        const my = (a.y + b.y) / 2 + ((b.x - a.x) / len) * bends[i];
        const kind = kinds.get(e.kind);
        const path = svgEl(doc, 'path', {
            d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`,
            class: 'kp-graph__edge',
            'data-kp-from': e.from,
            'data-kp-to': e.to,
            'data-kp-kind': e.kind,
            'data-kp-style': kind?.style ?? 'solid',
        });
        if (kind?.colour) path.setAttribute('style', `--kp-graph-edge-colour: ${kind.colour}`);
        const title = svgEl(doc, 'title');
        title.textContent = `${name(e.from)} → ${name(e.to)}: ${e.detail || kind?.label || e.kind}`;
        path.append(title);
        edges.append(path);
        // The heads are always drawn (a few small paths) and shown by `data-kp-direction="arrows"`, so the option switches without a redraw.
        const way = e.arrows ?? 'to';
        const ends = way === 'both' ? ['to', 'from'] : way === 'none' ? [] : [way];
        for (const end of ends) {
            const toward = end === 'to' ? e.to : e.from;
            const near = end === 'to' ? a : b;
            const far = end === 'to' ? b : a;
            const r = radiusOf(/** @type {GraphNode} */ (byId.get(toward)), base) + (byId.get(toward)?.flag === 'mismatch' ? 5 : 0);
            const head = svgEl(doc, 'path', {
                d: graphArrow(near, { x: mx, y: my }, far, r + 3),
                class: 'kp-graph__arrow',
                'data-kp-from': e.from,
                'data-kp-to': e.to,
                'data-kp-kind': e.kind,
                'data-kp-style': kind?.style ?? 'solid',
                'aria-hidden': 'true',
            });
            if (kind?.colour) head.setAttribute('style', `--kp-graph-edge-colour: ${kind.colour}`);
            edges.append(head);
        }
    });
    world.append(edges);
    // Hues spread evenly over the nodes in label order, unless a node has its own.
    const sorted = data.nodes.filter((n) => !n.external).sort((a, b) => a.label.localeCompare(b.label));
    /** @type {DrawnLabel[]} */
    const labels = [];
    const ring = ringOf(data, hub);
    const order = [...(hub ? [hub] : []), ...ring.map((n) => n.id)];
    if (!g.focus || !order.includes(g.focus)) g.focus = order[0] ?? null;
    order.forEach((id, index) => {
        const n = /** @type {GraphNode} */ (byId.get(id));
        const p = at.get(id);
        if (!p) return;
        const r = radiusOf(n, base);
        const node = svgEl(doc, 'g', {
            class: `kp-graph__node${n.external ? ' kp-graph__node--external' : ''}${id === hub ? ' kp-graph__node--hub' : ''}`,
            'data-kp-id': id,
            role: 'button',
            tabindex: id === g.focus ? 0 : -1,
            'aria-pressed': String(g.selected.has(id)),
            'aria-label': `${n.label}, ${n.description}`,
        });
        if (!n.external) node.setAttribute('style', `--kp-graph-hue: ${n.hue ?? Math.round((sorted.indexOf(n) / Math.max(1, sorted.length)) * 360)}`);
        // A colour of the page's own is the node's colour in every theme and every mode.
        if (n.colour) /** @type {SVGElement} */ (node).style.setProperty('--kp-graph-node-colour', n.colour);
        const title = svgEl(doc, 'title');
        title.textContent = `${n.label}: ${n.description}`;
        node.append(title, svgEl(doc, 'circle', { class: 'kp-graph__ring', cx: p.x, cy: p.y, r }));
        if (!n.external) node.append(svgEl(doc, 'circle', { class: 'kp-graph__core', cx: p.x, cy: p.y, r: Math.max(4, r - 6) }));
        if (n.flag === 'mismatch') node.append(svgEl(doc, 'circle', { class: 'kp-graph__flag', cx: p.x, cy: p.y, r: r + 5 }));
        // The label points away from the hub: beside the node on the ring's
        // sides, over it at the top, under it at the bottom and for the hub.
        // With the names under their nodes it is always under, centred.
        const dx = below || id === hub ? 0 : Math.cos(p.angle);
        const dy = below || id === hub ? 1 : Math.sin(p.angle);
        const off = r + (n.flag === 'mismatch' ? 10 : 6);
        const anchor = dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle';
        const lx = p.x + dx * off;
        const ly = below ? p.y + r + (n.flag === 'mismatch' ? 5 : 0) + 16 : p.y + dy * off + (dy > 0.35 ? 9 : dy < -0.35 ? -3 : 4);
        const text = /** @type {SVGTextElement} */ (
            svgEl(doc, 'text', { class: 'kp-graph__label', x: lx.toFixed(1), y: ly.toFixed(1), 'text-anchor': anchor })
        );
        const wrapped = below ? wraps.get(id) : undefined;
        if (wrapped) {
            for (const [row, words] of wrapped.entries()) {
                const tspan = svgEl(doc, 'tspan', { x: lx.toFixed(1) });
                if (row > 0) tspan.setAttribute('dy', '16');
                tspan.textContent = words;
                text.append(tspan);
            }
        } else text.textContent = n.label;
        text.setAttribute('aria-hidden', 'true');
        node.append(text);
        labels.push({ text, full: n.label, length: n.label.length });
        world.append(node);
        g.decorate?.(node, { kind: 'node', host: g.el, key: keyOf(g.el), index, value: id, label: n.label });
    });
    g.svg.append(world);
    g.labels = labels;
    if (isShown(g.svg) && !below) fitDrawnLabels(labels, W, H);
    if (!below && W < 600 && isShown(g.svg) && !tried.locked) {
        const touching = groupsTouching(world);
        if (touching < tried.count) {
            tried.best = attempt;
            tried.count = touching;
        }
        // Nothing touches: this is the picture. Everything tried and something still touches: the try with the fewest is drawn.
        if (touching > 0) {
            if (attempt < SIDE_ROOM.length - 1) return drawGraph(g, attempt + 1, tried);
            if (tried.best !== attempt) return drawGraph(g, tried.best, { ...tried, locked: true });
        }
    }
    // The kinds: one toggle per kind the edges use, none when nothing links.
    const present = data.kinds.filter((k) => data.edges.some((e) => e.kind === k.kind));
    g.legend.replaceChildren(
        ...present.map((k, index) => {
            const li = make(doc, 'li');
            const button = make(doc, 'button', 'kp-graph__kind');
            button.type = 'button';
            button.dataset.kpKind = k.kind;
            button.title = k.hint;
            button.setAttribute('aria-pressed', String(!g.hidden.has(k.kind)));
            const sample = svgEl(doc, 'svg', { class: 'kp-graph__sample', viewBox: '0 0 24 8', 'aria-hidden': 'true' });
            const line = svgEl(doc, 'line', { x1: 1, y1: 4, x2: 23, y2: 4, 'data-kp-style': k.style });
            line.setAttribute('style', `--kp-graph-edge-colour: ${k.colour}`);
            sample.append(line);
            button.append(sample, make(doc, 'span', '', k.label));
            li.append(button);
            g.decorate?.(button, { kind: 'kind', host: g.el, key: keyOf(g.el), index, value: k.kind, label: k.label });
            return li;
        }),
    );
    g.legend.hidden = present.length === 0 || data.nodes.length < 2;
    restyleGraph(g);
    renderDetail(g);
    applyView(g);
    if (hadFocus) /** @type {SVGGElement | null} */ (g.svg.querySelector(`[data-kp-id="${CSS.escape(hadFocus)}"]`))?.focus();
}

/**
 * Give a graph its nodes, edges and kinds. Ids that stay keep their
 * selection and focus; picked ids that went are dropped (and said so with
 * `kp-graph-change`).
 * @param {Element} el
 * @param {GraphData} data
 */
export function setGraphData(el, data) {
    const g = graphs.get(el);
    if (!g) return;
    g.data = data;
    g.state = data.nodes.length ? 'ready' : 'empty';
    const ids = new Set(data.nodes.map((n) => n.id));
    const before = g.selected.size;
    const detailBefore = g.detail;
    for (const id of [...g.selected]) if (!ids.has(id)) g.selected.delete(id);
    if (g.hover && !ids.has(g.hover)) g.hover = null;
    if (g.detail && !ids.has(g.detail)) g.detail = null;
    drawGraph(g);
    if (g.selected.size !== before || g.detail !== detailBefore) graphChanged(g);
}

/**
 * `loading`, `empty` or `error`, with the sentence to show in the picture at
 * its final height (loading says `graphLoading` when given none). Loading is the ghost of the coming network, the register's own loading picture; empty
 * and error are the package's state plate over it (`words` is its heading, `text` its sentence, `art` a picture over the
 * heading), an error with a Retry that fires `kp-graph-retry` [state-plates-1019].
 * @param {Element} el
 * @param {'loading' | 'empty' | 'error'} state
 * @param {string} [words]
 * @param {{ text?: string, art?: Node | string | null }} [plate]
 */
export function setGraphState(el, state, words = '', { text = '', art = null } = {}) {
    const g = graphs.get(el);
    if (!g) return;
    g.state = state;
    g.words = words;
    g.text = text;
    g.art = art;
    drawGraph(g);
}

/** Pick these nodes (and only these). With the details option on, the last one's details open. @param {Element} el @param {string[]} ids */
export function graphSelect(el, ids) {
    const g = graphs.get(el);
    if (!g) return;
    g.selected = new Set(ids);
    g.detail = g.options.detail && ids.length ? (ids[ids.length - 1] ?? null) : null;
    restyleGraph(g);
    renderDetail(g);
    graphChanged(g);
}

/** Hide or show one kind of link. @param {Element} el @param {string} kind @param {boolean} hide */
export function graphHideKind(el, kind, hide) {
    const g = graphs.get(el);
    if (!g) return;
    if (hide) g.hidden.add(kind);
    else g.hidden.delete(kind);
    restyleGraph(g);
    graphChanged(g);
}

/**
 * Open the details of a node, or close them with `null` (the node need not be picked) [graph-1020]. It does nothing unless the
 * graph has `data-kp-detail`.
 * @param {Element} el
 * @param {string | null} id
 */
export function graphDetail(el, id) {
    const g = graphs.get(el);
    if (!g) return;
    g.detail = id;
    renderDetail(g);
    restyleGraph(g);
    graphChanged(g);
}

/**
 * Zoom the view from the page: `in`, `out` or `reset` [graph-1020]. It does nothing unless the graph has `data-kp-zoom`.
 * @param {Element} el
 * @param {'in' | 'out' | 'reset'} action
 */
export function graphZoom(el, action) {
    const g = graphs.get(el);
    if (!g || !g.options.zoom) return;
    const [W, H] = g.size;
    if (action === 'reset') {
        g.view = { k: 1, x: 0, y: 0 };
        applyView(g, true);
    } else zoomTo(g, g.view.k * (action === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP), W / 2, H / 2, true);
}

/** The data of a `script[type="application/json"][data-kp-graph-data]` child, if it has one that reads. @param {Element} el @returns {GraphData | null} */
function dataChild(el) {
    const script = el.querySelector(':scope > script[data-kp-graph-data]');
    if (!script) return null;
    try {
        return JSON.parse(script.textContent ?? '');
    } catch {
        return null;
    }
}

/**
 * Build every graph under `root`: a bar with the kinds and Show all, the
 * picture (one tab stop: arrows between nodes, Enter or Space picks, Esc
 * shows all), and the hint under it in the page's flow. A graph's data is the
 * page's: a `script[type="application/json"][data-kp-graph-data]` child, or
 * `setGraphData()` after the attach; until then it shows loading. The options
 * are attributes on the graph (see the top of this file); `detail` is the hook
 * that fills a picked node's details panel.
 * @param {ParentNode} [root]
 * @param {{ decorate?: (part: Element, info: GraphDecorateInfo) => void, strings?: Partial<import('./strings.js').Strings>,
 *   detail?: (info: GraphDetailInfo) => Node | string | null | void }} [options]
 * @returns {() => void} detach
 */
export function attachGraphs(root = document, { decorate, strings, detail } = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    const s = resolveStrings(strings);
    const hosts = /** @type {HTMLElement[]} */ ([...(root instanceof Element && root.matches(GRAPH) ? [root] : []), ...root.querySelectorAll(GRAPH)]);
    for (const el of hosts) {
        if (graphs.has(el)) continue;
        const doc = el.ownerDocument;
        const view = doc.defaultView;
        const initial = dataChild(el);
        const script = el.querySelector(':scope > script[data-kp-graph-data]');
        const bar = make(doc, 'div', 'kp-graph__bar');
        const legend = make(doc, 'ul', 'kp-graph__kinds');
        legend.setAttribute('aria-label', s.graphKinds);
        legend.hidden = true;
        const showAll = make(doc, 'button', 'kp-button kp-button--sm kp-graph__show-all', s.graphShowAll);
        showAll.type = 'button';
        showAll.title = s.graphShowAllTitle;
        showAll.setAttribute('data-kp-idle', '');
        bar.append(legend, showAll);
        const box = make(doc, 'div', 'kp-graph__box');
        const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (svgEl(doc, 'svg', { class: 'kp-graph__svg', role: 'group' })));
        svg.setAttribute('aria-label', `${el.getAttribute('aria-label') ?? s.graphUnnamed}. ${s.graphHint}`);
        const note = make(doc, 'p', 'kp-graph__note');
        note.setAttribute('role', 'status');
        const plate = make(doc, 'div', 'kp-graph__state');
        plate.hidden = true;
        // The zoom controls and the details panel stand inside the picture; both are hidden until their option is on.
        const zoomBox = make(doc, 'div', 'kp-graph__zoom');
        zoomBox.setAttribute('role', 'group');
        zoomBox.setAttribute('aria-label', s.graphZoom);
        zoomBox.hidden = true;
        const zoomOut = make(doc, 'button', 'kp-button kp-button--sm kp-graph__zoom-out', '−');
        const zoomIn = make(doc, 'button', 'kp-button kp-button--sm kp-graph__zoom-in', '+');
        const zoomReset = make(doc, 'button', 'kp-button kp-button--sm kp-graph__zoom-reset', s.graphZoomReset);
        for (const [button, label] of /** @type {const} */ ([
            [zoomOut, s.graphZoomOut],
            [zoomIn, s.graphZoomIn],
            [zoomReset, s.graphZoomResetTitle],
        ])) {
            button.type = 'button';
            button.title = label;
            button.setAttribute('aria-label', label);
        }
        zoomBox.append(zoomOut, zoomIn, zoomReset);
        const panel = make(doc, 'aside', 'kp-graph__detail');
        panel.setAttribute('role', 'region');
        panel.hidden = true;
        box.append(svg, note, plate, zoomBox, panel);
        const hint = make(doc, 'p', 'kp-graph__hint', s.graphHint);
        // The data child stays (a script draws nothing), so a second attach
        // after a detach reads it again.
        el.replaceChildren(bar, box, hint, ...(script ? [script] : []));
        /** @type {GraphModel} */
        const g = {
            el,
            data: null,
            state: 'loading',
            words: '',
            selected: new Set(),
            hidden: new Set(),
            hover: null,
            focus: null,
            drawnWidth: -1,
            bar,
            showAll,
            legend,
            box,
            svg,
            note,
            plate,
            drawn: false,
            text: '',
            art: null,
            hint,
            decorate,
            strings: s,
            labels: [],
            size: [0, 0],
            options: graphOptionsOf(el),
            world: null,
            at: new Map(),
            view: { k: 1, x: 0, y: 0 },
            zoomBox,
            zoomIn,
            zoomOut,
            zoomReset,
            panel,
            detail: null,
            detailShown: null,
            readyHeight: 0,
            readyWidth: 0,
            ...(detail ? { detailHook: detail } : {}),
        };
        graphs.set(el, g);
        decorate?.(showAll, { kind: 'show-all', host: el, key: keyOf(el) });
        decorate?.(zoomIn, { kind: 'zoom-in', host: el, key: keyOf(el) });
        decorate?.(zoomOut, { kind: 'zoom-out', host: el, key: keyOf(el) });
        decorate?.(zoomReset, { kind: 'zoom-reset', host: el, key: keyOf(el) });
        if (initial) setGraphData(el, initial);
        else drawGraph(g);
        const nodeOf = (/** @type {EventTarget | null} */ target) =>
            /** @type {SVGGElement | null} */ (target instanceof Element ? target.closest('.kp-graph__node') : null);
        const toggle = (/** @type {string} */ id) => {
            if (g.selected.has(id)) g.selected.delete(id);
            else g.selected.add(id);
            // A pick opens that node's details; taking the node out closes them if they were its.
            if (g.options.detail) {
                if (g.selected.has(id)) g.detail = id;
                else if (g.detail === id) g.detail = null;
                renderDetail(g);
            }
            restyleGraph(g);
            graphChanged(g);
        };
        const setHover = (/** @type {string | null} */ id) => {
            if (g.hover === id) return;
            g.hover = id;
            restyleGraph(g);
            graphChanged(g);
        };
        const clear = () => {
            if (g.selected.size === 0 && g.hidden.size === 0 && !g.detail) return false;
            g.selected.clear();
            g.hidden.clear();
            g.detail = null;
            renderDetail(g);
            restyleGraph(g);
            graphChanged(g);
            return true;
        };
        /** Esc closes the details first and keeps the picks; the next Esc shows all. */
        const closeDetail = (/** @type {boolean} */ refocus) => {
            if (!g.detail) return false;
            const id = g.detail;
            g.detail = null;
            renderDetail(g);
            restyleGraph(g);
            graphChanged(g);
            if (refocus) /** @type {SVGGElement | null} */ (svg.querySelector(`[data-kp-id="${CSS.escape(id)}"]`))?.focus();
            return true;
        };
        const order = () => /** @type {SVGGElement[]} */ ([...svg.querySelectorAll('.kp-graph__node')]);
        const focusNode = (/** @type {SVGGElement} */ node) => {
            for (const other of order()) other.setAttribute('tabindex', other === node ? '0' : '-1');
            g.focus = node.getAttribute('data-kp-id');
            node.focus({ preventScroll: false });
            revealNode(g, g.focus);
        };
        /** @param {PointerEvent} event */
        const onOver = (event) => {
            const node = nodeOf(event.target);
            if (node) setHover(node.getAttribute('data-kp-id'));
        };
        /** @param {PointerEvent} event */
        const onOut = (event) => {
            const node = nodeOf(event.target);
            if (node && !node.contains(/** @type {Node | null} */ (event.relatedTarget))) setHover(null);
        };
        /** @param {FocusEvent} event */
        const onFocus = (event) => {
            const node = nodeOf(event.target);
            if (node) {
                g.focus = node.getAttribute('data-kp-id');
                setHover(g.focus);
            }
        };
        /** @param {FocusEvent} event */
        const onBlur = (event) => {
            if (!svg.contains(/** @type {Node | null} */ (event.relatedTarget))) setHover(null);
        };
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const node = nodeOf(event.target);
            if (!node) return;
            const id = node.getAttribute('data-kp-id') ?? '';
            for (const other of order()) other.setAttribute('tabindex', other === node ? '0' : '-1');
            g.focus = id;
            toggle(id);
        };
        // Zoom and pan [graph-1020]: a view is one transform on the world group, so a hover or a pick still toggles classes only.
        let dragged = false;
        /** @type {Map<number, { x: number, y: number, onNode: boolean }>} */
        const pointers = new Map();
        /** @type {{ x: number, y: number } | null} */
        let panFrom = null;
        /** @type {{ dist: number, k: number, wx: number, wy: number } | null} */
        let pinch = null;
        const pinchStart = () => {
            const [a, b] = [...pointers.values()];
            if (!a || !b) return;
            const mid = pictureAt(g, (a.x + b.x) / 2, (a.y + b.y) / 2);
            pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: g.view.k, wx: (mid.x - g.view.x) / g.view.k, wy: (mid.y - g.view.y) / g.view.k };
            panFrom = null;
        };
        /** @param {PointerEvent} event */
        const onDown = (event) => {
            if (!g.options.zoom || (event.pointerType === 'mouse' && event.button !== 0)) return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, onNode: !!nodeOf(event.target) });
            if (pointers.size === 2) pinchStart();
            else if (pointers.size === 1) {
                dragged = false;
                panFrom = nodeOf(event.target) ? null : { x: event.clientX, y: event.clientY };
            }
        };
        /** @param {PointerEvent} event */
        const onMove = (event) => {
            const known = pointers.get(event.pointerId);
            if (!known || !g.options.zoom) return;
            known.x = event.clientX;
            known.y = event.clientY;
            if (pinch && pointers.size >= 2) {
                const [a, b] = [...pointers.values()];
                if (!a || !b) return;
                const mid = pictureAt(g, (a.x + b.x) / 2, (a.y + b.y) / 2);
                const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) || 1)) / pinch.dist));
                g.view = { k, x: mid.x - pinch.wx * k, y: mid.y - pinch.wy * k };
                clampView(g);
                applyView(g);
                dragged = true;
            } else if (panFrom && pointers.size === 1) {
                const rect = svg.getBoundingClientRect();
                const scale = g.size[0] / (rect.width || g.size[0]);
                const dx = event.clientX - panFrom.x;
                const dy = event.clientY - panFrom.y;
                if (!dragged && Math.hypot(dx, dy) < 4) return;
                if (!dragged) {
                    dragged = true;
                    g.el.setAttribute('data-kp-panning', '');
                    try {
                        svg.setPointerCapture(event.pointerId);
                    } catch {
                        // A pointer that is already gone cannot be captured: the drag simply ends.
                    }
                }
                g.view.x += dx * scale;
                g.view.y += dy * scale;
                panFrom = { x: event.clientX, y: event.clientY };
                clampView(g);
                applyView(g);
            }
        };
        /** @param {PointerEvent} event */
        const onUp = (event) => {
            pointers.delete(event.pointerId);
            if (pointers.size < 2) pinch = null;
            if (pointers.size === 0) {
                panFrom = null;
                g.el.removeAttribute('data-kp-panning');
            }
        };
        /** A drag must not end as a pick. @param {MouseEvent} event */
        const onClickCapture = (event) => {
            if (!dragged) return;
            dragged = false;
            event.stopPropagation();
            event.preventDefault();
        };
        /** @param {WheelEvent} event */
        const onWheel = (event) => {
            if (!g.options.zoom) return;
            event.preventDefault();
            const unit = event.deltaMode === 1 ? 0.05 : event.ctrlKey ? 0.01 : 0.0015;
            const at = pictureAt(g, event.clientX, event.clientY);
            zoomTo(g, g.view.k * Math.exp(-event.deltaY * unit), at.x, at.y);
        };
        /** The keys of a zoomed picture: + - 0 and Shift+arrows. @param {KeyboardEvent} event */
        const zoomKey = (event) => {
            if (!g.options.zoom || event.ctrlKey || event.metaKey || event.altKey) return false;
            const [W, H] = g.size;
            if (event.key === '+' || event.key === '=') zoomTo(g, g.view.k * ZOOM_STEP, W / 2, H / 2, true);
            else if (event.key === '-' || event.key === '_') zoomTo(g, g.view.k / ZOOM_STEP, W / 2, H / 2, true);
            else if (event.key === '0') {
                g.view = { k: 1, x: 0, y: 0 };
                applyView(g, true);
            } else if (event.shiftKey && event.key.startsWith('Arrow')) {
                const step = 56;
                g.view.x += event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
                g.view.y += event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
                clampView(g);
                applyView(g, true);
            } else return false;
            event.preventDefault();
            return true;
        };
        /** @param {MouseEvent} event */
        const onZoomBox = (event) => {
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            if (!button || button.getAttribute('aria-disabled') === 'true') return;
            graphZoom(el, button === zoomIn ? 'in' : button === zoomOut ? 'out' : 'reset');
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const node = nodeOf(event.target);
            if (!node) return;
            if (zoomKey(event)) return;
            const nodes = order();
            const at = nodes.indexOf(node);
            const hasHub = !!svg.querySelector('.kp-graph__node--hub');
            const ringStart = hasHub ? 1 : 0;
            const ringCount = nodes.length - ringStart;
            /** @type {number | null} */
            let to = null;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
                to = at < ringStart ? ringStart : ringStart + ((at - ringStart + 1) % ringCount);
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
                to = at < ringStart ? nodes.length - 1 : ringStart + ((at - ringStart - 1 + ringCount) % ringCount);
            else if (event.key === 'Home') to = 0;
            else if (event.key === 'End') to = nodes.length - 1;
            else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle(node.getAttribute('data-kp-id') ?? '');
                return;
            } else if (event.key === 'Escape') {
                if (closeDetail(false) || clear()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }
            if (to == null || !nodes[to] || ringCount < 1) return;
            event.preventDefault();
            focusNode(nodes[to]);
        };
        /** @param {MouseEvent} event */
        const onKind = (event) => {
            const button = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest('[data-kp-kind]') : null);
            if (!button) return;
            const kind = button.dataset.kpKind ?? '';
            graphHideKind(el, kind, !g.hidden.has(kind));
        };
        const onShowAll = () => clear();
        /** @param {MouseEvent} event */
        const onPanel = (event) => {
            if (event.target instanceof Element && event.target.closest('.kp-graph__detail-close')) closeDetail(true);
        };
        /** @param {KeyboardEvent} event */
        const onPanelKey = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (closeDetail(true)) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        /** @param {KeyboardEvent} event */
        const onDocKey = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (/** @type {Element | null} */ (event.target)?.closest?.('dialog, input, textarea, select, [role="menu"]')) return;
            if (!closeDetail(false)) clear();
        };
        svg.addEventListener('pointerover', onOver);
        svg.addEventListener('pointerout', onOut);
        svg.addEventListener('focusin', onFocus);
        svg.addEventListener('focusout', onBlur);
        svg.addEventListener('click', onClickCapture, true);
        svg.addEventListener('click', onClick);
        svg.addEventListener('keydown', onKey);
        svg.addEventListener('pointerdown', onDown);
        svg.addEventListener('pointermove', onMove);
        svg.addEventListener('pointerup', onUp);
        svg.addEventListener('pointercancel', onUp);
        svg.addEventListener('wheel', onWheel, { passive: false });
        zoomBox.addEventListener('click', onZoomBox);
        panel.addEventListener('click', onPanel);
        panel.addEventListener('keydown', onPanelKey);
        legend.addEventListener('click', onKind);
        showAll.addEventListener('click', onShowAll);
        doc.addEventListener('keydown', onDocKey);
        // Only a new width redraws: a taller box (a side panel growing beside
        // it) must never rebuild a node under the pointer.
        const sizes = view
            ? new view.ResizeObserver(() => {
                  if (box.clientWidth !== g.drawnWidth) drawGraph(g);
              })
            : null;
        sizes?.observe(box);
        // An option changed on the graph (its attribute): draw it again with the new option. Not a hover, a pick or a hidden kind.
        const options = view ? new view.MutationObserver(() => drawGraph(g)) : null;
        options?.observe(el, { attributes: true, attributeFilter: GRAPH_OPTION_ATTRIBUTES });
        // A web font that arrives after the drawing changes every label's
        // width: fit them again, in place (no node is rebuilt). Names that
        // stand whole need the room measured again, so that mode draws again.
        const onFonts = () => {
            if (g.options.labels === 'below') {
                drawGraph(g);
                return;
            }
            for (const l of g.labels) {
                l.length = l.full.length;
                l.text.textContent = l.full;
            }
            if (isShown(svg)) fitDrawnLabels(g.labels, g.size[0], g.size[1]);
        };
        doc.fonts?.addEventListener('loadingdone', onFonts);
        undo.push(() => {
            doc.fonts?.removeEventListener('loadingdone', onFonts);
            sizes?.disconnect();
            options?.disconnect();
            svg.removeEventListener('pointerover', onOver);
            svg.removeEventListener('pointerout', onOut);
            svg.removeEventListener('focusin', onFocus);
            svg.removeEventListener('focusout', onBlur);
            svg.removeEventListener('click', onClickCapture, true);
            svg.removeEventListener('click', onClick);
            svg.removeEventListener('keydown', onKey);
            svg.removeEventListener('pointerdown', onDown);
            svg.removeEventListener('pointermove', onMove);
            svg.removeEventListener('pointerup', onUp);
            svg.removeEventListener('pointercancel', onUp);
            svg.removeEventListener('wheel', onWheel);
            zoomBox.removeEventListener('click', onZoomBox);
            panel.removeEventListener('click', onPanel);
            panel.removeEventListener('keydown', onPanelKey);
            legend.removeEventListener('click', onKind);
            showAll.removeEventListener('click', onShowAll);
            doc.removeEventListener('keydown', onDocKey);
            graphs.delete(el);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}
