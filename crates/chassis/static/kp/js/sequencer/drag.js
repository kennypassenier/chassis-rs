// Dragging and linking: marks, edge scroll, cancel and navigation.
import { EPS, REACH_PX } from './constants.js';
import { sequencerGroup, sequencerPlan } from './plan.js';
import { round } from './units.js';
import { announce, labelOf, planOptions, px, words } from './instance.js';
import { commit, drawDraft, flushPending, refuse, settleDraw, unitAt } from './edit.js';
import { changedIds, sequencerLink, sequencerUnlink } from './links.js';
import { paintSelection } from './paint.js';
import { focusItem } from './keyboard.js';
/** @typedef {import('./units.js').SequencerEdit} SequencerEdit */
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./instance.js').SequencerModel} SequencerModel */

/** @param {SequencerModel} c */
const reachNow = (c) => {
    const box = c.layer.getBoundingClientRect();
    return box.width ? (REACH_PX / box.width) * c.span : 0;
};
/** The lane under a client y, the nearest when above or below all. @param {SequencerModel} c @param {number} y */
function laneAt(c, y) {
    const lanes = c.press?.lanes ?? [];
    if (!lanes.length) return null;
    return (lanes.find((l) => y >= l.top && y < l.bottom) ?? (y < (lanes[0]?.top ?? 0) ? lanes[0] : lanes[lanes.length - 1]))?.id ?? null;
}
/** Show the guide where a dragged edge sits on another item's edge, and the chip that follows the bar. @param {SequencerModel} c @param {SequencerItem[]} list @param {string} id @param {boolean} refused */
function showDragMarks(c, list, id, refused) {
    const item = list.find((i) => i.id === id);
    if (!item) return;
    const ids = sequencerGroup(list, id);
    const edges = list.filter((i) => !ids.has(i.id)).flatMap((i) => [i.start, round(i.start + i.duration)]);
    const mine = [item.start, round(item.start + item.duration)];
    const hit = mine.find((m) => edges.some((e) => Math.abs(e - m) < EPS));
    c.guide.hidden = hit === undefined;
    if (hit !== undefined) c.guide.style.setProperty('--kp-g-t', String(hit));
    c.readout.hidden = false;
    c.readout.textContent = refused ? c.strings.sequencerReadoutRefused : c.strings.sequencerReadout(words(c, item.start), words(c, item.duration));
    c.readout.toggleAttribute('data-kp-refused', refused);
    c.readout.style.setProperty('--kp-g-s', String(item.start));
    c.readout.style.setProperty('--kp-g-e', String(round(item.start + item.duration)));
    c.readout.toggleAttribute('data-kp-flip', item.start + item.duration > c.span * 0.7);
    const top = c.laneTops.find((l) => l.id === item.lane)?.top ?? 0;
    c.readout.style.setProperty('--kp-tl-top', px(top));
}
/** One step of a pointer drag. @param {SequencerModel} c @param {PointerEvent} e */
export function dragTo(c, e) {
    const p = c.press;
    if (!p) return;
    const item = p.before.find((i) => i.id === p.id);
    if (!item) return;
    const u = unitAt(c, e.clientX);
    /** @type {SequencerEdit} */
    const edit =
        p.edge === 'start'
            ? { id: p.id, kind: 'resize-start', start: u }
            : p.edge === 'end'
              ? { id: p.id, kind: 'resize-end', end: u }
              : { id: p.id, kind: 'move', start: u - p.grab, lane: laneAt(c, e.clientY) ?? item.lane };
    const more = { max: c.span, reach: reachNow(c) };
    let plan = sequencerPlan(p.before, edit, planOptions(c, more));
    p.refused = !plan.ok;
    if (!plan.ok) {
        // The bar still follows the pointer, marked, and goes back when dropped.
        plan = sequencerPlan(p.before, edit, { ...planOptions(c, more), overlap: 'allow' });
        p.last = plan.ok ? plan : p.last;
    } else p.last = plan;
    const draft = plan.ok ? plan.items : p.last?.items;
    if (!draft) return;
    p.bar.toggleAttribute('data-kp-refused', p.refused);
    drawDraft(c, draft, [...new Set([...changedIds(c.items, draft), ...changedIds(c.items, c.view)])]);
    showDragMarks(c, draft, p.id, p.refused);
    edgeScroll(c, e.clientX);
}
/** Scroll the box while a drag is at its edge. @param {SequencerModel} c @param {number} x */
function edgeScroll(c, x) {
    window.clearTimeout(c.scrollTimer);
    const box = c.scroll.getBoundingClientRect();
    const hot = 28;
    const push = x < box.left + hot ? -12 : x > box.right - hot ? 12 : 0;
    if (!push || !c.press?.moved) return;
    const again = () => {
        if (!c.press?.moved) return;
        c.scroll.scrollLeft += push;
        if (c.press.last) {
            const lastX = x;
            // The pointer has not moved but the plot under it has: plan the drag again from the same place.
            dragTo(c, /** @type {PointerEvent} */ ({ clientX: lastX, clientY: c.press.y }));
        }
        c.scrollTimer = window.setTimeout(again, 30);
    };
    c.scrollTimer = window.setTimeout(again, 30);
}
/** Put an edit in progress back. @param {SequencerModel} c @param {string} why */
export function cancelEdit(c, why) {
    const was = c.kb?.id ?? c.press?.id ?? null;
    const bar = c.press?.bar;
    window.clearTimeout(c.scrollTimer);
    if (bar) {
        bar.removeAttribute('data-kp-refused');
        bar.removeAttribute('data-kp-dragging');
    }
    for (const b of c.bars.values()) b.removeAttribute('data-kp-grabbed');
    c.press = null;
    c.kb = null;
    c.guide.hidden = true;
    c.readout.hidden = true;
    c.el.removeAttribute('data-kp-editing');
    settleDraw(c);
    if (was && why !== 'quiet') announce(c, c.strings.sequencerCancelled(labelOf(c, was)));
    flushPending(c);
}
/** Start choosing a partner for `id`. @param {SequencerModel} c @param {string} id */
export function startLink(c, id) {
    if (!c.editable || c.items.length < 2) return;
    c.linking = id;
    paintSelection(c);
    announce(c, c.strings.sequencerLinkStart(labelOf(c, id)));
}
/** @param {SequencerModel} c */
export function stopLink(c) {
    c.linking = null;
    paintSelection(c);
}
/** Make the linking item run alongside `partner`. @param {SequencerModel} c @param {string} partner */
export function finishLink(c, partner) {
    const id = c.linking;
    if (!id) return;
    c.linking = null;
    const plan = sequencerLink(c.items, id, partner, planOptions(c));
    if (!plan.ok) {
        paintSelection(c);
        refuse(c, id, plan);
        return;
    }
    commit(c, plan.items, 'link');
    announce(c, c.strings.sequencerLinked(labelOf(c, id), labelOf(c, partner)));
}
/** @param {SequencerModel} c @param {string} id */
export function unlink(c, id) {
    const plan = sequencerUnlink(c.items, id);
    if (!plan.ok || !plan.changed.length) return;
    commit(c, plan.items, 'link');
    announce(c, c.strings.sequencerUnlinked(labelOf(c, id)));
}
/** Move the focus between items with the arrows. @param {SequencerModel} c @param {string} id @param {KeyboardEvent} e @returns {boolean} */
export function navigate(c, id, e) {
    const item = c.items.find((i) => i.id === id);
    if (!item) return false;
    const inLane = c.items.filter((i) => i.lane === item.lane).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const rtl = getComputedStyle(c.el).direction === 'rtl';
    /** @type {SequencerItem | undefined} */
    let to;
    const at = inLane.findIndex((i) => i.id === id);
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) to = inLane[at + 1];
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) to = inLane[at - 1];
    else if (e.key === 'Home') to = inLane[0];
    else if (e.key === 'End') to = inLane[inLane.length - 1];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const order = c.lanes.map((l) => l.id);
        for (
            let k = order.indexOf(item.lane) + (e.key === 'ArrowDown' ? 1 : -1);
            k >= 0 && k < order.length && !to;
            k += e.key === 'ArrowDown' ? 1 : -1
        ) {
            const near = c.items.filter((i) => i.lane === order[k]);
            to = near.sort((a, b) => Math.abs(a.start - item.start) - Math.abs(b.start - item.start))[0];
        }
    } else return false;
    if (to) focusItem(c, to.id);
    return true;
}
