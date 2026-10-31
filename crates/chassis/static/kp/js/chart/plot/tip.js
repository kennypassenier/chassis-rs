// The legend's values, the tooltip beside the crosshair, and what the chart announces.
import { hourChange, indexAt } from '../selection.js';
import { HOUR, MINUTE } from '../time.js';
import { h } from '../dom.js';
import { paintSeries } from '../attach.js';
import { PlotLegend } from './legend.js';
/** @typedef {import('./base.js').PlotGeometry} PlotGeometry */
/** @typedef {{ si: number, label: string, v: number, d: number }} TipRow */

/** The share of the window within which an event counts as near the crosshair. */
const NEAR_SHARE = 30;
/** The tooltip's gap beside the crosshair, and its width before it was measured, in pixels. */
const TIP_GAP = 14;
const TIP_WIDTH = 240;

export class PlotTip extends PlotLegend {
    paintLegend() {
        const t = this.pinned ?? this.cursor;
        this.data.series.forEach((series, si) => {
            const it = this.items[si];
            if (!it) return;
            const on = this.sel.size === 0 || this.sel.has(si);
            const pts = this.points[si];
            const v = pts.length === 0 ? null : t != null ? pts[indexAt(pts, t)][1] : pts[pts.length - 1][1];
            it.button.setAttribute('aria-pressed', String(this.sel.has(si)));
            it.button.toggleAttribute('data-kp-off', !on);
            it.value.textContent = series.total != null && t == null ? series.total.toLocaleString(this.locale) : v == null ? '' : this.fmt(v, 'legend');
        });
        this.ui.showAll.hidden = this.sel.size === 0;
    }

    /**
     * What is under the crosshair at `t`, for the tooltip and the readout; for a pin outside the window only the sources whose
     * readings still reach it (within an hour), not a reading from another time.
     * @param {number} t @param {boolean} [strict]
     * @returns {TipRow[]}
     */
    rowsAt(t, strict = false) {
        const { points } = this;
        return this.visible()
            .filter((si) => {
                const p = points[si];
                return p.length > 0 && (!strict || (t >= p[0][0] - HOUR && t <= p[p.length - 1][0] + HOUR));
            })
            .map((si) => {
                const k = indexAt(points[si], t);
                return { si, label: this.data.series[si].label || this.label(), v: points[si][k][1], d: hourChange(points[si], k) };
            })
            .sort((a, b) => b.v - a.v);
    }

    /** The events within reach of `t`: a thirtieth of the window. @param {number} t */
    eventsNear(t) {
        if (!this.geo) return [];
        const reach = (this.geo.to - this.geo.from) / NEAR_SHARE;
        return this.shownEvents().filter((ev) =>
            ev.until != null && ev.until > ev.at ? t >= ev.at - reach && t <= ev.until + reach : Math.abs(ev.at - t) < reach,
        );
    }

    /** @param {number} d */
    change(d) {
        return d === 0 ? '±0' : `${d > 0 ? '▲' : '▼'} ${this.fmt(Math.abs(d), 'delta')}`;
    }

    paintTip() {
        const { tip } = this.ui;
        // Only the chart the crosshair was moved on shows its tooltip, or a pinned one: a redraw of the whole group (a zoom, a live
        // update) pops up no other.
        const t = this.pinned ?? (this.group.owner === this.state ? this.cursor : null);
        const geo = this.geo;
        if (t == null || !geo) {
            tip.hidden = true;
            return;
        }
        // A pin the window moved past (a live update while pinned) stays, docked, until it is released.
        const outside = t < geo.from || t > geo.to;
        if (outside && this.pinned == null) {
            tip.hidden = true;
            return;
        }
        this.fillTip(t, outside);
        tip.hidden = false;
        tip.toggleAttribute('data-kp-pinned', this.pinned != null);
        tip.toggleAttribute('data-kp-outside', outside);
        this.placeTip(t, outside, geo);
    }

    /** The tooltip's words: the time, the pin, a row per source, the events near and the median. @param {number} t @param {boolean} outside */
    fillTip(t, outside) {
        const { tipTime, pin, pinWord, tipRows, tipFoot, tipEvents, tipMedian } = this.ui;
        const { strings, medians } = this;
        tipTime.textContent = this.time(Math.round(t / MINUTE) * MINUTE, 'full', {});
        pin.hidden = this.pinned == null;
        pinWord.textContent = outside ? strings.pinnedOutside : strings.pinned;
        const rows = this.rowsAt(t, outside).map((r) => this.tipRow(r));
        tipRows.replaceChildren(...rows);
        tipRows.hidden = rows.length === 0;
        tipFoot.hidden = rows.length === 0;
        tipEvents.replaceChildren(...this.eventsNear(t).map((ev) => this.tipEvent(ev)));
        // On a phone the median's words are not on the plot: the tooltip carries them.
        tipMedian.hidden = medians.length === 0;
        if (medians.length)
            tipMedian.textContent = medians
                .map((m) => `${medians.length > 1 ? `${m.label}: ` : ''}${this.medianWords(this.option())} ${this.fmt(m.v, 'tip')}`)
                .join('; ');
    }

    /** One source's row in the tooltip. @param {TipRow} r */
    tipRow(r) {
        const { doc } = this;
        const swatch = h(doc, 'i', { class: 'kp-chart__swatch', 'aria-hidden': 'true' });
        paintSeries(swatch, this.data.series[r.si], r.si);
        const delta = h(
            doc,
            'span',
            { class: 'kp-chart__num kp-chart__delta', 'data-kp-direction': r.d > 0 ? 'up' : r.d < 0 ? 'down' : null },
            this.change(r.d),
        );
        const row = h(doc, 'div', { class: 'kp-chart__tip-row' }, swatch, h(doc, 'span', {}, r.label), h(doc, 'span', { class: 'kp-chart__num' }, this.fmt(r.v, 'tip')), delta);
        if (this.hot === r.si) row.setAttribute('data-kp-state', 'hot');
        return row;
    }

    /** One event near the crosshair, with its link while pinned. @param {import('../words.js').ChartEvent} ev */
    tipEvent(ev) {
        const { doc, strings, time } = this;
        const words =
            ev.until != null && ev.until > ev.at
                ? `${strings.bandWhen(time(ev.at, 'clock', {}), time(ev.until, 'clock', {}))} ${ev.label}`
                : `${time(ev.at, 'clock', {})} ${ev.label}`;
        const line = h(doc, 'p', { class: 'kp-chart__tip-event' }, h(doc, 'i', { class: 'kp-chart__dot', 'data-kp-tone': this.toneOf(ev), 'aria-hidden': 'true' }), words);
        if (this.pinned != null && ev.href) line.append(h(doc, 'a', { href: ev.href }, strings.open));
        return line;
    }

    /**
     * Beside the crosshair, on whichever side has room, never past the chart's edge; docked, in the corner away from it; a pin
     * outside the window at the edge it left by.
     * @param {number} t @param {boolean} outside @param {PlotGeometry} geo
     */
    placeTip(t, outside, geo) {
        const { tip } = this.ui;
        const room = this.host.clientWidth || geo.W;
        const w = Math.min(tip.offsetWidth || TIP_WIDTH, room);
        const px = outside ? (t < geo.from ? 0 : room) : geo.x(t);
        const left = outside ? (t < geo.from ? 0 : room - w) : px + TIP_GAP + w > room ? px - w - TIP_GAP : px + TIP_GAP;
        tip.style.setProperty('--kp-chart-tip-x', `${Math.max(0, Math.min(room - w, left))}px`);
        tip.setAttribute('data-kp-side', px > room / 2 ? 'start' : 'end');
    }

    /** Say what is under the crosshair (keys and pins only: a pointer would talk too much). */
    announce() {
        const { strings, time, fmt } = this;
        const t = this.pinned ?? this.cursor;
        if (t == null) return;
        const outside = this.geo != null && (t < this.geo.from || t > this.geo.to);
        const said = this.rowsAt(t, outside).map(
            (r) => `${r.label} ${fmt(r.v, 'readout')}, ${r.d > 0 ? strings.up : r.d < 0 ? strings.down : strings.same}${r.d ? ` ${fmt(Math.abs(r.d), 'readout')}` : ''}`,
        );
        const near = this.eventsNear(t).map((ev) => `${ev.label} ${time(ev.at, 'clock', {})}`);
        for (const m of this.medians) near.push(`${this.medianWords(this.option())} ${fmt(m.v, 'readout')}`);
        const head = `${time(t, 'full', {})}${this.pinned == null ? '' : outside ? ` ${strings.pinnedOutside}` : ` (${strings.pinned})`}`;
        this.ui.readout.textContent = [head, ...said, ...near].join('; ');
    }
}
