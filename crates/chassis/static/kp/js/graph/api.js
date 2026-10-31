// The functions a page calls to fill and drive the graph.
import { ZOOM_STEP, graphs } from './instance.js';
import { drawGraph } from './draw.js';
import { applyView, graphChanged, renderDetail, restyleGraph, zoomTo } from './view.js';
/** @typedef {import('./options.js').GraphData} GraphData */

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
export function dataChild(el) {
    const script = el.querySelector(':scope > script[data-kp-graph-data]');
    if (!script) return null;
    try {
        return JSON.parse(script.textContent ?? '');
    } catch {
        return null;
    }
}
