// Places each bar's label inside, beside or outside its bar.
import { make } from './constants.js';
/** @typedef {import('./constants.js').GanttLaneModel} GanttLaneModel */
/** @typedef {import('./constants.js').GanttModel} GanttModel */

/** The canvas the labels are measured on, one per document. @type {WeakMap<Document, CanvasRenderingContext2D | null>} */
const MEASURERS = new WeakMap();
/**
 * How wide a bar's label wants to be on one line: its text in its own font, the bar's padding and, on a failed bar, the cross.
 * Measured once per text and font (a label hidden by its narrow bar can be measured too), and again only when either changes.
 * @param {GanttModel} c @param {HTMLElement} bar
 */
function labelWidth(c, bar) {
    const label = /** @type {HTMLElement} */ (bar.firstElementChild);
    const text = label.textContent ?? '';
    const style = getComputedStyle(label);
    const key = `${text}\u0000${style.font}`;
    const known = c.labels.get(bar);
    if (known && known.key === key) return known.width;
    const doc = c.el.ownerDocument;
    if (!MEASURERS.has(doc)) MEASURERS.set(doc, doc.createElement('canvas').getContext('2d'));
    const ctx = MEASURERS.get(doc);
    let width = Number.POSITIVE_INFINITY;
    if (ctx) {
        ctx.font = style.font;
        const size = Number.parseFloat(style.fontSize) || 11;
        // The theme's own letter-spacing and case count: the words are measured as they are drawn.
        const spacing = style.letterSpacing === 'normal' ? 0 : Number.parseFloat(style.letterSpacing) || 0;
        const shown = style.textTransform === 'uppercase' ? text.toUpperCase() : style.textTransform === 'lowercase' ? text.toLowerCase() : text;
        width = ctx.measureText(shown).width + spacing * [...shown].length + 2 * 0.375 * 16 + (bar.dataset.kpState === 'failed' ? size * 1.25 : 0);
    }
    c.labels.set(bar, { key, width });
    return width;
}
/** The air kept after an outside label, in px, before the next bar or label of its row. */
const OUTSIDE_GAP_PX = 6;
/** The air, in px, between a mark's button and the bar it stands beside, or the label beside a mark. */
export const MARK_GAP_PX = 2;
/** The least gap, in px, between two runs of one row of a lane. */
export const RUN_GAP_PX = 3;
/** The air, in px, kept between the line for now and the words of a label inside a bar. */
const NOW_GAP_PX = 4;
/**
 * The label that stands outside a bar: a sibling of the bar in its lane (a bar clips what is inside it, and a theme may cut its
 * corners), placed by the same custom properties as the bar, so it moves with the window as the bar does.
 * @param {GanttModel} c @param {GanttLaneModel} lane @param {HTMLElement} bar @param {'after' | 'before' | ''} side @param {number} room px
 * @param {number} [shift] px the label stands clear of a mark that is beside the bar, away from the bar
 */
function setOutside(c, lane, bar, side, room, shift = 0) {
    let el = c.outside.get(bar);
    if (!side) {
        el?.remove();
        c.outside.delete(bar);
        return;
    }
    if (!el) {
        el = make(c.el.ownerDocument, 'span', 'kp-gantt__outside');
        el.setAttribute('aria-hidden', 'true');
        c.outside.set(bar, el);
    }
    if (el.parentElement !== lane.track) lane.track.append(el);
    const text = bar.firstElementChild?.textContent ?? '';
    if (el.textContent !== text) el.textContent = text;
    if (el.dataset.kpSide !== side) el.dataset.kpSide = side;
    if (el.dataset.kpState !== bar.dataset.kpState) el.dataset.kpState = bar.dataset.kpState ?? '';
    for (const name of ['--kp-g-s', '--kp-g-e', '--kp-g-row']) {
        const value = bar.style.getPropertyValue(name);
        if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
    }
    el.style.setProperty('--kp-g-label-room', `${Math.floor(room)}px`);
    el.style.setProperty('--kp-g-label-shift', `${Math.round(shift)}px`);
}
/** The outside labels of bars that are gone or out of the window go with them. @param {GanttModel} c */
function dropOutside(c) {
    for (const [bar, el] of c.outside)
        if (!bar.isConnected || bar.hidden) {
            el.remove();
            c.outside.delete(bar);
        }
    for (const bar of c.labels.keys()) if (!bar.isConnected) c.labels.delete(bar);
}
/**
 * A mark (a start diamond) whose button would lie on a bar of its row stands clear of it: moved away from the bar's edge it is
 * at, by the overlap and a small gap, so a mark and a bar never overlap. A mark that is well inside a bar (an event during the
 * run) stays where its moment is.
 * @param {GanttLaneModel} lane @param {{ left: number, right: number }[]} bars the lane's first-row bars, in px
 * @returns {{ left: number, right: number }[]} the boxes of the lane's marks, in px
 */
function clearMarks(lane, bars) {
    /** @type {{ left: number, right: number }[]} */
    const boxes = [];
    for (const el of lane.points) {
        if (el.hidden || el.hasAttribute('data-kp-clustered')) continue;
        const width = el.offsetWidth;
        if (!width) continue;
        const was = Number.parseFloat(el.style.getPropertyValue('--kp-g-dodge')) || 0;
        let left = el.offsetLeft - was;
        let right = left + width;
        let dodge = 0;
        const centre = (left + right) / 2;
        for (const bar of bars) {
            if (right <= bar.left || left >= bar.right) continue;
            // Only at an edge: the centre of the mark is within its own half-width of the bar's start or end.
            const half = width / 2;
            if (Math.abs(centre - bar.left) <= half + 1) dodge = Math.min(dodge, bar.left - MARK_GAP_PX - right);
            else if (Math.abs(centre - bar.right) <= half + 1) dodge = Math.max(dodge, bar.right + MARK_GAP_PX - left);
        }
        if (dodge !== 0) {
            left += dodge;
            right += dodge;
        }
        const value = dodge === 0 ? '' : `${dodge.toFixed(1)}px`;
        if (el.style.getPropertyValue('--kp-g-dodge') !== value) {
            if (value) el.style.setProperty('--kp-g-dodge', value);
            else el.style.removeProperty('--kp-g-dodge');
        }
        boxes.push({ left, right });
    }
    return boxes.sort((a, b) => a.left - b.left);
}
/**
 * A label that does not fit its bar stands outside it [gaps-time-1019]: after the bar when the room before the next bar or mark
 * of its row (or the plot's end) holds it, else before the bar, else it is not drawn: a label is never cut (the house rule has no
 * ellipsis), and the bar's name and card carry the words. A label stands clear of a mark beside its bar. The rows are walked in
 * time order and the room a label took is not offered to the next bar, so two labels never meet.
 * @param {GanttModel} c
 */
export function placeLabels(c) {
    const room = c.plot.clientWidth;
    dropOutside(c);
    if (!room || c.state === 'loading') return;
    const nowRect = c.nowLine.hidden || c.nowLine.hasAttribute('data-kp-out') ? null : c.nowLine.getBoundingClientRect();
    for (const lane of c.lanes) {
        // The line for now crosses every row of the lane: a label never stands on it [ganttlabel-1019].
        const nowBox = nowRect
            ? { left: nowRect.left - lane.track.getBoundingClientRect().left, right: nowRect.right - lane.track.getBoundingClientRect().left }
            : null;
        /** @type {Map<number, { bar: HTMLButtonElement, left: number, right: number }[]>} */
        const rows = new Map();
        for (const b of lane.bars) {
            if (b.bar.hidden) continue;
            const left = b.bar.offsetLeft;
            const right = left + b.bar.offsetWidth;
            const list = rows.get(b.row) ?? [];
            list.push({ bar: b.bar, left, right });
            rows.set(b.row, list);
        }
        // The marks stand on the lane's first row.
        const first = clearMarks(lane, rows.get(0) ?? []);
        for (const [row, list] of rows) {
            const marks = (row === 0 ? (nowBox ? [...first, nowBox] : first) : nowBox ? [nowBox] : []).sort((a, b) => a.left - b.left);
            list.sort((a, b) => a.left - b.left);
            let taken = 0;
            list.forEach((item, i) => {
                const { bar, left, right } = item;
                const need = labelWidth(c, bar);
                /** @type {string} */
                let place = '';
                let roomPx = 0;
                let shift = 0;
                // A label that fits its bar but would be crossed by the line for now steps to the side of the line with room for it
                // (--kp-g-label-inset), and stands outside the bar when neither side holds it.
                let inset = 0;
                let crossed = false;
                if (nowBox && need <= right - left - 2 && nowBox.right + NOW_GAP_PX > left && nowBox.left - NOW_GAP_PX < left + need) {
                    crossed = nowBox.left > left && nowBox.left < right;
                    if (crossed) {
                        const free = right - nowBox.right - NOW_GAP_PX - 1;
                        if (need <= free) {
                            inset = nowBox.right + NOW_GAP_PX - left;
                            crossed = false;
                        }
                    }
                }
                if (inset) bar.style.setProperty('--kp-g-label-inset', `${Math.round(inset)}px`);
                else bar.style.removeProperty('--kp-g-label-inset');
                if (need > right - left - 2 || crossed) {
                    // A label stands 4 px from its bar (8 px from one that is still open: the line for now is there).
                    const start = bar.dataset.kpState === 'running' || bar.dataset.kpState === 'queued' ? 8 : 4;
                    const wanted = need - 2 * 0.375 * 16 + 8;
                    let next = list[i + 1]?.left ?? room;
                    let from = right + start;
                    let upTo = left - 4;
                    let floor = taken;
                    // A mark (first row) or the line for now in the way: after the bar the label starts past it, before the bar it ends short of it.
                    for (const m of marks) {
                        if (m.right <= from - 1) continue;
                        if (m.left < from + wanted + OUTSIDE_GAP_PX) from = m.right + MARK_GAP_PX + 2;
                        else {
                            next = Math.min(next, m.left);
                            break;
                        }
                    }
                    for (let k = marks.length - 1; k >= 0; k--) {
                        const m = /** @type {{ left: number, right: number }} */ (marks[k]);
                        if (m.left >= upTo + 1) continue;
                        if (m.right > upTo - wanted - OUTSIDE_GAP_PX) upTo = m.left - MARK_GAP_PX - 2;
                        else {
                            floor = Math.max(floor, m.right);
                            break;
                        }
                    }
                    const after = next - from - OUTSIDE_GAP_PX;
                    const before = upTo - floor - OUTSIDE_GAP_PX;
                    if (after >= wanted) [place, roomPx, shift] = ['after', after, from - (right + start)];
                    else if (before >= wanted) [place, roomPx, shift] = ['before', before, left - 4 - upTo];
                    else place = 'none';
                    if (place === 'after') taken = from + Math.min(wanted, roomPx) + OUTSIDE_GAP_PX;
                    else taken = Math.max(taken, right);
                } else taken = Math.max(taken, right);
                if (bar.dataset.kpLabel !== place) {
                    if (place) bar.dataset.kpLabel = place;
                    else delete bar.dataset.kpLabel;
                }
                setOutside(c, lane, bar, place === 'after' || place === 'before' ? place : '', roomPx, shift);
            });
        }
    }
}
