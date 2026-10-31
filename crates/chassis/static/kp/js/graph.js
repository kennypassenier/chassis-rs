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

export { GRAPH, GRAPH_CHANGE_EVENT, GRAPH_RETRY_EVENT, GRAPH_DETAIL_EVENT, GRAPH_OPTION_ATTRIBUTES } from './graph/constants.js';
export { graphOptionsOf, setGraphOptions } from './graph/options.js';
export { hubOf, ringOf, graphLayout, graphRoom } from './graph/layout.js';
export { graphArrow, graphBends, graphLabelText, fitGraphLabels } from './graph/labels.js';
export { setGraphData, setGraphState, graphSelect, graphHideKind, graphDetail, graphZoom } from './graph/api.js';
export { attachGraphs } from './graph/attach.js';

/** @typedef {import('./graph/options.js').GraphNode} GraphNode */
/** @typedef {import('./graph/options.js').GraphEdge} GraphEdge */
/** @typedef {import('./graph/options.js').GraphKind} GraphKind */
/** @typedef {import('./graph/options.js').GraphData} GraphData */
/** @typedef {import('./graph/options.js').GraphDecorateInfo} GraphDecorateInfo */
/** @typedef {import('./graph/options.js').GraphDetailInfo} GraphDetailInfo */
/** @typedef {import('./graph/options.js').GraphOptions} GraphOptions */
/** @typedef {import('./graph/layout.js').GraphLayoutOptions} GraphLayoutOptions */
/** @typedef {import('./graph/layout.js').GraphRing} GraphRing */
/** @typedef {import('./graph/labels.js').GraphLabel} GraphLabel */
/** @typedef {import('./graph/labels.js').GraphBox} GraphBox */
/** @typedef {import('./graph/instance.js').DrawnLabel} DrawnLabel */
/** @typedef {import('./graph/instance.js').GraphView} GraphView */
/** @typedef {import('./graph/instance.js').GraphModel} GraphModel */
