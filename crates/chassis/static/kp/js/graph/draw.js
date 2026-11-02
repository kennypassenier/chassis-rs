// Draws the graph: nodes, edges and labels.
import { hostStatePlate } from '../state-plate.js';
import { graphOptionsOf } from './options.js';
import { applyView, fitDrawnLabels, ghostOf, insetOf, placeChrome, renderDetail, restyleGraph, sayHint } from './view.js';
import { isShown, radiusOf, svgEl } from './instance.js';
import { graphLayout, graphRoom, hubOf } from './layout.js';
import { GRAPH_RETRY_EVENT } from './constants.js';
import { drawEdges, drawLegend, drawNodes } from './draw-parts.js';
import { SIDE_ROOM, graphLabelLines, groupsTouching } from './label-lines.js';
/** @typedef {import('./instance.js').DrawnLabel} DrawnLabel */
/** @typedef {import('./layout.js').GraphLayoutOptions} GraphLayoutOptions */
/** @typedef {import('./instance.js').GraphModel} GraphModel */
/** @typedef {import('./options.js').GraphNode} GraphNode */

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
    // A height the page gives wins over the one from the width: a hub with three nodes needs no 420 px [kyu-1101 graph-height].
    let H = o.height ?? (W < 600 ? 480 : Math.max(420, Math.min(560, Math.round(W * 0.6))));
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
    const world = /** @type {SVGGElement} */ (svgEl(doc, 'g', { class: 'kp-graph__world' }));
    g.world = world;
    const edges = drawEdges(doc, data, at, base);
    world.append(edges);
    const labels = drawNodes(g, world, { data, at, base, hub, wraps });
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
    drawLegend(g, doc, data);
    restyleGraph(g);
    renderDetail(g);
    applyView(g);
    if (hadFocus) /** @type {SVGGElement | null} */ (g.svg.querySelector(`[data-kp-id="${CSS.escape(hadFocus)}"]`))?.focus();
}
