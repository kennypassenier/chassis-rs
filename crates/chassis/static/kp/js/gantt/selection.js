// Refresh, tab stops, focus, selection and the live tick.
import { RESTS, windowOf } from './window.js';
import { clusterPoints } from './points.js';
import { placeLabels } from './labels.js';
import { frame, wordsOf } from './build.js';
import { edgeTicks, syncDays, syncTicks } from './axis.js';
import { rel, stamp } from './scale.js';
import { GANTT_WINDOW_EVENT, OPENED } from './constants.js';
/** @typedef {import('./constants.js').GanttModel} GanttModel */

/** Hide a bar wholly outside the window (it takes no tab stop). @param {GanttModel} c */
export function visible(c) {
    const w = windowOf(c);
    const now = w.now;
    for (const lane of c.lanes) {
        for (const b of lane.bars) {
            const end = b.e ?? now;
            b.bar.hidden = c.state === 'loading' || c.leaving !== null || end < w.from || b.s > w.end;
            const rest = RESTS.get(b.bar);
            if (rest) rest.hidden = b.bar.hidden || Number.parseFloat(rest.style.getPropertyValue('--kp-g-e')) <= now;
        }
        for (const point of lane.points) {
            const at = Number.parseFloat(point.style.getPropertyValue('--kp-g-s'));
            point.hidden = c.state === 'loading' || c.leaving !== null || at < w.from || at > w.end;
        }
    }
    clusterPoints(c);
    placeLabels(c);
}
/** Words that grow with the clock: a running bar's name and card. @param {GanttModel} c @param {number} nowMs */
export function refresh(c, nowMs) {
    void nowMs;
    for (const lane of c.lanes)
        for (const b of lane.bars) {
            const { name, card } = wordsOf(c, b);
            if (b.bar.getAttribute('aria-label') !== name) b.bar.setAttribute('aria-label', name);
            if (b.bar.getAttribute('data-kp-hovercard') !== card) b.bar.setAttribute('data-kp-hovercard', card);
        }
}
/** The bars a person can reach, per lane, in time order. @param {GanttModel} c */
export function reachableLanes(c) {
    const startOf = (/** @type {HTMLElement} */ el) => Number.parseFloat(el.style.getPropertyValue('--kp-g-s'));
    return c.lanes
        .map((lane) =>
            [
                ...lane.bars.filter((b) => !b.bar.hidden).map((b) => b.bar),
                ...lane.points.filter((p) => !p.hidden && !p.hasAttribute('data-kp-clustered')),
            ].sort((a, b) => startOf(a) - startOf(b)),
        )
        .filter((l) => l.length);
}
/** One tab stop: the active bar. @param {GanttModel} c */
export function syncTabStops(c) {
    const all = [...c.bars.values(), ...c.pointEls.values()];
    const reach = reachableLanes(c).flat();
    let target = c.active ? (c.bars.get(c.active) ?? c.pointEls.get(c.active)) : undefined;
    if (!target || !reach.includes(target)) target = reach[0];
    for (const el of all) el.tabIndex = el === target ? 0 : -1;
}
/** @param {GanttModel} c @param {HTMLElement} to */
export function focusBar(c, to) {
    c.active = to.dataset.kpId ?? c.active;
    syncTabStops(c);
    to.focus();
}
/** @param {GanttModel} c */
export function paintSelection(c) {
    const sel = c.selected;
    c.selection.toggleAttribute('data-kp-active', sel !== null);
    c.selection.hidden = sel === null;
    // What the chip covers cannot be reached by keyboard either.
    c.ranges.toggleAttribute('inert', sel !== null);
    c.liveButton.toggleAttribute('inert', sel !== null);
    c.selectBox.hidden = sel === null;
    syncDays(c);
    if (!sel) {
        c.selectionText.textContent = '';
        return;
    }
    c.selectBox.style.setProperty('--kp-g-s', rel(c, sel.from).toFixed(2));
    c.selectBox.style.setProperty('--kp-g-e', rel(c, sel.to).toFixed(2));
    c.selectionText.textContent = c.strings.ganttSelected(stamp(c, sel.from), stamp(c, sel.to));
}
/** @param {GanttModel} c @param {'range' | 'zoom' | 'live'} why */
export function announceWindow(c, why) {
    const w = windowOf(c);
    c.el.dataset.kpGanttLive = String(c.live);
    c.liveButton.setAttribute('aria-pressed', String(c.live));
    c.el.dispatchEvent(
        new CustomEvent(GANTT_WINDOW_EVENT, {
            bubbles: true,
            detail: { from: (w.from + c.base) * 1000, to: (w.end + c.base) * 1000, span: c.span, live: c.live, why },
        }),
    );
}
/** One second of the clock. @param {GanttModel} c */
export function tick(c) {
    const w = frame(c);
    // A narrow timeline scrolls inside its frame: a live window opens at its right end, where now is [wish-1028].
    if (!OPENED.has(c.el) && c.scroll.scrollWidth > c.scroll.clientWidth + 1) {
        OPENED.add(c.el);
        if (c.live)
            c.scroll.scrollLeft =
                getComputedStyle(c.scroll).direction === 'rtl' ? -(c.scroll.scrollWidth - c.scroll.clientWidth) : c.scroll.scrollWidth;
    }
    syncTicks(c, w);
    edgeTicks(c, w);
    visible(c);
    refresh(c, c.now());
    syncTabStops(c);
}
