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
//
// and the pure halves the drawing is made of: hubOf(), ringOf(),
// graphLayout(), graphBends(), graphLabelText() and fitGraphLabels(). A
// hover, a pick or a hidden kind changes classes only, never a node, so the
// element under the pointer is never rebuilt. Nothing runs on import; the
// attach function returns a detach.

import { resolveStrings } from './strings.js';

/** A hub-and-ring graph: `figure.kp-graph[data-kp-graph]`. */
export const GRAPH = '[data-kp-graph]';
/** Fired on the graph, bubbling, when its selection, hover or hidden kinds change: `detail` `{ selected, hover, hiddenKinds }`. */
export const GRAPH_CHANGE_EVENT = 'kp-graph-change';

/**
 * @typedef {{ id: string, label: string, kind?: string, hue?: number, weight?: number | null,
 *   flag?: 'mismatch' | null, description: string, external?: boolean }} GraphNode
 * @typedef {{ from: string, to: string, kind: string, detail?: string }} GraphEdge
 * @typedef {{ kind: string, label: string, hint: string, style: 'solid' | 'dash' | 'dot' | 'long-dash', colour: string }} GraphKind
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[], kinds: GraphKind[], hub?: string }} GraphData
 */

/**
 * What `decorate` is told about the control it is handed: the same shape every kp module's `decorate` takes
 * (`DataTableDecorateInfo`). `kind` is `node` (a node of the picture; `value` is its id, `label` its name), `kind` (a
 * toggle in the list of kinds; `value` is the kind) or `show-all`. `host` is the graph and `key` its `data-kp-key`.
 * @typedef {{ kind: 'node' | 'kind' | 'show-all', host: HTMLElement, key?: string, index?: number, label?: string, value?: string }} GraphDecorateInfo
 */

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
 * Where every node sits in a W×H box: the hub in the middle, the others on an
 * ellipse around it (stretched sideways on a wide box). On a narrow box the
 * ellipse gives up width for height, so the labels beside the ring keep room.
 * @param {GraphData} data
 * @param {number} W
 * @param {number} H
 * @returns {Map<string, { x: number, y: number, angle: number }>}
 */
export function graphLayout(data, W, H) {
    /** @type {Map<string, { x: number, y: number, angle: number }>} */
    const at = new Map();
    const hub = hubOf(data);
    const cx = W / 2;
    const cy = H / 2 - 10;
    const R = Math.min(W, H) * 0.36;
    let rx = R * (W > 600 ? 1.35 : 1);
    let ry = R;
    if (W < 600) {
        rx = Math.min(rx, W * 0.24);
        ry = Math.max(ry, H * 0.36);
    }
    if (hub) at.set(hub, { x: cx, y: cy, angle: Math.PI / 2 });
    const ring = ringOf(data, hub);
    ring.forEach((n, i) => {
        const angle = -Math.PI / 2 + (i / Math.max(1, ring.length)) * Math.PI * 2;
        at.set(n.id, { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry, angle });
    });
    return at;
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

/** A node's radius: 14, or 10 to 24 by its weight; an outside node 9. @param {GraphNode} n */
const radiusOf = (n) => (n.external ? 9 : n.weight != null ? 10 + 14 * Math.sqrt(Math.max(0, Math.min(1, n.weight))) : 14);

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
 * @typedef {{ el: HTMLElement, data: GraphData | null, state: 'loading' | 'ready' | 'empty' | 'error', words: string,
 *   selected: Set<string>, hidden: Set<string>, hover: string | null, focus: string | null, drawnWidth: number,
 *   bar: HTMLElement, showAll: HTMLButtonElement, legend: HTMLElement, box: HTMLElement, svg: SVGSVGElement,
 *   note: HTMLElement, hint: HTMLElement, decorate?: (part: Element, info: GraphDecorateInfo) => void,
 *   strings: import('./strings.js').Strings, labels: DrawnLabel[], size: [number, number] }} GraphModel
 */

/** @type {WeakMap<Element, GraphModel>} */
const graphs = new WeakMap();

/** @param {GraphModel} g */
function graphChanged(g) {
    g.el.dispatchEvent(
        new CustomEvent(GRAPH_CHANGE_EVENT, { bubbles: true, detail: { selected: [...g.selected], hover: g.hover, hiddenKinds: [...g.hidden] } }),
    );
}

/** Selection, hover and hidden kinds change classes only, never the nodes. @param {GraphModel} g */
function restyleGraph(g) {
    const lit = new Set(g.selected);
    if (g.hover) lit.add(g.hover);
    g.el.toggleAttribute('data-kp-focus', lit.size > 0);
    const on = new Set(lit);
    for (const path of g.svg.querySelectorAll('.kp-graph__edge')) {
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
    g.showAll.toggleAttribute('data-kp-idle', g.selected.size === 0 && g.hidden.size === 0);
}

/** Fit the drawn labels, writing each shortened text into its element. @param {DrawnLabel[]} labels @param {number} W @param {number} H */
function fitDrawnLabels(labels, W, H) {
    fitGraphLabels(labels, W, H, (l) => {
        const text = graphLabelText(l.full, l.length);
        if (l.text.textContent !== text) l.text.textContent = text;
        return l.text.getBBox();
    });
}

/** Draw the whole graph for the box's width. @param {GraphModel} g */
function drawGraph(g) {
    const doc = g.el.ownerDocument;
    const width = g.box.clientWidth;
    g.drawnWidth = width;
    const W = Math.max(280, width || 800);
    const H = W < 600 ? 480 : Math.max(420, Math.min(560, Math.round(W * 0.6)));
    g.box.style.setProperty('--kp-graph-h', `${H}px`);
    g.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    g.svg.setAttribute('height', String(H));
    const hadFocus = g.svg.contains(doc.activeElement) ? g.focus : null;
    g.svg.replaceChildren();
    const data = g.data;
    g.el.dataset.kpState = g.state;
    g.note.textContent = g.state === 'ready' ? '' : g.state === 'loading' ? g.words || g.strings.graphLoading : g.words;
    g.note.hidden = g.state === 'ready';
    if (g.state === 'loading') {
        g.svg.append(
            svgEl(doc, 'ellipse', {
                class: 'kp-graph__skeleton',
                cx: W / 2,
                cy: H / 2 - 10,
                rx: W < 600 ? Math.min(W * 0.24, Math.min(W, H) * 0.36) : Math.min(W, H) * 0.36 * 1.35,
                ry: Math.min(W, H) * 0.36,
            }),
        );
    }
    if (g.state !== 'ready' || !data) {
        g.legend.replaceChildren();
        g.legend.hidden = true;
        g.showAll.setAttribute('data-kp-idle', '');
        return;
    }
    const at = graphLayout(data, W, H);
    const hub = hubOf(data);
    const bends = graphBends(data.edges);
    const kinds = new Map(data.kinds.map((k) => [k.kind, k]));
    const name = (/** @type {string} */ id) => data.nodes.find((n) => n.id === id)?.label ?? id;
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
    });
    g.svg.append(edges);
    // Hues spread evenly over the nodes in label order, unless a node has its own.
    const sorted = data.nodes.filter((n) => !n.external).sort((a, b) => a.label.localeCompare(b.label));
    /** @type {DrawnLabel[]} */
    const labels = [];
    const ring = ringOf(data, hub);
    const order = [...(hub ? [hub] : []), ...ring.map((n) => n.id)];
    if (!g.focus || !order.includes(g.focus)) g.focus = order[0] ?? null;
    order.forEach((id, index) => {
        const n = /** @type {GraphNode} */ (data.nodes.find((x) => x.id === id));
        const p = at.get(id);
        if (!p) return;
        const r = radiusOf(n);
        const node = svgEl(doc, 'g', {
            class: `kp-graph__node${n.external ? ' kp-graph__node--external' : ''}${id === hub ? ' kp-graph__node--hub' : ''}`,
            'data-kp-id': id,
            role: 'button',
            tabindex: id === g.focus ? 0 : -1,
            'aria-pressed': String(g.selected.has(id)),
            'aria-label': `${n.label}, ${n.description}`,
        });
        if (!n.external) node.setAttribute('style', `--kp-graph-hue: ${n.hue ?? Math.round((sorted.indexOf(n) / Math.max(1, sorted.length)) * 360)}`);
        const title = svgEl(doc, 'title');
        title.textContent = `${n.label}: ${n.description}`;
        node.append(title, svgEl(doc, 'circle', { class: 'kp-graph__ring', cx: p.x, cy: p.y, r }));
        if (!n.external) node.append(svgEl(doc, 'circle', { class: 'kp-graph__core', cx: p.x, cy: p.y, r: Math.max(4, r - 6) }));
        if (n.flag === 'mismatch') node.append(svgEl(doc, 'circle', { class: 'kp-graph__flag', cx: p.x, cy: p.y, r: r + 5 }));
        // The label points away from the hub: beside the node on the ring's
        // sides, over it at the top, under it at the bottom and for the hub.
        const dx = id === hub ? 0 : Math.cos(p.angle);
        const dy = id === hub ? 1 : Math.sin(p.angle);
        const off = r + (n.flag === 'mismatch' ? 10 : 6);
        const anchor = dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle';
        const lx = p.x + dx * off;
        const ly = p.y + dy * off + (dy > 0.35 ? 9 : dy < -0.35 ? -3 : 4);
        const text = /** @type {SVGTextElement} */ (
            svgEl(doc, 'text', { class: 'kp-graph__label', x: lx.toFixed(1), y: ly.toFixed(1), 'text-anchor': anchor })
        );
        text.textContent = n.label;
        text.setAttribute('aria-hidden', 'true');
        node.append(text);
        labels.push({ text, full: n.label, length: n.label.length });
        g.svg.append(node);
        g.decorate?.(node, { kind: 'node', host: g.el, key: keyOf(g.el), index, value: id, label: n.label });
    });
    g.labels = labels;
    g.size = [W, H];
    if (isShown(g.svg)) fitDrawnLabels(labels, W, H);
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
    for (const id of [...g.selected]) if (!ids.has(id)) g.selected.delete(id);
    if (g.hover && !ids.has(g.hover)) g.hover = null;
    drawGraph(g);
    if (g.selected.size !== before) graphChanged(g);
}

/**
 * `loading`, `empty` or `error`, with the sentence to show in the picture at
 * its final height (loading says `graphLoading` when given none).
 * @param {Element} el
 * @param {'loading' | 'empty' | 'error'} state
 * @param {string} [words]
 */
export function setGraphState(el, state, words = '') {
    const g = graphs.get(el);
    if (!g) return;
    g.state = state;
    g.words = words;
    drawGraph(g);
}

/** Pick these nodes (and only these). @param {Element} el @param {string[]} ids */
export function graphSelect(el, ids) {
    const g = graphs.get(el);
    if (!g) return;
    g.selected = new Set(ids);
    restyleGraph(g);
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
 * `setGraphData()` after the attach; until then it shows loading.
 * @param {ParentNode} [root]
 * @param {{ decorate?: (part: Element, info: GraphDecorateInfo) => void, strings?: Partial<import('./strings.js').Strings> }} [options]
 * @returns {() => void} detach
 */
export function attachGraphs(root = document, { decorate, strings } = {}) {
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
        box.append(svg, note);
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
            hint,
            decorate,
            strings: s,
            labels: [],
            size: [0, 0],
        };
        graphs.set(el, g);
        decorate?.(showAll, { kind: 'show-all', host: el, key: keyOf(el) });
        if (initial) setGraphData(el, initial);
        else drawGraph(g);
        const nodeOf = (/** @type {EventTarget | null} */ target) =>
            /** @type {SVGGElement | null} */ (target instanceof Element ? target.closest('.kp-graph__node') : null);
        const toggle = (/** @type {string} */ id) => {
            if (g.selected.has(id)) g.selected.delete(id);
            else g.selected.add(id);
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
            if (g.selected.size === 0 && g.hidden.size === 0) return false;
            g.selected.clear();
            g.hidden.clear();
            restyleGraph(g);
            graphChanged(g);
            return true;
        };
        const order = () => /** @type {SVGGElement[]} */ ([...svg.querySelectorAll('.kp-graph__node')]);
        const focusNode = (/** @type {SVGGElement} */ node) => {
            for (const other of order()) other.setAttribute('tabindex', other === node ? '0' : '-1');
            g.focus = node.getAttribute('data-kp-id');
            node.focus();
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
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const node = nodeOf(event.target);
            if (!node) return;
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
                if (clear()) {
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
        /** @param {KeyboardEvent} event */
        const onDocKey = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (/** @type {Element | null} */ (event.target)?.closest?.('dialog, input, textarea, select, [role="menu"]')) return;
            clear();
        };
        svg.addEventListener('pointerover', onOver);
        svg.addEventListener('pointerout', onOut);
        svg.addEventListener('focusin', onFocus);
        svg.addEventListener('focusout', onBlur);
        svg.addEventListener('click', onClick);
        svg.addEventListener('keydown', onKey);
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
        // A web font that arrives after the drawing changes every label's
        // width: fit them again, in place (no node is rebuilt).
        const onFonts = () => {
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
            svg.removeEventListener('pointerover', onOver);
            svg.removeEventListener('pointerout', onOut);
            svg.removeEventListener('focusin', onFocus);
            svg.removeEventListener('focusout', onBlur);
            svg.removeEventListener('click', onClick);
            svg.removeEventListener('keydown', onKey);
            legend.removeEventListener('click', onKind);
            showAll.removeEventListener('click', onShowAll);
            doc.removeEventListener('keydown', onDocKey);
            graphs.delete(el);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}
