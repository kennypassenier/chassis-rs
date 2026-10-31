// Attaches the graphs of a page: one GraphControl per graph element.
import { attachAll } from '../controller.js';
import { GRAPH } from './constants.js';
import { GraphControl } from './controller.js';
/** @typedef {import('./options.js').GraphDecorateInfo} GraphDecorateInfo */
/** @typedef {import('./options.js').GraphDetailInfo} GraphDetailInfo */

/**
 * Build every graph under `root`: a bar with the kinds and Show all, the
 * picture (one tab stop: arrows between nodes, Enter or Space picks, Esc
 * shows all), and the hint under it in the page's flow. A graph's data is the
 * page's: a `script[type="application/json"][data-kp-graph-data]` child, or
 * `setGraphData()` after the attach; until then it shows loading. The options
 * are attributes on the graph (see the top of this file); `detail` is the hook
 * that fills a picked node's details panel.
 * @param {ParentNode} [root]
 * @param {{ decorate?: (part: Element, info: GraphDecorateInfo) => void, strings?: Partial<import('../strings.js').Strings>,
 *   detail?: (info: GraphDetailInfo) => Node | string | null | void }} [options]
 * @returns {() => void} detach
 */
export function attachGraphs(root = document, { decorate, strings, detail } = {}) {
    return attachAll(root, GRAPH, GraphControl, { decorate, strings, detail });
}
