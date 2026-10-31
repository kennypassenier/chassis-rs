// One network graph: its parts built and placed, its picks, hover, focus and details, and the watches that redraw it.
import { Controller } from '../controller.js';
import { resolveStrings } from '../strings.js';
import { GRAPH_OPTION_ATTRIBUTES } from './constants.js';
import { graphs, isShown } from './instance.js';
import { dataChild, graphHideKind, graphZoom, setGraphData } from './api.js';
import { keyOf } from './layout.js';
import { drawGraph } from './draw.js';
import { fitDrawnLabels, revealNode } from './view.js';
import { closeDetail, setHover, showAll, togglePick } from './select.js';
import { mountGraph, newGraph } from './build.js';
import { GraphPan } from './pan.js';
/** @typedef {import('./options.js').GraphDecorateInfo} GraphDecorateInfo */
/** @typedef {import('./options.js').GraphDetailInfo} GraphDetailInfo */
/** @typedef {import('./instance.js').GraphModel} GraphModel */
/**
 * @typedef {{ decorate?: (part: Element, info: GraphDecorateInfo) => void, strings?: Partial<import('../strings.js').Strings>,
 *   detail?: (info: GraphDetailInfo) => Node | string | null | void }} GraphAttachOptions
 */

/** @param {EventTarget | null} target */
const nodeOf = (target) => /** @type {SVGGElement | null} */ (target instanceof Element ? target.closest('.kp-graph__node') : null);

/** One graph: its model is the `graphs` registry entry the setters read; the pointers of a zoom or pan sit on its GraphPan. */
export class GraphControl extends Controller {
    /** @param {HTMLElement} host @param {GraphAttachOptions} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** The model every part reads, its parts made but not yet placed. */
        this.g = newGraph(host, resolveStrings(options.strings), options.decorate, options.detail);
        /** The zoom and pan state of the picture. */
        this.pan = new GraphPan(this.g);
    }

    connect() {
        const g = this.g;
        const initial = dataChild(this.host);
        mountGraph(g);
        graphs.set(this.host, g);
        // Registered first, so it runs last: the setters lose the graph after every listener is gone.
        this.own(() => graphs.delete(this.host));
        for (const [part, kind] of /** @type {const} */ ([
            [g.showAll, 'show-all'],
            [g.zoomIn, 'zoom-in'],
            [g.zoomOut, 'zoom-out'],
            [g.zoomReset, 'zoom-reset'],
        ]))
            g.decorate?.(part, { kind, host: this.host, key: keyOf(this.host) });
        if (initial) setGraphData(this.host, initial);
        else drawGraph(g);
        this.wirePicture();
        this.wireParts();
        this.watch();
    }

    /** The picture's listeners: hover, focus, picks, keys, and the zoom and pan forwarded to the GraphPan. */
    wirePicture() {
        const { svg } = this.g;
        const pan = this.pan;
        this.listen(svg, 'pointerover', (event) => this.onOver(event));
        this.listen(svg, 'pointerout', (event) => this.onOut(/** @type {PointerEvent} */ (event)));
        this.listen(svg, 'focusin', (event) => this.onFocus(event));
        this.listen(svg, 'focusout', (event) => this.onBlur(/** @type {FocusEvent} */ (event)));
        this.listen(svg, 'click', (event) => pan.onClickCapture(/** @type {MouseEvent} */ (event)), true);
        this.listen(svg, 'click', (event) => this.onClick(event));
        this.listen(svg, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(svg, 'pointerdown', (event) => pan.onDown(/** @type {PointerEvent} */ (event)));
        this.listen(svg, 'pointermove', (event) => pan.onMove(/** @type {PointerEvent} */ (event)));
        this.listen(svg, 'pointerup', (event) => pan.onUp(/** @type {PointerEvent} */ (event)));
        this.listen(svg, 'pointercancel', (event) => pan.onUp(/** @type {PointerEvent} */ (event)));
        this.listen(svg, 'wheel', (event) => pan.onWheel(/** @type {WheelEvent} */ (event)), { passive: false });
    }

    /** The listeners of the parts around the picture: the zoom buttons, the details panel, the kinds, Show all and Esc on the page. */
    wireParts() {
        const g = this.g;
        this.listen(g.zoomBox, 'click', (event) => this.onZoomBox(event));
        this.listen(g.panel, 'click', (event) => {
            if (event.target instanceof Element && event.target.closest('.kp-graph__detail-close')) closeDetail(this.g, true);
        });
        this.listen(g.panel, 'keydown', (event) => this.onPanelKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(g.legend, 'click', (event) => this.onKind(event));
        this.listen(g.showAll, 'click', () => showAll(this.g));
        this.listen(this.host.ownerDocument, 'keydown', (event) => this.onDocKey(/** @type {KeyboardEvent} */ (event)));
    }

    /** Redraw on a new width or a changed option attribute, and fit the labels again when a web font arrives. */
    watch() {
        const g = this.g;
        const doc = this.host.ownerDocument;
        const view = doc.defaultView;
        if (view) {
            // Only a new width redraws: a taller box (a side panel growing beside it) must never rebuild a node under the pointer.
            this.observe(new view.ResizeObserver(() => g.box.clientWidth !== g.drawnWidth && drawGraph(g))).observe(g.box);
            // An option changed on the graph (its attribute): draw it again with the new option. Not a hover, a pick or a hidden kind.
            this.observe(new view.MutationObserver(() => drawGraph(g))).observe(this.host, { attributes: true, attributeFilter: GRAPH_OPTION_ATTRIBUTES });
        }
        if (doc.fonts) this.listen(doc.fonts, 'loadingdone', () => this.onFonts());
    }

    /**
     * A web font that arrives after the drawing changes every label's width: fit them again, in place (no node is rebuilt). Names
     * that stand whole need the room measured again, so that mode draws again.
     */
    onFonts() {
        const g = this.g;
        if (g.options.labels === 'below') {
            drawGraph(g);
            return;
        }
        for (const l of g.labels) {
            l.length = l.full.length;
            l.text.textContent = l.full;
        }
        if (isShown(g.svg)) fitDrawnLabels(g.labels, g.size[0], g.size[1]);
    }

    /** The drawn nodes, hub first, in ring order. */
    order() {
        return /** @type {SVGGElement[]} */ ([...this.g.svg.querySelectorAll('.kp-graph__node')]);
    }

    /** Make `node` the one tab stop. @param {SVGGElement} node */
    tabTo(node) {
        for (const other of this.order()) other.setAttribute('tabindex', other === node ? '0' : '-1');
        this.g.focus = node.getAttribute('data-kp-id');
    }

    /** @param {SVGGElement} node */
    focusNode(node) {
        this.tabTo(node);
        node.focus({ preventScroll: false });
        revealNode(this.g, this.g.focus);
    }

    /** @param {Event} event */
    onOver(event) {
        const node = nodeOf(event.target);
        if (node) setHover(this.g, node.getAttribute('data-kp-id'));
    }

    /** @param {PointerEvent} event */
    onOut(event) {
        const node = nodeOf(event.target);
        if (node && !node.contains(/** @type {Node | null} */ (event.relatedTarget))) setHover(this.g, null);
    }

    /** @param {Event} event */
    onFocus(event) {
        const node = nodeOf(event.target);
        if (!node) return;
        this.g.focus = node.getAttribute('data-kp-id');
        setHover(this.g, this.g.focus);
    }

    /** @param {FocusEvent} event */
    onBlur(event) {
        if (!this.g.svg.contains(/** @type {Node | null} */ (event.relatedTarget))) setHover(this.g, null);
    }

    /** @param {Event} event */
    onClick(event) {
        const node = nodeOf(event.target);
        if (!node) return;
        this.tabTo(node);
        togglePick(this.g, node.getAttribute('data-kp-id') ?? '');
    }

    /** @param {Event} event */
    onZoomBox(event) {
        const g = this.g;
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button || button.getAttribute('aria-disabled') === 'true') return;
        graphZoom(this.host, button === g.zoomIn ? 'in' : button === g.zoomOut ? 'out' : 'reset');
    }

    /** Arrows walk the ring, Home and End jump, Enter or Space picks, Esc closes the details or shows all. @param {KeyboardEvent} event */
    onKey(event) {
        const node = nodeOf(event.target);
        if (!node || this.pan.zoomKey(event)) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            togglePick(this.g, node.getAttribute('data-kp-id') ?? '');
        } else if (event.key === 'Escape') {
            if (closeDetail(this.g, false) || showAll(this.g)) {
                event.preventDefault();
                event.stopPropagation();
            }
        } else this.walk(event, node);
    }

    /** Move the focus along the ring (the hub, when there is one, stands before it). @param {KeyboardEvent} event @param {SVGGElement} node */
    walk(event, node) {
        const nodes = this.order();
        const at = nodes.indexOf(node);
        const ringStart = this.g.svg.querySelector('.kp-graph__node--hub') ? 1 : 0;
        const ringCount = nodes.length - ringStart;
        /** @type {number | null} */
        let to = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') to = at < ringStart ? ringStart : ringStart + ((at - ringStart + 1) % ringCount);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
            to = at < ringStart ? nodes.length - 1 : ringStart + ((at - ringStart - 1 + ringCount) % ringCount);
        else if (event.key === 'Home') to = 0;
        else if (event.key === 'End') to = nodes.length - 1;
        if (to == null || !nodes[to] || ringCount < 1) return;
        event.preventDefault();
        this.focusNode(nodes[to]);
    }

    /** @param {Event} event */
    onKind(event) {
        const button = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest('[data-kp-kind]') : null);
        if (!button) return;
        const kind = button.dataset.kpKind ?? '';
        graphHideKind(this.host, kind, !this.g.hidden.has(kind));
    }

    /** @param {KeyboardEvent} event */
    onPanelKey(event) {
        if (event.key !== 'Escape' || event.defaultPrevented || !closeDetail(this.g, true)) return;
        event.preventDefault();
        event.stopPropagation();
    }

    /** Esc anywhere on the page (outside a dialog, a field or a menu) closes the details, then shows all. @param {KeyboardEvent} event */
    onDocKey(event) {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (/** @type {Element | null} */ (event.target)?.closest?.('dialog, input, textarea, select, [role="menu"]')) return;
        if (!closeDetail(this.g, false)) showAll(this.g);
    }
}
