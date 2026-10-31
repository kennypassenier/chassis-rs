// Pointer, keyboard and focus handling of the plot: the crosshair, the pin, the brush that zooms, and the keys that walk the readings.
import { indexAt } from '../selection.js';
import { PlotDraw } from './draw.js';
/** @typedef {import('../words.js').ChartPoint} ChartPoint */

/** A drag shorter than this, in pixels, is a click (a pin), not a zoom. */
const BRUSH_MIN_PX = 6;
/** A click within this many pixels of the pin takes the pin away. */
const PIN_REACH_PX = 4;
/** The readings Shift+arrow skips. */
const KEY_BIG_STEP = 10;

export class PlotPointer extends PlotDraw {
    /** The plot's pointer, keyboard and focus listeners. */
    wirePointer() {
        const { plot } = this.ui;
        /** @template {Event} E @param {(event: E) => void} handler @returns {EventListener} */
        const as = (handler) => /** @type {EventListener} */ (handler);
        const onPointer = as((/** @type {PointerEvent} */ e) => this.onPointer(e));
        this.listen(plot, 'pointerdown', as((/** @type {PointerEvent} */ e) => this.onDown(e)));
        // Entering takes the crosshair at once: the move that brought the pointer may have reached the chart it left last.
        this.listen(plot, 'pointerenter', onPointer);
        this.listen(plot, 'pointermove', onPointer);
        this.listen(plot, 'pointerup', as((/** @type {PointerEvent} */ e) => this.onUp(e)));
        this.listen(plot, 'pointercancel', () => {
            this.brush = null;
            this.draw();
        });
        // Leaving clears the crosshair only while this chart has it: the pointer may already have moved it on another chart of the group.
        this.listen(plot, 'pointerleave', () => {
            if (!this.brush && this.group.owner === this.state) this.group.cursor(null, this.state);
        });
        this.listen(plot, 'dblclick', () => this.group.setZoom(null));
        this.listen(plot, 'keydown', as((/** @type {KeyboardEvent} */ e) => this.onKey(e)));
        this.listen(plot, 'focus', () => this.onFocus());
        this.listen(plot, 'blur', as((/** @type {FocusEvent} */ e) => this.onBlur(e)));
    }

    /** The time under the pointer, on the last drawing. @param {PointerEvent} e */
    timeAt(e) {
        if (!this.geo) return null;
        return this.geo.inv(e.clientX - this.geo.svg.getBoundingClientRect().left);
    }

    /** A press on an event's mark pins it; anywhere else it starts a brush. @param {PointerEvent} e */
    onDown(e) {
        if (!this.geo || e.button !== 0) return;
        const mark = /** @type {Element} */ (e.target).closest?.('.kp-chart__mark');
        if (mark) {
            this.pinned = Number(mark.getAttribute('data-at'));
            this.group.cursor(this.pinned, this.state);
            this.announce();
            return;
        }
        const left = e.clientX - this.geo.svg.getBoundingClientRect().left;
        this.brush = { x0: left, x1: left };
        this.ui.plot.setPointerCapture?.(e.pointerId);
    }

    /** @param {PointerEvent} e */
    onPointer(e) {
        const { geo } = this;
        if (!geo) return;
        if (this.brush) {
            this.brush.x1 = Math.max(geo.P.l, Math.min(geo.W - geo.P.r, e.clientX - geo.svg.getBoundingClientRect().left));
            this.draw();
            return;
        }
        // Over a marker the crosshair snaps to its event.
        const mark = /** @type {Element} */ (e.target).closest?.('.kp-chart__mark');
        const t = mark ? Number(mark.getAttribute('data-at')) : this.timeAt(e);
        if (t == null || t < geo.from || t > geo.to) return;
        this.group.cursor(t, this.state);
    }

    /** A drag zooms to its span; a click pins the time under it, or takes the pin near it away. @param {PointerEvent} e */
    onUp(e) {
        const { geo } = this;
        if (!this.brush || !geo) return;
        const b = this.brush;
        this.brush = null;
        if (Math.abs(b.x1 - b.x0) > BRUSH_MIN_PX) {
            this.pinned = null;
            this.group.setZoom({ from: geo.inv(Math.min(b.x0, b.x1)), to: geo.inv(Math.max(b.x0, b.x1)) });
            return;
        }
        const t = this.timeAt(e);
        if (t == null) return;
        this.pinned = this.pinned != null && Math.abs(geo.x(this.pinned) - geo.x(t)) < PIN_REACH_PX ? null : t;
        this.draw();
        this.announce();
    }

    /** Arrows, Home and End walk the readings; Enter pins; Escape lets go of the pin, the selection, then the zoom. @param {KeyboardEvent} e */
    onKey(e) {
        const si = this.visible().find((i) => this.points[i].length > 0);
        const pts = si == null ? null : this.points[si];
        if (!pts) return;
        if (e.key === 'Enter') return this.keyPin(e, pts);
        if (e.key === 'Escape') return this.keyLetGo(e);
        let k = indexAt(pts, this.pinned ?? this.cursor ?? pts[pts.length - 1][0]);
        const step = e.shiftKey ? KEY_BIG_STEP : 1;
        if (e.key === 'ArrowLeft') k -= step;
        else if (e.key === 'ArrowRight') k += step;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = pts.length - 1;
        else return;
        e.preventDefault();
        this.keyMove(pts, k);
    }

    /** Pin or unpin; nothing under the crosshair yet pins the newest point. @param {KeyboardEvent} e @param {ChartPoint[]} pts */
    keyPin(e, pts) {
        e.preventDefault();
        const k = indexAt(pts, this.pinned ?? this.cursor ?? pts[pts.length - 1][0]);
        const at = this.cursor ?? pts[k][0];
        this.pinned = this.pinned != null ? null : at;
        this.group.cursor(at, this.state);
        this.announce();
    }

    /** @param {KeyboardEvent} e */
    keyLetGo(e) {
        e.stopPropagation();
        if (this.pinned != null) this.pinned = null;
        else if (this.sel.size) this.setSel(new Set());
        else if (this.group.zoom) this.group.setZoom(null);
        this.draw();
    }

    /** Move the crosshair to reading `k`, within the window on view (a zoom keeps the crosshair inside it). @param {ChartPoint[]} pts @param {number} k */
    keyMove(pts, k) {
        const win = this.range();
        k = Math.max(0, Math.min(pts.length - 1, k));
        if (win) {
            while (k > 0 && pts[k][0] > win.to) k--;
            while (k < pts.length - 1 && pts[k][0] < win.from) k++;
        }
        const t = pts[k][0];
        if (this.pinned != null) this.pinned = t;
        this.group.cursor(t, this.state);
        this.announce();
    }

    onFocus() {
        if (this.cursor != null || !this.ui.plot.matches(':focus-visible')) return;
        const win = this.range();
        if (win) this.group.cursor(win.to, this.state);
        this.announce();
    }

    /** Into the pinned tooltip (its ✕, an event's link) the reading stays. @param {FocusEvent} e */
    onBlur(e) {
        if (this.pinned == null && this.group.owner === this.state && !this.ui.tip.contains(/** @type {Node | null} */ (e.relatedTarget))) this.group.cursor(null, this.state);
    }
}
