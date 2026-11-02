// When many growing boxes measure at once (a form opens, a window resizes, a font arrives, a script fills fifty boxes), they
// measure together: one read pass, one write pass, so the page lays out once instead of once per box.

import { PHONE } from './constants.js';
import { measureArea, measureAreas } from './measure.js';

/** @typedef {import('./controller.js').AutosizeController} AutosizeController */

/** Boxes waiting for the batch. @type {Set<AutosizeController>} */
const waiting = new Set();
/** While above zero, `measureSoon` only collects (attaching many boxes). */
const hold = { depth: 0, queued: false };

/** Measure every waiting box together. */
export function flushMeasures() {
    hold.queued = false;
    const list = [...waiting].filter((c) => !c.destroyed);
    waiting.clear();
    if (list.length === 1) measureArea(/** @type {AutosizeController} */ (list[0]));
    else if (list.length) measureAreas(list);
}

/** Measure this box with the others that ask in the same task: at the end of the task, or at once when attaching ends. @param {AutosizeController} c */
export function measureSoon(c) {
    waiting.add(c);
    if (hold.depth > 0 || hold.queued) return;
    hold.queued = true;
    queueMicrotask(flushMeasures);
}

/** Measure now, or with the others when boxes are being attached. @param {AutosizeController} c */
export function measureOrHold(c) {
    if (hold.depth > 0) measureSoon(c);
    else measureArea(c);
}

/** Run `work` (it attaches boxes); every box it attaches measures together afterwards, before this returns. @template T @param {() => T} work @returns {T} */
export function holdMeasures(work) {
    hold.depth += 1;
    try {
        return work();
    } finally {
        hold.depth -= 1;
        if (hold.depth === 0) flushMeasures();
    }
}

/** What one window shares: one resize observer, one viewport listener, one phone query for all its boxes. */
class Watch {
    /** @param {Window} view */
    constructor(view) {
        this.view = view;
        /** @type {Map<Element, AutosizeController>} */
        this.boxes = new Map();
        this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => this.onResize(entries)) : null;
        this.phone = view.matchMedia?.(PHONE) ?? null;
        this.onViewport = () => this.measureAll();
        view.visualViewport?.addEventListener('resize', this.onViewport);
        this.phone?.addEventListener('change', this.onViewport);
    }

    /** A change of width changes the wrapping; only boxes whose width moved measure, together. @param {ResizeObserverEntry[]} entries */
    onResize(entries) {
        const moved = [];
        for (const entry of entries) {
            const c = this.boxes.get(entry.target);
            if (!c) continue;
            const width = Math.round(entry.borderBoxSize?.[0]?.inlineSize ?? entry.target.getBoundingClientRect().width);
            if (width === c.width) continue;
            c.width = width;
            moved.push(c);
        }
        if (moved.length) measureAreas(moved);
    }

    measureAll() {
        const list = [...this.boxes.values()];
        if (list.length) measureAreas(list);
    }

    dispose() {
        this.observer?.disconnect();
        this.view.visualViewport?.removeEventListener('resize', this.onViewport);
        this.phone?.removeEventListener('change', this.onViewport);
    }
}

/** @type {WeakMap<Window, Watch>} */
const WATCHES = new WeakMap();

/** Watch a box's width, the viewport and the phone query with the shared watch; returns the undo. @param {AutosizeController} c @returns {() => void} */
export function watchBox(c) {
    const watch = WATCHES.get(c.view) ?? new Watch(c.view);
    WATCHES.set(c.view, watch);
    watch.boxes.set(c.area, c);
    watch.observer?.observe(c.area);
    return () => {
        watch.boxes.delete(c.area);
        watch.observer?.unobserve(c.area);
        if (watch.boxes.size > 0) return;
        watch.dispose();
        if (WATCHES.get(c.view) === watch) WATCHES.delete(c.view);
    };
}
