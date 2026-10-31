// The picks, the hover and the details of one graph, changed on its model: each change restyles the picture and tells the page.
import { graphChanged, renderDetail, restyleGraph } from './view.js';
/** @typedef {import('./instance.js').GraphModel} GraphModel */

/** Restyle the picture and tell the page. @param {GraphModel} g */
const changed = (g) => {
    restyleGraph(g);
    graphChanged(g);
};

/**
 * Pick or unpick a node; a pick opens its details, taking the node out closes them if they were its.
 * @param {GraphModel} g
 * @param {string} id
 */
export function togglePick(g, id) {
    if (g.selected.has(id)) g.selected.delete(id);
    else g.selected.add(id);
    if (g.options.detail) {
        if (g.selected.has(id)) g.detail = id;
        else if (g.detail === id) g.detail = null;
        renderDetail(g);
    }
    changed(g);
}

/** @param {GraphModel} g @param {string | null} id */
export function setHover(g, id) {
    if (g.hover === id) return;
    g.hover = id;
    changed(g);
}

/** Show all: no picks, no hidden kinds, no details; false when there was nothing to clear. @param {GraphModel} g */
export function showAll(g) {
    if (g.selected.size === 0 && g.hidden.size === 0 && !g.detail) return false;
    g.selected.clear();
    g.hidden.clear();
    g.detail = null;
    renderDetail(g);
    changed(g);
    return true;
}

/**
 * Esc closes the details first and keeps the picks; the next Esc shows all. False when no details were open.
 * @param {GraphModel} g
 * @param {boolean} refocus put the focus back on the node the details were of
 */
export function closeDetail(g, refocus) {
    if (!g.detail) return false;
    const id = g.detail;
    g.detail = null;
    renderDetail(g);
    changed(g);
    if (refocus) /** @type {SVGGElement | null} */ (g.svg.querySelector(`[data-kp-id="${CSS.escape(id)}"]`))?.focus();
    return true;
}
