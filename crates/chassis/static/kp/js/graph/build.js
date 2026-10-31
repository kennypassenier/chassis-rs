// Builds the parts of one graph (the bar, the picture and the hint) and its model.
import { graphOptionsOf } from './options.js';
import { make, svgEl } from './instance.js';
/** @typedef {import('./options.js').GraphDecorateInfo} GraphDecorateInfo */
/** @typedef {import('./options.js').GraphDetailInfo} GraphDetailInfo */
/** @typedef {import('./instance.js').GraphModel} GraphModel */
/** @typedef {import('../strings.js').Strings} Strings */

/**
 * The bar above the picture: the list of kinds (hidden until there are kinds) and Show all.
 * @param {Document} doc
 * @param {Strings} s
 */
function buildBar(doc, s) {
    const bar = make(doc, 'div', 'kp-graph__bar');
    const legend = make(doc, 'ul', 'kp-graph__kinds');
    legend.setAttribute('aria-label', s.graphKinds);
    legend.hidden = true;
    const showAll = make(doc, 'button', 'kp-button kp-button--sm kp-graph__show-all', s.graphShowAll);
    showAll.type = 'button';
    showAll.title = s.graphShowAllTitle;
    showAll.setAttribute('data-kp-idle', '');
    bar.append(legend, showAll);
    return { bar, legend, showAll };
}

/**
 * The zoom controls inside the picture, hidden until the zoom option is on.
 * @param {Document} doc
 * @param {Strings} s
 */
function buildZoom(doc, s) {
    const zoomBox = make(doc, 'div', 'kp-graph__zoom');
    zoomBox.setAttribute('role', 'group');
    zoomBox.setAttribute('aria-label', s.graphZoom);
    zoomBox.hidden = true;
    const zoomOut = make(doc, 'button', 'kp-button kp-button--sm kp-graph__zoom-out', '−');
    const zoomIn = make(doc, 'button', 'kp-button kp-button--sm kp-graph__zoom-in', '+');
    const zoomReset = make(doc, 'button', 'kp-button kp-button--sm kp-graph__zoom-reset', s.graphZoomReset);
    for (const [button, label] of /** @type {const} */ ([
        [zoomOut, s.graphZoomOut],
        [zoomIn, s.graphZoomIn],
        [zoomReset, s.graphZoomResetTitle],
    ])) {
        button.type = 'button';
        button.title = label;
        button.setAttribute('aria-label', label);
    }
    zoomBox.append(zoomOut, zoomIn, zoomReset);
    return { zoomBox, zoomIn, zoomOut, zoomReset };
}

/**
 * The picture's box: the SVG, the live note, the state plate, the zoom controls and the details panel (hidden until its option is on).
 * @param {HTMLElement} el
 * @param {Strings} s
 */
function buildBox(el, s) {
    const doc = el.ownerDocument;
    const box = make(doc, 'div', 'kp-graph__box');
    const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (svgEl(doc, 'svg', { class: 'kp-graph__svg', role: 'group' })));
    svg.setAttribute('aria-label', `${el.getAttribute('aria-label') ?? s.graphUnnamed}. ${s.graphHint}`);
    const note = make(doc, 'p', 'kp-graph__note');
    note.setAttribute('role', 'status');
    const plate = make(doc, 'div', 'kp-graph__state');
    plate.hidden = true;
    const zoom = buildZoom(doc, s);
    const panel = make(doc, 'aside', 'kp-graph__detail');
    panel.setAttribute('role', 'region');
    panel.hidden = true;
    box.append(svg, note, plate, zoom.zoomBox, panel);
    return { box, svg, note, plate, panel, ...zoom };
}

/**
 * The model of one graph with its parts made but not yet placed, loading until data arrives.
 * @param {HTMLElement} el
 * @param {Strings} s
 * @param {((part: Element, info: GraphDecorateInfo) => void) | undefined} decorate
 * @param {((info: GraphDetailInfo) => Node | string | null | void) | undefined} detail
 * @returns {GraphModel}
 */
export function newGraph(el, s, decorate, detail) {
    return {
        ...buildBar(el.ownerDocument, s),
        ...buildBox(el, s),
        el,
        hint: make(el.ownerDocument, 'p', 'kp-graph__hint', s.graphHint),
        decorate,
        strings: s,
        data: null,
        state: 'loading',
        words: '',
        text: '',
        art: null,
        drawn: false,
        drawnWidth: -1,
        selected: new Set(),
        hidden: new Set(),
        hover: null,
        focus: null,
        labels: [],
        size: [0, 0],
        options: graphOptionsOf(el),
        world: null,
        at: new Map(),
        view: { k: 1, x: 0, y: 0 },
        detail: null,
        detailShown: null,
        readyHeight: 0,
        readyWidth: 0,
        ...(detail ? { detailHook: detail } : {}),
    };
}

/**
 * Put the graph's parts into its element. The data child stays (a script draws nothing), so a second attach after a detach reads
 * it again.
 * @param {GraphModel} g
 */
export function mountGraph(g) {
    const script = g.el.querySelector(':scope > script[data-kp-graph-data]');
    g.el.replaceChildren(g.bar, g.box, g.hint, ...(script ? [script] : []));
}
