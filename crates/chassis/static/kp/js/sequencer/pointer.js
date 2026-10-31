// Pointer handling: down, move, up and cancel.
import { cancelEdit, dragTo, finishLink, stopLink } from './drag.js';
import { commit, flushPending, refuse, select, setZoom, settleDraw, unitAt } from './edit.js';
import { DRAG_PX } from './constants.js';
import { announce, summary } from './instance.js';
import { overlaps, sequencerGroup } from './plan.js';
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./instance.js').SequencerModel} SequencerModel */

/** @param {SequencerModel} c @param {PointerEvent} e */
export function onDown(c, e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const bar = target.closest?.('.kp-sequencer__item');
    if (e.pointerType === 'touch' && !(bar instanceof HTMLElement) && c.scroll.contains(target)) {
        c.touches.set(e.pointerId, { x: e.clientX });
        if (c.touches.size === 2) {
            const [a, b] = [...c.touches.values()];
            c.pinch = { dist: Math.abs((a?.x ?? 0) - (b?.x ?? 0)) || 1, zoom: c.zoom };
        }
        return;
    }
    if (!(bar instanceof HTMLElement) || e.button !== 0) return;
    const id = bar.dataset.kpId ?? '';
    const item = c.items.find((i) => i.id === id);
    if (!item) return;
    if (c.linking) {
        e.preventDefault();
        if (id !== c.linking) finishLink(c, id);
        else stopLink(c);
        return;
    }
    if (c.kb) cancelEdit(c, 'quiet');
    const handle = target.closest?.('.kp-sequencer__handle');
    const edge =
        handle instanceof HTMLElement && handle.dataset.edge === 'start'
            ? 'start'
            : handle instanceof HTMLElement && handle.dataset.edge === 'end'
              ? 'end'
              : 'body';
    c.press = {
        id,
        edge,
        x: e.clientX,
        y: e.clientY,
        pointer: e.pointerId,
        grab: unitAt(c, e.clientX) - item.start,
        bar: /** @type {HTMLButtonElement} */ (bar),
        moved: false,
        before: c.items,
        refused: false,
        lanes: [],
        last: null,
        edgeX: e.clientX,
    };
    select(c, id);
    c.focusId = id;
    try {
        bar.setPointerCapture(e.pointerId);
    } catch {
        // A pointer that is already gone cannot be captured; the press ends with it.
    }
}
/** @param {SequencerModel} c @param {PointerEvent} e */
export function onMove(c, e) {
    if (c.touches.has(e.pointerId)) {
        c.touches.set(e.pointerId, { x: e.clientX });
        if (c.pinch && c.touches.size === 2) {
            const [a, b] = [...c.touches.values()];
            const dist = Math.abs((a?.x ?? 0) - (b?.x ?? 0)) || 1;
            setZoom(c, c.pinch.zoom * (dist / c.pinch.dist), ((a?.x ?? 0) + (b?.x ?? 0)) / 2);
        }
        return;
    }
    const p = c.press;
    if (!p || p.pointer !== e.pointerId) return;
    if (!p.moved) {
        if (!c.editable || Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
        p.moved = true;
        p.lanes = c.laneEls
            .filter((el) => el.classList.contains('kp-gantt__track'))
            .map((el, i) => {
                const r = el.getBoundingClientRect();
                return { id: c.lanes[i]?.id ?? '', top: r.top, bottom: r.bottom };
            });
        p.bar.setAttribute('data-kp-dragging', '');
        c.el.setAttribute('data-kp-editing', 'pointer');
    }
    p.y = e.clientY;
    dragTo(c, e);
}
/** @param {SequencerModel} c @param {PointerEvent} e */
export function onUp(c, e) {
    if (c.touches.delete(e.pointerId)) {
        if (c.touches.size < 2) c.pinch = null;
        return;
    }
    const p = c.press;
    if (!p || p.pointer !== e.pointerId) return;
    window.clearTimeout(c.scrollTimer);
    p.bar.removeAttribute('data-kp-dragging');
    p.bar.removeAttribute('data-kp-refused');
    if (!p.moved) {
        c.press = null;
        return;
    }
    if (p.refused) {
        const last = p.last;
        const blocker = last ? overlapBlocker(c, last.items, p.id) : null;
        c.press = null;
        settleDraw(c);
        c.guide.hidden = true;
        c.readout.hidden = true;
        c.el.removeAttribute('data-kp-editing');
        refuse(c, p.id, { ok: false, items: p.before, changed: [], pushed: [], reason: 'overlap', blocker });
        flushPending(c);
        return;
    }
    commit(c, p.last?.items ?? c.items, 'pointer');
    const item = c.items.find((i) => i.id === p.id);
    if (item) announce(c, c.strings.sequencerDropped(summary(c, item)));
}
/** The item a refused draft overlaps. @param {SequencerModel} c @param {SequencerItem[]} draft @param {string} id */
function overlapBlocker(c, draft, id) {
    const me = draft.find((i) => i.id === id);
    const group = sequencerGroup(draft, id);
    if (!me) return null;
    return draft.find((i) => !group.has(i.id) && i.lane === me.lane && overlaps(me, i))?.id ?? null;
}
/** @param {SequencerModel} c @param {PointerEvent} e */
export function onCancel(c, e) {
    if (c.touches.delete(e.pointerId)) {
        if (c.touches.size < 2) c.pinch = null;
        return;
    }
    if (c.press && c.press.pointer === e.pointerId) cancelEdit(c, 'pointer');
}
