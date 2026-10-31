// Reads and sets the graph's options.

/**
 * @typedef {{ id: string, label: string, kind?: string, hue?: number, colour?: string, radius?: number, weight?: number | null,
 *   flag?: 'mismatch' | null, description: string, external?: boolean }} GraphNode
 * @typedef {{ from: string, to: string, kind: string, detail?: string, arrows?: 'to' | 'from' | 'both' | 'none' }} GraphEdge
 * @typedef {{ kind: string, label: string, hint: string, style: 'solid' | 'dash' | 'dot' | 'long-dash', colour: string }} GraphKind
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[], kinds: GraphKind[], hub?: string }} GraphData
 */

/**
 * What `decorate` is told about the control it is handed: the same shape every kp module's `decorate` takes
 * (`DataTableDecorateInfo`). `kind` is `node` (a node of the picture; `value` is its id, `label` its name), `kind` (a
 * toggle in the list of kinds; `value` is the kind), `show-all`, or one of the option controls [graph-1020]: `zoom-in`, `zoom-out`, `zoom-reset` and `detail-close` (`value` is the node whose details they close). `host` is the graph and `key` its `data-kp-key`.
 * @typedef {{ kind: 'node' | 'kind' | 'show-all' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'detail-close', host: HTMLElement, key?: string, index?: number, label?: string, value?: string }} GraphDecorateInfo
 */

/**
 * What the page hands the `detail` hook, and what the `kp-graph-detail` event carries: the picked node, the slot to fill
 * (an element inside the details panel) and the graph.
 * @typedef {{ id: string, node: GraphNode, slot: HTMLElement, host: HTMLElement, key?: string }} GraphDetailInfo
 * @typedef {{ labels: 'beside' | 'below', chrome: 'outside' | 'inside', colour: 'theme' | 'fixed', direction: 'none' | 'arrows',
 *   zoom: boolean, detail: boolean, ring: number | null, node: number | null }} GraphOptions
 */

/**
 * The graph's options as its attributes say them; anything missing or unreadable is the approved look.
 * @param {Element} host
 * @returns {GraphOptions}
 */
export function graphOptionsOf(host) {
    const num = (/** @type {string} */ name, /** @type {number} */ lo, /** @type {number} */ hi) => {
        const raw = host.getAttribute(name);
        const v = raw == null || raw.trim() === '' ? NaN : Number(raw);
        return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
    };
    const flag = (/** @type {string} */ name) => host.hasAttribute(name) && host.getAttribute(name) !== 'off' && host.getAttribute(name) !== 'false';
    return {
        labels: host.getAttribute('data-kp-labels') === 'below' ? 'below' : 'beside',
        chrome: host.getAttribute('data-kp-chrome') === 'inside' ? 'inside' : 'outside',
        colour: host.getAttribute('data-kp-colour') === 'fixed' ? 'fixed' : 'theme',
        direction: host.getAttribute('data-kp-direction') === 'arrows' ? 'arrows' : 'none',
        zoom: flag('data-kp-zoom'),
        detail: flag('data-kp-detail'),
        ring: num('data-kp-ring-radius', 0.15, 0.48),
        node: num('data-kp-node-radius', 6, 40),
    };
}
/**
 * Set options on a graph (they are attributes, so markup and script say the same thing); `null` or `false` takes one off.
 * @param {Element} el
 * @param {Partial<{ [K in keyof GraphOptions]: GraphOptions[K] | null | false }>} options
 */
export function setGraphOptions(el, options) {
    /** @type {Record<string, string>} */
    const names = {
        labels: 'data-kp-labels',
        chrome: 'data-kp-chrome',
        colour: 'data-kp-colour',
        direction: 'data-kp-direction',
        zoom: 'data-kp-zoom',
        detail: 'data-kp-detail',
        ring: 'data-kp-ring-radius',
        node: 'data-kp-node-radius',
    };
    for (const [key, value] of Object.entries(options)) {
        const name = names[key];
        if (!name) continue;
        if (value == null || value === false) el.removeAttribute(name);
        else el.setAttribute(name, value === true ? '' : String(value));
    }
}
