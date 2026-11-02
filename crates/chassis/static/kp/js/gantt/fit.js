// Fit to width [gantt-fit-1101]: `data-kp-gantt-scroll="fit"` lays the whole window across the frame's own width (no sideways
// scroll at any width), packs each lane's rows by what a bar takes WITH its label, and keeps every label whole: inside the bar,
// after it, before it, or on its own line under it. A lane is as tall as the rows it uses, no spare row.
import { dropOutside, labelWidth, setOutside } from './labels.js';
import { restEnd, windowOf } from './window.js';
/** @typedef {import('./constants.js').GanttBar} GanttBar */
/** @typedef {import('./constants.js').GanttModel} GanttModel */
/** @typedef {{ l: number, r: number }} Span px from the plot's start edge */
/** @typedef {'inside' | 'after' | 'before' | 'below'} Side */
/** @typedef {{ side: Side, at: number, row: number, inset: number }} Placed `at`: the label's start, seconds from the base */

/** The air, in px, kept between two things of one row (bars and labels). */
const FIT_GAP_PX = 4;
/** The air, in px, between a label and the bar it stands beside, or the line for now. */
const SIDE_GAP_PX = 4;
/** A bar's own label padding (0.375rem on each side) and an outside label's (0.25rem on each side), in px. */
const BAR_PAD_PX = 12;
const OUTSIDE_PAD_PX = 8;
/** Where each bar's label goes, from the last paint. @type {WeakMap<HTMLElement, Placed>} */
const PLACED = new WeakMap();

/** The timeline fits its width. @param {GanttModel} c */
export const isFit = (c) => c.el.getAttribute('data-kp-gantt-scroll') === 'fit';

/** The geometry of one paint: the window's start, seconds per px, the plot's width and now, in px. @param {GanttModel} c */
function scaleOf(c) {
    const room = c.plot.clientWidth;
    const w = windowOf(c);
    const perPx = room > 0 ? c.span / room : 0;
    return { room, from: w.from, perPx, nowX: perPx ? (w.now - w.from) / perPx : -1 };
}

/** @param {Span[]} row @param {Span} span */
const free = (row, span) => row.every((o) => span.l >= o.r + FIT_GAP_PX || span.r + FIT_GAP_PX <= o.l);
/** The line for now lies on a label's stretch. @param {number} nowX @param {Span} span */
const onNow = (nowX, span) => nowX > span.l - SIDE_GAP_PX && nowX < span.r + SIDE_GAP_PX;

/**
 * The ways a bar's label can stand, best first, each with the stretch of the row it takes (bar and label). Inside when the words fit
 * the bar (past the line for now when it crosses them); else after the bar (not for a bar still open with no planned end: it grows into
 * the words), else before it; never on the line for now nor past the plot's edges.
 * @param {{ left: number, right: number, reach: number, open: boolean, need: number }} b @param {{ room: number, nowX: number }} s
 * @returns {{ side: Side, x: number, take: Span, inset: number }[]}
 */
function waysOf(b, s) {
    const { left, right, reach, open, need } = b;
    const take = { l: left, r: reach };
    if (need <= right - left - 2) {
        if (!onNow(s.nowX, { l: left, r: left + need }) || s.nowX <= left) return [{ side: 'inside', x: left, take, inset: 0 }];
        if (need <= right - s.nowX - SIDE_GAP_PX) return [{ side: 'inside', x: left, take, inset: s.nowX + SIDE_GAP_PX - left }];
    }
    const wide = need - BAR_PAD_PX + OUTSIDE_PAD_PX;
    const after = { l: reach + SIDE_GAP_PX, r: reach + SIDE_GAP_PX + wide };
    const before = { l: left - SIDE_GAP_PX - wide, r: left - SIDE_GAP_PX };
    /** @type {{ side: Side, x: number, take: Span, inset: number }[]} */
    const ways = [];
    if (!open && after.r <= s.room && !onNow(s.nowX, after)) ways.push({ side: 'after', x: after.l, take: { l: left, r: after.r }, inset: 0 });
    if (before.l >= 0 && !onNow(s.nowX, before)) ways.push({ side: 'before', x: before.l, take: { l: before.l, r: reach }, inset: 0 });
    return ways;
}

/**
 * A label that has no room beside its bar stands on its own line right under it, from the bar's start and kept inside the plot; it
 * stands on its own plate over the line for now, so it stays with its bar (CSS). Only a label wider than the whole plot wraps.
 * @param {{ left: number, need: number }} b @param {{ room: number }} s @returns {{ span: Span, lines: number }}
 */
function lineUnder(b, s) {
    const wide = b.need - BAR_PAD_PX + OUTSIDE_PAD_PX;
    if (wide >= s.room) return { span: { l: 0, r: s.room }, lines: Math.ceil(wide / s.room) };
    const l = Math.min(Math.max(0, b.left), s.room - wide);
    return { span: { l, r: l + wide }, lines: 1 };
}

/** The first row from `from` on where every stretch fits its row (offset from that row). @param {Span[][]} rows @param {Span[]} spans */
function firstFree(rows, spans, from = 0) {
    let row = from;
    while (!spans.every((span, k) => free(rows[row + k] ?? [], span))) row += 1;
    return row;
}

/** A bar in px: its edges, how far its planned remainder reaches, whether it is still open, how wide its words are. @param {GanttModel} c @param {GanttBar} b @param {ReturnType<typeof scaleOf>} s @param {number} minBar */
function geometryOf(c, b, s, minBar) {
    const left = (b.s - s.from) / s.perPx;
    const end = b.e ?? s.from + s.nowX * s.perPx;
    const right = Math.max(left + minBar, (end - s.from) / s.perPx);
    const rest = restEnd(c, b.run);
    const reach = rest === null ? right : Math.max(right, (rest - s.from) / s.perPx);
    const open = b.e === null && rest === null;
    return { left, right, reach, open, need: labelWidth(c, b.bar) };
}

/**
 * Pack one lane's bars into rows for the fitted timeline and remember where each label goes. The lane's point marks (`marks`, seconds)
 * hold their stretch of the first row, as in packRows.
 * @param {GanttModel} c @param {GanttBar[]} bars in time order @param {{ s: number, e: number }[]} marks @param {number} minBar px
 * @returns {{ rows: Map<string, number>, count: number }}
 */
export function packFit(c, bars, marks, minBar) {
    const s = scaleOf(c);
    /** @type {Map<string, number>} */
    const given = new Map();
    if (!s.perPx) return { rows: given, count: 1 };
    /** @type {Span[][]} */
    const rows = [marks.map((m) => ({ l: (m.s - s.from) / s.perPx, r: (m.e - s.from) / s.perPx }))];
    for (const b of bars) {
        const g = geometryOf(c, b, s, minBar);
        const placed = placeOne(rows, g, s);
        PLACED.set(b.bar, { ...placed, at: s.from + placed.x * s.perPx });
        given.set(b.run.id, placed.barRow);
    }
    return { rows: given, count: Math.max(1, rows.length) };
}

/**
 * One bar into the rows: the lowest row that holds the bar with its label beside it, or, with no room beside it anywhere, the lowest
 * row that holds the bar with its label on the line(s) under it.
 * @param {Span[][]} rows changed in place @param {ReturnType<typeof geometryOf>} g @param {ReturnType<typeof scaleOf>} s
 */
function placeOne(rows, g, s) {
    const ways = waysOf(g, s);
    if (ways.length) {
        for (let row = 0; ; row += 1) {
            const way = ways.find((w) => free(rows[row] ?? [], w.take));
            if (!way) continue;
            (rows[row] ??= []).push(way.take);
            return { side: way.side, x: way.x, row, barRow: row, inset: way.inset };
        }
    }
    const under = lineUnder(g, s);
    const spans = [{ l: g.left, r: g.reach }, ...Array.from({ length: under.lines }, () => under.span)];
    const row = firstFree(rows, spans);
    spans.forEach((span, k) => (rows[row + k] ??= []).push(span));
    return { side: /** @type {Side} */ ('below'), x: under.span.l, row: row + 1, barRow: row, inset: 0 };
}

/** Put every label where the last paint placed it. @param {GanttModel} c */
export function placeFitLabels(c) {
    const room = c.plot.clientWidth;
    dropOutside(c);
    if (!room || c.state === 'loading') return;
    for (const lane of c.lanes)
        for (const b of lane.bars) {
            const placed = PLACED.get(b.bar);
            const side = !placed || b.bar.hidden || placed.side === 'inside' ? '' : placed.side;
            if (placed?.inset) b.bar.style.setProperty('--kp-g-label-inset', `${Math.round(placed.inset)}px`);
            else b.bar.style.removeProperty('--kp-g-label-inset');
            if (side) b.bar.dataset.kpLabel = side;
            else delete b.bar.dataset.kpLabel;
            setOutside(c, lane, b.bar, side, room, 0, placed?.row);
            const el = c.outside.get(b.bar);
            if (el && placed) el.style.setProperty('--kp-g-label-at', placed.at.toFixed(2));
        }
}
