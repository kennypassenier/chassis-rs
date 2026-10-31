// Syncs the bars, the joins between them, the ticks and the labels.
import { make, px, summary, words } from './instance.js';
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
        if (label.textContent !== item.label) label.textContent = item.label;
        bar.dataset.kpSeries = String(seriesOf(c, item));
        const said = summary(c, item);
        if (bar.getAttribute('aria-label') !== said) bar.setAttribute('aria-label', said);
        bar.toggleAttribute('data-kp-linked', Boolean(item.with) || list.some((i) => i.with === item.id));
        bar.toggleAttribute('data-kp-locked', Boolean(item.locked));
        bar.setAttribute('aria-pressed', String(c.selected === item.id));
        bar.tabIndex = (c.focusId ?? c.selected ?? list[0]?.id) === item.id ? 0 : -1;
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
/** Axis ticks and the rules under them. @param {SequencerModel} c */
export function syncTicks(c) {
    const room = c.plot.clientWidth || 600;
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
/**
 * A name that does not fit its bar (wrapped on at most the lines the bar is tall for) stands outside it: after it when the row has
 * room, else before it, else it is left to the bar's name (its label). Never cut with an ellipsis. @param {SequencerModel} c
 */
export function placeLabels(c) {
    const width = c.plot.clientWidth;
    if (!width) return;
    const perUnit = width / c.span;
    const doc = c.el.ownerDocument;
    const pad = Number.parseFloat(getComputedStyle(c.measure).paddingLeft) * 2 || 12;
    const barPx = c.rowPx * 0.8;
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
            c.measure.textContent = item.label;
            c.measure.style.inlineSize = `${Math.max(0, right - left - 2)}px`;
            const fits =
                right - left - 2 > pad + 8 && c.measure.scrollHeight <= barPx - 2 + 0.5 && c.measure.scrollWidth <= c.measure.clientWidth + 0.5;
            c.ruler.textContent = item.label;
            const need = c.ruler.offsetWidth;
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
                out.textContent = item.label;
                out.dataset.kpSide = side;
                out.dataset.kpState = 'ok';
                setProp(out, '--kp-g-label-room', px(side === 'after' ? after : before));
                setProp(out, '--kp-g-s', String(item.start));
                setProp(out, '--kp-g-e', String(round(item.start + item.duration)));
                setProp(out, '--kp-tl-top', bar.style.getPropertyValue('--kp-tl-top'));
                setProp(out, '--kp-tl-line', bar.style.getPropertyValue('--kp-tl-line'));
            }
            if (side) bar.dataset.kpLabel = side;
            else bar.removeAttribute('data-kp-label');
        });
    }
}
