// The keys and the brush of one run timeline: moving between bars and day stops, and dragging a range across the plot.
import { Controller } from '../controller.js';
import { GANTT_SELECT_EVENT } from './constants.js';
import { windowOf } from './window.js';
import { focusBar, paintSelection, reachableLanes } from './selection.js';
import { syncDays } from './axis.js';
import { newModel } from './model.js';
/** @typedef {import('./constants.js').GanttOptions} GanttOptions */

/** A pointer that moves less than this, in px, between down and up is a click, not a drag. */
const DRAG_PX = 6;

/**
 * The bar or point mark an event happened on.
 * @param {Event} event
 * @returns {HTMLButtonElement | null}
 */
export const barOf = (event) =>
    event.target instanceof Element ? /** @type {HTMLButtonElement | null} */ (event.target.closest('.kp-gantt__run, .kp-gantt__point')) : null;

/** The base of a timeline's controller: the model it draws and the keyboard and pointer input on it. */
export class GanttInput extends Controller {
    /** @param {HTMLElement} host @param {GanttOptions} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** The timeline's model, the registry entry every part reads. */
        this.c = newModel(host, options);
    }

    /** Arrows, Home and End move between day stops or between bars. @param {KeyboardEvent} event */
    onKey(event) {
        const target = event.target;
        const dayButton = target instanceof HTMLButtonElement && target.hasAttribute('data-kp-gantt-day') ? target : null;
        if (dayButton && !(event.altKey || event.ctrlKey || event.metaKey)) return this.onDayKey(event, dayButton);
        const bar = barOf(event);
        if (!bar || event.altKey || event.ctrlKey || event.metaKey) return;
        const to = this.barFrom(bar, event.key);
        if (!to) return;
        event.preventDefault();
        focusBar(this.c, to);
    }

    /** @param {KeyboardEvent} event @param {HTMLButtonElement} dayButton */
    onDayKey(event, dayButton) {
        const c = this.c;
        const buttons = /** @type {HTMLButtonElement[]} */ ([...c.axis.querySelectorAll('button[data-kp-gantt-day]:not([data-kp-gantt-crowded])')]);
        const at = buttons.indexOf(dayButton);
        const rtl = getComputedStyle(c.axis).direction === 'rtl';
        const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
        const to =
            event.key === 'Home'
                ? buttons[0]
                : event.key === 'End'
                  ? buttons[buttons.length - 1]
                  : step
                    ? buttons[Math.min(buttons.length - 1, Math.max(0, at + step))]
                    : undefined;
        if (!to) return;
        event.preventDefault();
        c.dayStop = to.dataset.kpGanttDay ?? null;
        syncDays(c);
        to.focus();
    }

    /**
     * The bar a key moves to from `bar`: along its lane, or to the nearest start in the lane above or below.
     * @param {HTMLButtonElement} bar @param {string} key
     * @returns {HTMLElement | undefined}
     */
    barFrom(bar, key) {
        const lanes = reachableLanes(this.c);
        const laneIndex = lanes.findIndex((l) => l.includes(bar));
        const lane = lanes[laneIndex];
        if (!lane) return undefined;
        const at = lane.indexOf(bar);
        if (key === 'ArrowRight') return lane[Math.min(lane.length - 1, at + 1)];
        if (key === 'ArrowLeft') return lane[Math.max(0, at - 1)];
        if (key === 'Home') return lane[0];
        if (key === 'End') return lane[lane.length - 1];
        if (key !== 'ArrowDown' && key !== 'ArrowUp') return undefined;
        const next = lanes[laneIndex + (key === 'ArrowDown' ? 1 : -1)];
        if (!next) return undefined;
        const startOf = (/** @type {HTMLElement} */ b) => Number.parseFloat(b.style.getPropertyValue('--kp-g-s'));
        const mine = startOf(bar);
        return next.reduce((best, b) => (Math.abs(startOf(b) - mine) < Math.abs(startOf(best) - mine) ? b : best), /** @type {HTMLElement} */ (next[0]));
    }

    // The brush: a drag across the plot selects a range; a click without a drag is the bar's.

    /** @param {PointerEvent} event */
    plotX(event) {
        return event.clientX - this.c.plot.getBoundingClientRect().left;
    }

    /** @param {number} x @returns {number} epoch ms */
    timeAt(x) {
        const c = this.c;
        const w = windowOf(c);
        const width = c.plot.clientWidth || 1;
        return (w.from + (Math.min(Math.max(x, 0), width) / width) * c.span + c.base) * 1000;
    }

    /** @param {PointerEvent} event */
    onDown(event) {
        const c = this.c;
        // A dated line has no brush: it is read, not searched [kpadopt4].
        if (event.button !== 0 || c.state === 'loading' || c.line || c.el.getAttribute('data-kp-gantt-toolbar') === 'off') return;
        const x = this.plotX(event);
        if (x < 0 || x > c.plot.clientWidth) return;
        c.drag = { a: x, b: x };
        c.dragMoved = false;
    }

    /** @param {PointerEvent} event */
    onMove(event) {
        const c = this.c;
        if (!c.drag) return;
        c.drag.b = this.plotX(event);
        if (!c.dragMoved && Math.abs(c.drag.b - c.drag.a) > DRAG_PX) {
            c.dragMoved = true;
            c.scroll.setPointerCapture(event.pointerId);
        }
        if (!c.dragMoved) return;
        const lo = Math.min(c.drag.a, c.drag.b);
        c.brushBox.hidden = false;
        c.brushBox.style.setProperty('--kp-g-x', `${lo}px`);
        c.brushBox.style.setProperty('--kp-g-w', `${Math.abs(c.drag.b - c.drag.a)}px`);
    }

    /** @param {boolean} commit whether the drag selects its range (a pointerup) or is dropped (a pointercancel) */
    endDrag(commit) {
        const c = this.c;
        const d = c.drag;
        c.drag = null;
        c.brushBox.hidden = true;
        if (d && commit && c.dragMoved) {
            const from = this.timeAt(Math.min(d.a, d.b));
            const to = this.timeAt(Math.max(d.a, d.b));
            c.selected = { from, to };
            paintSelection(c);
            c.el.dispatchEvent(new CustomEvent(GANTT_SELECT_EVENT, { bubbles: true, detail: { from, to, source: 'brush' } }));
        }
        // The click that follows a drag is not a click on a bar.
        if (c.dragMoved) window.setTimeout(() => (c.dragMoved = false), 0);
    }
}
