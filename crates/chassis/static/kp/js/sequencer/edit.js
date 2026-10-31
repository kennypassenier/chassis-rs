// Editing: drafts, commits, selection, refusals and zoom.
import { paint, paintSelection, paintWindow } from './paint.js';
import { placeLabels, syncJoins, syncTicks } from './bars.js';
import { sequencerClampZoom, sequencerTotalOf } from './timeline.js';
import { announce, emit, labelOf, outItems, summary, words } from './instance.js';
import { lanesFor, measureLanes, place } from './lanes.js';
import { changedIds } from './links.js';
import { SEQUENCER_CHANGE_EVENT, SEQUENCER_REFUSE_EVENT, SEQUENCER_SELECT_EVENT } from './constants.js';
import { sequencerClean } from './plan.js';
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./units.js').SequencerLane} SequencerLane */
/** @typedef {import('./instance.js').SequencerModel} SequencerModel */
/** @typedef {import('./units.js').SequencerPlan} SequencerPlan */

/**
 * Draw a draft while an edit is in progress: the moved bars by custom properties, nothing rebuilt, the window as it is.
 * @param {SequencerModel} c @param {SequencerItem[]} list @param {string[]} ids the bars that may have moved
 * @param {boolean} [refit]
 */
export function drawDraft(c, list, ids, refit = false) {
    c.view = list;
    if (refit) {
        paintWindow(c, list, true);
        syncTicks(c);
    } else {
        const total = sequencerTotalOf(list);
        c.endLine.style.setProperty('--kp-g-t', String(total));
        c.total.textContent = c.strings.sequencerTotal(words(c, total));
    }
    for (const id of ids) {
        const item = list.find((i) => i.id === id);
        const bar = c.bars.get(id);
        if (!item || !bar) continue;
        const before = c.items.find((i) => i.id === id);
        place(c, bar, item, before && before.lane === item.lane ? (c.rows.rows.get(id) ?? 0) : 0);
        const out = c.outsides.get(id);
        if (out) out.hidden = true;
        bar.removeAttribute('data-kp-label');
        const said = summary(c, item);
        if (bar.getAttribute('aria-label') !== said) bar.setAttribute('aria-label', said);
    }
    syncJoins(c, list);
    paintSelection(c);
}
/** Put the committed items back on screen after an edit ended. @param {SequencerModel} c */
export function settleDraw(c) {
    for (const out of c.outsides.values()) out.hidden = false;
    paint(c);
}
/** Drop an edit: commit `list` when it differs. @param {SequencerModel} c @param {SequencerItem[]} list @param {'pointer' | 'keyboard' | 'link'} source @returns {boolean} */
export function commit(c, list, source) {
    const changed = changedIds(c.items, list);
    c.press = null;
    c.kb = null;
    c.guide.hidden = true;
    c.readout.hidden = true;
    c.el.removeAttribute('data-kp-editing');
    if (!changed.length) {
        settleDraw(c);
        flushPending(c);
        return false;
    }
    c.items = list;
    settleDraw(c);
    emit(c, SEQUENCER_CHANGE_EVENT, { items: outItems(c, c.items), changed, source, total: sequencerTotalOf(c.items) });
    flushPending(c);
    return true;
}
/** A page's set that came during an edit is applied once the edit ended. @param {SequencerModel} c */
export function flushPending(c) {
    const pending = c.pending;
    if (!pending || c.press || c.kb) return;
    c.pending = null;
    apply(c, pending.items, pending.lanes);
}
/** @param {SequencerModel} c @param {Partial<SequencerItem>[]} raw @param {SequencerLane[] | undefined} lanes */
export function apply(c, raw, lanes) {
    c.items = sequencerClean(raw);
    if (lanes) c.lanes = lanesFor(c, lanes);
    else c.lanes = lanesFor(c, c.lanes);
    if (c.selected && !c.items.some((i) => i.id === c.selected)) c.selected = null;
    if (c.focusId && !c.items.some((i) => i.id === c.focusId)) c.focusId = null;
    paint(c);
}
/** @param {SequencerModel} c @param {string | null} id */
export function select(c, id) {
    if (c.selected === id) return;
    c.selected = id;
    for (const [key, bar] of c.bars) bar.setAttribute('aria-pressed', String(key === id));
    paintSelection(c);
    emit(c, SEQUENCER_SELECT_EVENT, { id });
}
/** Say why an edit did not happen. @param {SequencerModel} c @param {string} id @param {SequencerPlan} plan */
export function refuse(c, id, plan) {
    const label = labelOf(c, id);
    const s = c.strings;
    const text =
        plan.reason === 'overlap'
            ? s.sequencerRefusedOverlap(label, plan.blocker ? labelOf(c, plan.blocker) : '')
            : plan.reason === 'locked'
              ? s.sequencerRefusedLocked(label)
              : plan.reason === 'cycle'
                ? s.sequencerRefusedLink(label)
                : s.sequencerRefusedEdge(label);
    announce(c, text);
    emit(c, SEQUENCER_REFUSE_EVENT, { id, reason: plan.reason, blocker: plan.blocker });
}
/** The zoom, around the point of the plot under `anchorX` (client px), or the middle of what is seen. @param {SequencerModel} c @param {number} zoom @param {number} [anchorX] */
export function setZoom(c, zoom, anchorX) {
    const next = sequencerClampZoom(zoom);
    if (next === c.zoom) return false;
    const before = c.layer.getBoundingClientRect();
    const seen = c.scroll.getBoundingClientRect();
    const ax = anchorX ?? Math.max(before.left, seen.left) + (Math.min(before.right, seen.right) - Math.max(before.left, seen.left)) / 2;
    const frac = before.width ? Math.min(1, Math.max(0, (ax - before.left) / before.width)) : 0;
    c.zoom = next;
    c.body.style.setProperty('--kp-tl-zoom', String(next));
    const after = c.layer.getBoundingClientRect();
    c.scroll.scrollLeft += after.left + frac * after.width - ax;
    afterLayout(c);
    return true;
}
/** What depends on the width: ticks, lane tops, outside labels, the zoom words. @param {SequencerModel} c */
export function afterLayout(c) {
    paintWindow(c, c.view, false);
    c.tickKey = '';
    syncTicks(c);
    measureLanes(c);
    for (const item of c.view) {
        const bar = c.bars.get(item.id);
        if (bar && !(c.press?.moved && c.press.id === item.id)) place(c, bar, item, c.rows.rows.get(item.id) ?? 0);
    }
    syncJoins(c, c.view);
    placeLabels(c);
}
/** The time under a client x. @param {SequencerModel} c @param {number} x */
export function unitAt(c, x) {
    const box = c.layer.getBoundingClientRect();
    return box.width ? ((x - box.left) / box.width) * c.span : 0;
}
