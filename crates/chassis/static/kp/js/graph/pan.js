// Zoom and pan of one graph [graph-1020]: wheel, pinch, drag and the zoom keys. A view is one transform on the world group, so a
// hover or a pick still toggles classes only.
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './instance.js';
import { applyView, clampView, pictureAt, zoomTo } from './view.js';
/** @typedef {import('./instance.js').GraphModel} GraphModel */

/** How far (px) a pointer moves on the background before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
/** How much one wheel unit zooms: a line (deltaMode 1), a pinch on a touchpad (ctrlKey) and a pixel. */
const WHEEL_LINE = 0.05;
const WHEEL_PINCH = 0.01;
const WHEEL_PIXEL = 0.0015;
/** How far (px) Shift+arrow pans the view. */
const KEY_PAN_STEP = 56;

/** @param {EventTarget | null} target */
const onNodeOf = (target) => target instanceof Element && !!target.closest('.kp-graph__node');

/** The pointers, the pan start, the pinch and the drag flag of one graph; the controller forwards the picture's events here. */
export class GraphPan {
    /** @param {GraphModel} g */
    constructor(g) {
        this.g = g;
        /** Whether the press that is ending moved the view, so its click is not a pick. */
        this.dragged = false;
        /** The pointers down on the picture. @type {Map<number, { x: number, y: number, onNode: boolean }>} */
        this.pointers = new Map();
        /** Where the last pan step was, while the background is dragged. @type {{ x: number, y: number } | null} */
        this.panFrom = null;
        /** The zoom and world point a two-finger pinch started from. @type {{ dist: number, k: number, wx: number, wy: number } | null} */
        this.pinch = null;
    }

    /** Two pointers are down: remember the zoom and the world point under their middle. */
    pinchStart() {
        const g = this.g;
        const [a, b] = [...this.pointers.values()];
        if (!a || !b) return;
        const mid = pictureAt(g, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: g.view.k, wx: (mid.x - g.view.x) / g.view.k, wy: (mid.y - g.view.y) / g.view.k };
        this.panFrom = null;
    }

    /** @param {PointerEvent} event */
    onDown(event) {
        if (!this.g.options.zoom || (event.pointerType === 'mouse' && event.button !== 0)) return;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, onNode: onNodeOf(event.target) });
        if (this.pointers.size === 2) this.pinchStart();
        else if (this.pointers.size === 1) {
            this.dragged = false;
            this.panFrom = onNodeOf(event.target) ? null : { x: event.clientX, y: event.clientY };
        }
    }

    /** @param {PointerEvent} event */
    onMove(event) {
        const known = this.pointers.get(event.pointerId);
        if (!known || !this.g.options.zoom) return;
        known.x = event.clientX;
        known.y = event.clientY;
        if (this.pinch && this.pointers.size >= 2) this.pinchMove(this.pinch);
        else if (this.panFrom && this.pointers.size === 1) this.panMove(event, this.panFrom);
    }

    /** Zoom by how far the two pointers moved apart, about the world point they started on. @param {{ dist: number, k: number, wx: number, wy: number }} pinch */
    pinchMove(pinch) {
        const g = this.g;
        const [a, b] = [...this.pointers.values()];
        if (!a || !b) return;
        const mid = pictureAt(g, (a.x + b.x) / 2, (a.y + b.y) / 2);
        const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) || 1)) / pinch.dist));
        g.view = { k, x: mid.x - pinch.wx * k, y: mid.y - pinch.wy * k };
        clampView(g);
        applyView(g);
        this.dragged = true;
    }

    /** Pan by how far the pointer moved, once it passed the drag threshold. @param {PointerEvent} event @param {{ x: number, y: number }} from */
    panMove(event, from) {
        const g = this.g;
        const rect = g.svg.getBoundingClientRect();
        const scale = g.size[0] / (rect.width || g.size[0]);
        const dx = event.clientX - from.x;
        const dy = event.clientY - from.y;
        if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!this.dragged) this.startDrag(event);
        g.view.x += dx * scale;
        g.view.y += dy * scale;
        this.panFrom = { x: event.clientX, y: event.clientY };
        clampView(g);
        applyView(g);
    }

    /** @param {PointerEvent} event */
    startDrag(event) {
        this.dragged = true;
        this.g.el.setAttribute('data-kp-panning', '');
        try {
            this.g.svg.setPointerCapture(event.pointerId);
        } catch {
            // A pointer that is already gone cannot be captured: the drag simply ends.
        }
    }

    /** @param {PointerEvent} event */
    onUp(event) {
        this.pointers.delete(event.pointerId);
        if (this.pointers.size < 2) this.pinch = null;
        if (this.pointers.size === 0) {
            this.panFrom = null;
            this.g.el.removeAttribute('data-kp-panning');
        }
    }

    /** A drag must not end as a pick. @param {MouseEvent} event */
    onClickCapture(event) {
        if (!this.dragged) return;
        this.dragged = false;
        event.stopPropagation();
        event.preventDefault();
    }

    /** @param {WheelEvent} event */
    onWheel(event) {
        const g = this.g;
        if (!g.options.zoom) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? WHEEL_LINE : event.ctrlKey ? WHEEL_PINCH : WHEEL_PIXEL;
        const at = pictureAt(g, event.clientX, event.clientY);
        zoomTo(g, g.view.k * Math.exp(-event.deltaY * unit), at.x, at.y);
    }

    /** The keys of a zoomed picture: + - 0 and Shift+arrows; true when the key was one of them. @param {KeyboardEvent} event */
    zoomKey(event) {
        const g = this.g;
        if (!g.options.zoom || event.ctrlKey || event.metaKey || event.altKey) return false;
        const [W, H] = g.size;
        if (event.key === '+' || event.key === '=') zoomTo(g, g.view.k * ZOOM_STEP, W / 2, H / 2, true);
        else if (event.key === '-' || event.key === '_') zoomTo(g, g.view.k / ZOOM_STEP, W / 2, H / 2, true);
        else if (event.key === '0') {
            g.view = { k: 1, x: 0, y: 0 };
            applyView(g, true);
        } else if (event.shiftKey && event.key.startsWith('Arrow')) {
            g.view.x += event.key === 'ArrowLeft' ? KEY_PAN_STEP : event.key === 'ArrowRight' ? -KEY_PAN_STEP : 0;
            g.view.y += event.key === 'ArrowUp' ? KEY_PAN_STEP : event.key === 'ArrowDown' ? -KEY_PAN_STEP : 0;
            clampView(g);
            applyView(g, true);
        } else return false;
        event.preventDefault();
        return true;
    }
}
