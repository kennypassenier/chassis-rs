// Syncs the bars, the joins between them, the ticks and the labels.
import { make, px, setAttr, setText, summary, words } from './instance.js';
import { seriesOf, setProp } from './lanes.js';
import { sequencerTicks } from './timeline.js';
import { round } from './units.js';
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./instance.js').SequencerModel} SequencerModel */

/** Bars by id: made when new, removed when gone, never rebuilt. @param {SequencerModel} c @param {SequencerItem[]} list */
export function syncBars(c, list) {
    const doc = c.el.ownerDocument;
    const keep = new Set(list.map((i) => i.id));
    for (const [id, bar] of c.bars)
        if (!keep.has(id)) {
            bar.remove();
            c.outsides.get(id)?.remove();
            c.outsides.delete(id);
            c.bars.delete(id);
        }
    for (const item of list) {
        let bar = c.bars.get(item.id);
        if (!bar) {
            bar = make(doc, 'button', 'kp-gantt__run kp-sequencer__item');
            bar.type = 'button';
            bar.dataset.kpState = 'ok';
            bar.dataset.kpId = item.id;
            bar.setAttribute('aria-describedby', c.help.id);
            const start = make(doc, 'span', 'kp-sequencer__handle');
            start.dataset.edge = 'start';
            start.setAttribute('aria-hidden', 'true');
            const end = make(doc, 'span', 'kp-sequencer__handle');
            end.dataset.edge = 'end';
            end.setAttribute('aria-hidden', 'true');
            bar.append(start, make(doc, 'span', 'kp-gantt__label'), end);
            c.layer.append(bar);
            c.bars.set(item.id, bar);
        }
        const label = /** @type {HTMLElement} */ (bar.querySelector('.kp-gantt__label'));
        setText(label, item.label);
        setAttr(bar, 'data-kp-series', String(seriesOf(c, item)));
        setAttr(bar, 'aria-label', summary(c, item));
        bar.toggleAttribute('data-kp-linked', Boolean(item.with) || list.some((i) => i.with === item.id));
        bar.toggleAttribute('data-kp-locked', Boolean(item.locked));
        setAttr(bar, 'aria-pressed', String(c.selected === item.id));
        setAttr(bar, 'tabindex', (c.focusId ?? c.selected ?? list[0]?.id) === item.id ? '0' : '-1');
    }
}
/** The joins: a line from every item down or up to the partner it starts with. @param {SequencerModel} c @param {SequencerItem[]} list */
export function syncJoins(c, list) {
    const doc = c.el.ownerDocument;
    /** The middle of an item's bar, in px from the top of the layer. @param {SequencerItem} i */
    const centre = (i) => {
        const was = c.items.find((x) => x.id === i.id);
        const row = was && was.lane === i.lane ? (c.rows.rows.get(i.id) ?? 0) : 0;
        return (c.laneTops.find((l) => l.id === i.lane)?.top ?? 0) + c.padPx + row * c.rowPx + c.rowPx / 2;
    };
    const keep = new Set();
    for (const item of list) {
        const partner = item.with ? list.find((i) => i.id === item.with) : null;
        if (!partner) continue;
        keep.add(item.id);
        let join = c.joins.get(item.id);
        if (!join) {
            join = make(doc, 'span', 'kp-sequencer__join');
            join.setAttribute('aria-hidden', 'true');
            c.layer.append(join);
            c.joins.set(item.id, join);
        }
        const a = centre(item);
        const b = centre(partner);
        setProp(join, '--kp-g-s', String(item.start));
        setProp(join, '--kp-tl-top', px(Math.min(a, b)));
        setProp(join, '--kp-tl-height', px(Math.abs(a - b)));
    }
    for (const [id, join] of c.joins)
        if (!keep.has(id)) {
            join.remove();
            c.joins.delete(id);
        }
}
/** Axis ticks and the rules under them. @param {SequencerModel} c @param {number} [width] the plot's width when the caller already read it */
export function syncTicks(c, width = c.plot.clientWidth) {
    const room = width || 600;
    const { step, values } = sequencerTicks(c.span, room, c.unit.seconds);
    const key = `${c.unit.name}:${step}:${values.length}:${c.span}`;
    if (key === c.tickKey) return;
    c.tickKey = key;
    const doc = c.el.ownerDocument;
    c.axis.replaceChildren();
    c.lines.replaceChildren();
    for (const v of values) {
        const tick = make(doc, 'span', 'kp-gantt__tick', words(c, v));
        tick.style.setProperty('--kp-g-t', String(v));
        if (v >= c.span - step / 2 && v > 0) tick.setAttribute('data-kp-gantt-edge', '');
        c.axis.append(tick);
        const rule = make(doc, 'span', 'kp-gantt__rule');
        rule.style.setProperty('--kp-g-t', String(v));
        c.lines.append(rule);
    }
}
/** @typedef {{ high: number, scroll: number, client: number, need: number }} NameSize */
/** What was measured last, per sequencer and item: a name is probed again only when its text, its box or the font changed. @type {WeakMap<SequencerModel, Map<string, { key: string, size: NameSize }>>} */
const measured = new WeakMap();
/**
 * How each name wraps in its bar and how wide it is on one line: one probe pair per item whose text, bar width or font changed
 * (the rest is remembered), all written, then all read, so the whole set costs one layout instead of two per item, and a refresh
 * that changed nothing adds and removes no node.
 * @param {SequencerModel} c @param {SequencerItem[]} list @param {number} perUnit
 * @returns {Map<string, NameSize>}
 */
function measureNames(c, list, perUnit) {
    const memory = measured.get(c) ?? new Map();
    measured.set(c, memory);
    const font = getComputedStyle(c.measure).font;
    const keyOf = (/** @type {SequencerItem} */ item) => `${item.label}|${Math.max(0, (item.start + item.duration) * perUnit - item.start * perUnit - 2)}|${font}`;
    const stale = list.filter((item) => memory.get(item.id)?.key !== keyOf(item));
    const probes = stale.map((item) => {
        const wrap = /** @type {HTMLElement} */ (c.measure.cloneNode(false));
        const line = /** @type {HTMLElement} */ (c.ruler.cloneNode(false));
        wrap.textContent = item.label;
        wrap.style.inlineSize = `${Math.max(0, (item.start + item.duration) * perUnit - item.start * perUnit - 2)}px`;
        line.textContent = item.label;
        return { item, wrap, line };
    });
    if (probes.length) c.probeBox.append(...probes.flatMap((p) => [p.wrap, p.line]));
    for (const { item, wrap, line } of probes)
        memory.set(item.id, { key: keyOf(item), size: { high: wrap.scrollHeight, scroll: wrap.scrollWidth, client: wrap.clientWidth, need: line.offsetWidth } });
    for (const p of probes) {
        p.wrap.remove();
        p.line.remove();
    }
    const keep = new Set(list.map((i) => i.id));
    for (const id of memory.keys()) if (!keep.has(id)) memory.delete(id);
    return new Map(list.map((item) => [item.id, /** @type {{ key: string, size: NameSize }} */ (memory.get(item.id)).size]));
}
/** @typedef {{ width: number, pad: number, barPx: number, sizes: Map<string, NameSize> }} NameRead */
/**
 * Everything placeLabels needs from the page, read in one go: the plot's width, the bar's padding and height, and every name's
 * size. Reads only the page (the probes live in a contained box), so a paint can do it before it writes a bar and pay for one
 * layout, not one per step. Null when the plot has no width (hidden). @param {SequencerModel} c @returns {NameRead | null}
 */
export function readNames(c) {
    const width = c.plot.clientWidth;
    if (!width) return null;
    const pad = Number.parseFloat(getComputedStyle(c.measure).paddingLeft) * 2 || 12;
    return { width, pad, barPx: c.rowPx * 0.8, sizes: measureNames(c, c.view, width / c.span) };
}
/**
 * A name that does not fit its bar (wrapped on at most the lines the bar is tall for) stands outside it: after it when the row has
 * room, else before it, else it is left to the bar's name (its label). Never cut with an ellipsis. @param {SequencerModel} c
 * @param {NameRead | null} [read] what readNames returned, when the caller read before it wrote
 */
export function placeLabels(c, read = readNames(c)) {
    if (!read) return;
    const { width, pad, barPx, sizes } = read;
    const perUnit = width / c.span;
    const doc = c.el.ownerDocument;
    /** @type {Map<string, SequencerItem[]>} */
    const byRow = new Map();
    for (const item of c.view) {
        const key = `${item.lane}|${c.rows.rows.get(item.id) ?? 0}`;
        byRow.set(key, [...(byRow.get(key) ?? []), item]);
    }
    for (const row of byRow.values()) {
        row.sort((a, b) => a.start - b.start);
        // The right edge of the last name stood after its bar: the next bar's name may not stand before its bar over it.
        let claimed = 0;
        row.forEach((item, i) => {
            const bar = c.bars.get(item.id);
            if (!bar) return;
            const left = item.start * perUnit;
            const right = (item.start + item.duration) * perUnit;
            const size = /** @type {NameSize} */ (sizes.get(item.id));
            const fits = right - left - 2 > pad + 8 && size.high <= barPx - 2 + 0.5 && size.scroll <= size.client + 0.5;
            const need = size.need;
            const prev = row[i - 1];
            const next = row[i + 1];
            const after = (next ? next.start * perUnit : width) - right - 8;
            const before = left - Math.max(prev ? (prev.start + prev.duration) * perUnit : 0, claimed) - 8;
            const side = fits ? null : after >= need ? 'after' : before >= need ? 'before' : 'none';
            if (side === 'after') claimed = right + 4 + need + 4;
            let out = c.outsides.get(item.id);
            if (side === null || side === 'none') {
                out?.remove();
                c.outsides.delete(item.id);
            } else {
                if (!out) {
                    out = make(doc, 'span', 'kp-gantt__outside kp-sequencer__outside');
                    out.setAttribute('aria-hidden', 'true');
                    c.layer.append(out);
                    c.outsides.set(item.id, out);
                }
                setText(out, item.label);
                setAttr(out, 'data-kp-side', side);
                setAttr(out, 'data-kp-state', 'ok');
                setProp(out, '--kp-g-label-room', px(side === 'after' ? after : before));
                setProp(out, '--kp-g-s', String(item.start));
                setProp(out, '--kp-g-e', String(round(item.start + item.duration)));
                setProp(out, '--kp-tl-top', bar.style.getPropertyValue('--kp-tl-top'));
                setProp(out, '--kp-tl-line', bar.style.getPropertyValue('--kp-tl-line'));
            }
            if (side) setAttr(bar, 'data-kp-label', side);
            else bar.removeAttribute('data-kp-label');
        });
    }
}
