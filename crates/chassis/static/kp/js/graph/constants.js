// The event names and option attributes of the network graph.

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
    'data-kp-graph-height',
];

/** On the graph: the key that zooms in (a key spec, js/key-spec.js; `none` for no key; the `or` list gives several keys). */
export const GRAPH_ZOOM_IN_KEY_ATTRIBUTE = 'data-kp-zoom-in-key';
/** The keys that zoom in when the graph names none (`=` is the unshifted key of `+` on a US layout). */
export const GRAPH_ZOOM_IN_KEY = '+ or =';
/** On the graph: the key that zooms out. */
export const GRAPH_ZOOM_OUT_KEY_ATTRIBUTE = 'data-kp-zoom-out-key';
/** The keys that zoom out when the graph names none (`_` is the shifted key of `-`). */
export const GRAPH_ZOOM_OUT_KEY = '- or _';
/** On the graph: the key that resets the zoom. */
export const GRAPH_ZOOM_RESET_KEY_ATTRIBUTE = 'data-kp-zoom-reset-key';
/** The key that resets the zoom when the graph names none. */
export const GRAPH_ZOOM_RESET_KEY = '0';
