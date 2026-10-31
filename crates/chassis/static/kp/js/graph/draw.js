// Draws the graph: nodes, edges and labels.
import { hostStatePlate } from '../state-plate.js';
import { graphOptionsOf } from './options.js';
import { applyView, fitDrawnLabels, ghostOf, insetOf, placeChrome, renderDetail, restyleGraph, sayHint } from './view.js';
import { isShown, make, radiusOf, svgEl } from './instance.js';
import { graphLayout, graphRoom, hubOf, keyOf, ringOf } from './layout.js';
import { GRAPH_RETRY_EVENT } from './constants.js';
import { graphArrow, graphBends } from './labels.js';
/** @typedef {import('./instance.js').DrawnLabel} DrawnLabel */
/** @typedef {import('./layout.js').GraphLayoutOptions} GraphLayoutOptions */
/** @typedef {import('./instance.js').GraphModel} GraphModel */
/** @typedef {import('./options.js').GraphNode} GraphNode */

/**
 * The room tried, in order, for names beside the ring at a phone width [graph-1020]: the picture as tall as ever, then taller; on each
 * height the ring as wide as ever, then a little narrower or wider; on each width the ring unturned, then turned a quarter step at a time.
 */
const SIDE_ROOM = [1, 1.1, 1.2, 1.3, 1.4].flatMap((height) =>
    [1, 0.9, 1.1, 0.8, 1.2].flatMap((stretch) => [0, 0.25, 0.5, 0.75].map((phase) => ({ height, stretch, phase }))),
);
/** How many pairs of node groups (a node and its name) of a drawn world come closer than 3 px? @param {SVGGElement} world */
function groupsTouching(world) {
    const boxes = [...world.querySelectorAll('.kp-graph__node')].map((n) => /** @type {SVGGraphicsElement} */ (n).getBBox());
    const gap = 3;
    let pairs = 0;
    for (const [i, a] of boxes.entries())
        for (const b of boxes.slice(i + 1))
            if (a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap) pairs += 1;
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
export function drawGraph(g, attempt = 0, tried = { best: 0, count: Infinity, locked: false }) {
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
    const layoutOptions = {
        ...(o.ring != null ? { ring: o.ring } : {}),
        inset,
        ...((!below && W < 600 && roomy.phase) || roomy.stretch !== 1 ? { phase: roomy.phase, stretch: roomy.stretch } : {}),
    };
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
