// One run timeline: built, painted, kept live, and answering its bars, its toolbar and its range control.
import { watchOptions } from '../live-options.js';
import { GANTT_OPEN_EVENT, GANTT_SELECT_EVENT, GANTT_TICK_MS, gantts } from './constants.js';
import { build } from './build.js';
import { windowOf } from './window.js';
import { holdHeight, paint } from './paint.js';
import { announceWindow, syncTabStops, tick } from './selection.js';
import { dayBounds } from './axis.js';
import { setGanttSelection } from './api.js';
import { rangeSeconds, rel } from './scale.js';
import { paintChrome } from './chrome.js';
import { freshWindow, setLive } from './model.js';
import { GanttInput, barOf } from './input.js';

/** The shortest window a zoom to a selection opens, in seconds. */
const MIN_ZOOM_S = 60;
/** The attributes whose change draws the toolbar, the legend and the hint again [gaps-time-1019]. */
const CHROME_OPTIONS = ['data-kp-gantt-toolbar', 'data-kp-gantt-legend', 'data-kp-gantt-hint', 'data-kp-gantt-rest'];

/** One timeline: its model sits in the `gantts` registry the setters read; the last plot width sits on the instance. */
export class GanttControl extends GanttInput {
    /** @param {HTMLElement} host @param {import('./constants.js').GanttOptions} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** The plot width last laid out, so a resize that keeps it does nothing. */
        this.lastWidth = 0;
    }

    connect() {
        const c = this.c;
        const el = this.host;
        gantts.set(el, c);
        // Registered first, so it runs last: the setters lose the timeline after everything else was undone.
        this.own(() => gantts.delete(el));
        build(c);
        c.to = windowOf({ ...c, live: true }).end;
        void import('../segmented.js').then((m) => m.attachSegmented(c.ranges));
        void import('../hovercard.js').then((m) => m.attachHoverCards(el.ownerDocument));
        paint(c);
        tick(c);
        // What the first frame shows is the page, not news: a busy card laid before it is painted does not arrive.
        window.requestAnimationFrame(() => (c.drawn = true));
        // Wired in the reverse of the old teardown order, so destroy() undoes them in that order.
        this.watchWidth();
        this.watchFonts();
        this.own(watchOptions(el, CHROME_OPTIONS, () => this.redrawChrome()));
        c.timer = window.setInterval(() => tick(c), GANTT_TICK_MS);
        this.own(() => window.clearInterval(c.timer));
        this.listen(c.scroll, 'pointercancel', () => this.endDrag(false));
        this.listen(c.scroll, 'pointerup', () => this.endDrag(true));
        this.listen(c.scroll, 'pointermove', (event) => this.onMove(/** @type {PointerEvent} */ (event)));
        this.listen(c.scroll, 'pointerdown', (event) => this.onDown(/** @type {PointerEvent} */ (event)));
        this.listen(el, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(c.ranges, 'kp-segmented-change', (event) => this.onRange(event));
    }

    /** The toolbar, the legend and the hint changed: draw them again. */
    redrawChrome() {
        paint(this.c);
        paintChrome(this.c);
        tick(this.c);
    }

    /** A web font that arrives after the first measure changes every width: the labels are measured again. */
    watchFonts() {
        const fonts = this.host.ownerDocument.fonts;
        const refit = () => {
            this.c.labels.clear();
            tick(this.c);
        };
        fonts?.addEventListener?.('loadingdone', refit);
        this.own(() => fonts?.removeEventListener?.('loadingdone', refit));
        void fonts?.ready?.then(refit);
    }

    /** Another plot width packs the rows and measures the lanes again. */
    watchWidth() {
        const c = this.c;
        if (typeof ResizeObserver === 'undefined') return;
        c.observer = this.observe(new ResizeObserver(() => this.onWidth()));
        c.observer.observe(c.plot);
    }

    /** The plot changed size: pack, measure and tick again when its width moved. */
    onWidth() {
        const c = this.c;
        const width = c.plot.clientWidth;
        if (width === this.lastWidth) return;
        this.lastWidth = width;
        c.tickKey = '';
        // Rows are packed with a gap in pixels: another width packs them again.
        if (c.runs.length) paint(c);
        // Lane names wrap differently at another width: the viewport is measured again for whole lanes.
        if (c.held !== null) {
            c.held = null;
            holdHeight(c);
        }
        tick(c);
    }

    /** A press on a point, a bar or a toolbar button. @param {MouseEvent} event */
    onClick(event) {
        const bar = barOf(event);
        if (bar && bar.dataset.kpId) {
            if (!this.c.dragMoved) {
                if (bar.classList.contains('kp-gantt__point')) this.openPoint(bar, event);
                else this.openRun(bar, event);
            }
            return;
        }
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (button) this.onButton(/** @type {HTMLButtonElement} */ (button));
    }

    /** @param {MouseEvent} event */
    sourceOf(event) {
        return event.detail === 0 ? 'keyboard' : 'pointer';
    }

    /** Open a point mark; a mark with a count opens with every point it stands for. @param {HTMLButtonElement} bar @param {MouseEvent} event */
    openPoint(bar, event) {
        const c = this.c;
        const point = c.points.find((p) => p.id === bar.dataset.kpId);
        if (!point) return;
        c.active = point.id;
        syncTabStops(c);
        const lane = c.lanes.find((l) => l.points.includes(bar));
        const at = lane ? lane.points.indexOf(bar) : -1;
        const together = [point];
        if (lane && bar.hasAttribute('data-kp-cluster'))
            for (const next of lane.points.slice(at + 1)) {
                if (!next.hasAttribute('data-kp-clustered')) break;
                const p = c.points.find((q) => q.id === next.dataset.kpId);
                if (p) together.push(p);
            }
        const detail = { id: point.id, point, points: together, source: this.sourceOf(event) };
        this.host.dispatchEvent(new CustomEvent(GANTT_OPEN_EVENT, { bubbles: true, detail }));
    }

    /** @param {HTMLButtonElement} bar @param {MouseEvent} event */
    openRun(bar, event) {
        const c = this.c;
        const run = c.runs.find((r) => r.id === bar.dataset.kpId);
        if (!run) return;
        c.active = run.id;
        syncTabStops(c);
        this.host.dispatchEvent(new CustomEvent(GANTT_OPEN_EVENT, { bubbles: true, detail: { id: run.id, run, source: this.sourceOf(event) } }));
    }

    /** Live, a day stop, Clear or Zoom. @param {HTMLButtonElement} button */
    onButton(button) {
        const c = this.c;
        const el = this.host;
        if (button === c.liveButton) setLive(c, !c.live);
        else if (button.hasAttribute('data-kp-gantt-day')) this.pressDay(button);
        else if (button.hasAttribute('data-kp-gantt-clear')) {
            setGanttSelection(el, null);
            el.dispatchEvent(new CustomEvent(GANTT_SELECT_EVENT, { bubbles: true, detail: { from: null, to: null, source: 'clear' } }));
        } else if (button.hasAttribute('data-kp-gantt-zoom') && c.selected) {
            const { from, to } = c.selected;
            c.span = Math.max(MIN_ZOOM_S, (to - from) / 1000);
            c.live = false;
            c.to = rel(c, to);
            c.selected = null;
            freshWindow(c);
            announceWindow(c, 'zoom');
        }
    }

    /** A day stop selects its day, or lifts the selection when it was the one pressed. @param {HTMLButtonElement} button */
    pressDay(button) {
        const c = this.c;
        const day = button.dataset.kpGanttDay ?? '';
        c.dayStop = day;
        const bounds = dayBounds(c, day);
        const lift = button.getAttribute('aria-pressed') === 'true';
        setGanttSelection(this.host, lift ? null : bounds);
        const detail = lift ? { from: null, to: null, source: 'clear' } : { ...bounds, source: 'day', day };
        this.host.dispatchEvent(new CustomEvent(GANTT_SELECT_EVENT, { bubbles: true, detail }));
    }

    /** The range control chose a window length, or "all" to fit everything. @param {Event} event */
    onRange(event) {
        const c = this.c;
        const value = /** @type {CustomEvent} */ (event).detail?.value;
        if (value === 'all') {
            c.fit = true;
            c.live = false;
            freshWindow(c);
            announceWindow(c, 'range');
            return;
        }
        const seconds = typeof value === 'string' ? rangeSeconds(value) : Number.NaN;
        if (!Number.isFinite(seconds)) return;
        c.fit = false;
        c.span = seconds;
        if (!c.live) c.to = Math.max(c.to, rel(c, c.now()));
        freshWindow(c);
        announceWindow(c, 'range');
    }
}
