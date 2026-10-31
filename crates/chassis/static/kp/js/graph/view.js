// The graph's view: restyle, zoom, pan, reveal and the detail panel.
import { GRAPH_CHANGE_EVENT, GRAPH_DETAIL_EVENT } from './constants.js';
import { fitGraphLabels, graphBends, graphLabelText } from './labels.js';
import { graphLayout, hubOf, keyOf, ringOf } from './layout.js';
import { ZOOM_MAX, ZOOM_MIN, make, radiusOf, svgEl } from './instance.js';
/** @typedef {import('./instance.js').DrawnLabel} DrawnLabel */
/** @typedef {import('./options.js').GraphData} GraphData */
/** @typedef {import('./options.js').GraphDetailInfo} GraphDetailInfo */
/** @typedef {import('./layout.js').GraphLayoutOptions} GraphLayoutOptions */
/** @typedef {import('./instance.js').GraphModel} GraphModel */
/** @typedef {import('./options.js').GraphOptions} GraphOptions */

let detailCount = 0;
/** @param {GraphModel} g */
export function graphChanged(g) {
    g.el.dispatchEvent(
        new CustomEvent(GRAPH_CHANGE_EVENT, {
            bubbles: true,
            detail: { selected: [...g.selected], hover: g.hover, hiddenKinds: [...g.hidden], detail: g.detail },
        }),
    );
}
/** Selection, hover and hidden kinds change classes only, never the nodes. @param {GraphModel} g */
export function restyleGraph(g) {
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
export function fitDrawnLabels(labels, W, H) {
    fitGraphLabels(labels, W, H, (l) => {
        const text = graphLabelText(l.full, l.length);
        if (l.text.textContent !== text) l.text.textContent = text;
        return l.text.getBBox();
    });
}
/** The strip kept clear at the top and the bottom for what is drawn inside the picture: Show all and the zoom controls over the top, the hint, as tall as it is, at the foot [graph-1020]. @param {GraphOptions} o @param {number} hintHeight */
export const insetOf = (o, hintHeight) => ({
    top: o.chrome === 'inside' || o.zoom ? 44 : 0,
    bottom: o.chrome === 'inside' ? Math.max(34, Math.ceil(hintHeight) + 12) : 0,
});
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
export function ghostOf(doc, last, W, H, layoutOptions, base) {
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
export function applyView(g, eased = false) {
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
export function clampView(g) {
    const [W, H] = g.size;
    const keep = 60;
    const { view } = g;
    view.x = Math.min(W - keep, Math.max(keep - W * view.k, view.x));
    view.y = Math.min(H - keep, Math.max(keep - H * view.k, view.y));
}
/** Zoom to `k` about the picture point (px, py), so the point under the pointer stays under it. @param {GraphModel} g @param {number} k @param {number} px @param {number} py @param {boolean} [eased] */
export function zoomTo(g, k, px, py, eased = false) {
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
export function pictureAt(g, clientX, clientY) {
    const rect = g.svg.getBoundingClientRect();
    const [W, H] = g.size;
    return { x: ((clientX - rect.left) * W) / (rect.width || W), y: ((clientY - rect.top) * H) / (rect.height || H) };
}
/** Bring a node into the view without moving it further than needed (a focus walk on a zoomed picture). @param {GraphModel} g @param {string | null} id */
export function revealNode(g, id) {
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
export function placeChrome(g) {
    const inside = g.options.chrome === 'inside';
    const showParent = inside ? g.box : g.bar;
    if (g.showAll.parentElement !== showParent) showParent.append(g.showAll);
    if (inside) {
        if (g.hint.parentElement !== g.box) g.box.append(g.hint);
    } else if (g.hint.parentElement !== g.el) g.box.after(g.hint);
}
/** The words under the picture follow the options on: they are what a pointer and the keys do now. @param {GraphModel} g */
export function sayHint(g) {
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
export function renderDetail(g) {
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
    // The panel exists only while a node is picked: a page-wide heading anchor (js/anchors.js) would add a copy-link to it [HL 138].
    title.setAttribute('data-kp-anchors', 'off');
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
