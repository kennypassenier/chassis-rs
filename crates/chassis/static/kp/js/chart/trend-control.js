// TrendChart: one key figure's trend, wired: its own crosshair read by pointer, finger or keys, a click through to the tile's link,
// and the busy card's leave before new data is drawn.
import { decorateWith } from './dom.js';
import { TrendView } from './trend-view.js';
/** @typedef {import('./api.js').ChartState} ChartState */

/** A press that moves farther than this, in pixels, is a drag that reads the trend, not a click. */
const DRAG_PX = 6;
/** The points Shift+arrow skips. */
const KEY_BIG_STEP = 10;

export class TrendChart extends TrendView {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The press under way, and whether it moved or is a finger's. @type {{ x: number, moved: boolean, touch: boolean } | null} */
        this.press = null;
        /** What attachCharts() keeps for this chart and its group holds. @type {ChartState} */
        this.state = this.makeState();
    }

    connect() {
        const { host, data, plot } = this;
        host.append(...this.parts);
        // Registered first, so it runs after the listeners are gone.
        this.own(() => {
            for (const part of this.parts) part.remove();
            this.plate?.remove();
            this.busy?.remove();
            host.removeAttribute('data-kp-state');
            host.closest('.kp-kpi')?.removeAttribute('aria-busy');
        });
        if (data?.key != null) host.setAttribute('data-kp-key', data.key);
        decorateWith(this.ctx.decorate, plot, { kind: 'plot', host, key: data?.key ?? host.getAttribute('data-kp-key') ?? undefined });
        this.link = /** @type {HTMLElement | null} */ (host.closest('.kp-kpi')?.querySelector('.kp-kpi__link') ?? null);
        this.listen(plot, 'pointerdown', (event) => this.onDown(/** @type {PointerEvent} */ (event)));
        this.listen(plot, 'pointermove', (event) => this.onMove(/** @type {PointerEvent} */ (event)));
        this.listen(plot, 'pointerleave', (event) => {
            if (/** @type {PointerEvent} */ (event).pointerType === 'mouse') this.hide();
        });
        this.listen(plot, 'pointercancel', () => {
            this.press = null;
            this.hide();
        });
        this.listen(plot, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(plot, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(plot, 'blur', () => this.hide());
    }

    /** @param {number} clientX */
    indexAtX(clientX) {
        const box = this.plot.getBoundingClientRect();
        return Math.round(((clientX - box.left) / Math.max(1, box.width)) * (this.pts.length - 1));
    }

    /** @param {PointerEvent} event */
    onDown(event) {
        const press = { x: event.clientX, moved: false, touch: event.pointerType !== 'mouse' };
        this.press = press;
        if (!press.touch) return;
        try {
            this.plot.setPointerCapture(event.pointerId);
        } catch {
            // A pointer the browser no longer knows (a synthetic one): read without capture.
        }
        this.show(this.indexAtX(event.clientX));
    }

    /** @param {PointerEvent} event */
    onMove(event) {
        const { press } = this;
        if (press && Math.abs(event.clientX - press.x) > DRAG_PX) press.moved = true;
        if (event.pointerType === 'mouse' || press) this.show(this.indexAtX(event.clientX));
    }

    /** A click without a drag follows the tile's link, as a click anywhere else on the tile does; a drag only read the trend. @param {MouseEvent} event */
    onClick(event) {
        const dragged = this.press?.moved ?? false;
        this.press = null;
        if (!dragged && this.link && event.button === 0) this.link.click();
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const n = this.pts.length;
        if (n < 2) return;
        const shown = !this.cross.hidden;
        const from = this.index ?? n - 1;
        const step = event.shiftKey ? KEY_BIG_STEP : 1;
        /** @type {number | null} */
        let to = null;
        if (event.key === 'ArrowLeft') to = shown ? from - step : n - 1;
        else if (event.key === 'ArrowRight') to = shown ? from + step : n - 1;
        else if (event.key === 'Home') to = 0;
        else if (event.key === 'End') to = n - 1;
        else if (event.key === 'Escape' && shown) {
            event.preventDefault();
            event.stopPropagation();
            this.hide();
            return;
        }
        if (to == null) return;
        event.preventDefault();
        this.show(to, true);
    }

    /** @returns {ChartState} */
    makeState() {
        return {
            host: this.host,
            spark: true,
            group: this.group,
            draw: () => this.draw(),
            setData: (next) => this.setData(next),
            select: () => false,
            // The trend reads on its own crosshair, not the group's.
            cursorAt: () => {},
            lastTime: () => this.pts[this.pts.length - 1]?.[0] ?? null,
            destroy: () => this.destroy(),
            unobserve: () => {},
        };
    }
}
