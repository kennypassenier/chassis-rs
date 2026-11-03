// The pieces of the drawn graph: the edges with their arrow heads, the nodes with their names, and the legend of kinds.

import { graphArrow, graphBends } from './labels.js';
import { keyOf, ringOf } from './layout.js';
import { make, radiusOf, svgEl } from './instance.js';
/** @typedef {import('./instance.js').DrawnLabel} DrawnLabel */
/** @typedef {import('./instance.js').GraphModel} GraphModel */
/** @typedef {import('./options.js').GraphNode} GraphNode */
/** @typedef {NonNullable<GraphModel['data']>} GraphData */

/**
 * The edges and their arrow heads of the world, one path each.
 * @param {Document} doc
 * @param {GraphData} data
 * @param {Map<string, { x: number, y: number, angle: number }>} at
 * @param {number} base
 */
export function drawEdges(doc, data, at, base) {
    const edges = svgEl(doc, 'g', { class: 'kp-graph__edges' });
    const bends = graphBends(data.edges);
    const kinds = new Map(data.kinds.map((k) => [k.kind, k]));
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    const name = (/** @type {string} */ id) => byId.get(id)?.label ?? id;
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
        if (kind?.colour) path.style.setProperty('--kp-graph-edge-colour', kind.colour);
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
            if (kind?.colour) head.style.setProperty('--kp-graph-edge-colour', kind.colour);
            edges.append(head);
        }
    });
    return edges;
}

/**
 * The nodes with their names, appended to the world; returns the drawn labels. Sets the keyboard focus to the first node when it is not on one.
 * @param {GraphModel} g
 * @param {SVGGElement} world
 * @param {{ data: GraphData, at: Map<string, { x: number, y: number, angle: number }>, base: number, hub: string | null, wraps: Map<string, string[]> }} parts
 * @returns {DrawnLabel[]}
 */
export function drawNodes(g, world, { data, at, base, hub, wraps }) {
    const doc = g.el.ownerDocument;
    const below = g.options.labels === 'below';
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
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
        if (!n.external) node.style.setProperty('--kp-graph-hue', String(n.hue ?? Math.round((sorted.indexOf(n) / Math.max(1, sorted.length)) * 360)));
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
    return labels;
}

/** The kinds: one toggle per kind the edges use, none when nothing links. @param {GraphModel} g @param {Document} doc @param {GraphData} data */
export function drawLegend(g, doc, data) {
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
            line.style.setProperty('--kp-graph-edge-colour', k.colour);
            sample.append(line);
            button.append(sample, make(doc, 'span', '', k.label));
            li.append(button);
            g.decorate?.(button, { kind: 'kind', host: g.el, key: keyOf(g.el), index, value: k.kind, label: k.label });
            return li;
        }),
    );
    g.legend.hidden = present.length === 0 || data.nodes.length < 2;
}
