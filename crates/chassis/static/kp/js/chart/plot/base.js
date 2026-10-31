// The base of one full chart's controller: its state, the elements it draws into, and the small readers of that state.
//
// The full chart used to be one closure split into install functions that shared a context object. It is now a chain of classes
// (base -> legend -> tip -> draw -> pointer -> controller) with the state of one chart on the instance; the drawing of one frame is
// a PlotDrawing (frame.js, drawing.js). The constructors build the chart's parts detached; `PlotChart.connect()` puts them in the
// page and wires them, in the order the install functions ran.
import { Controller } from '../../controller.js';
import { DATA } from '../api.js';
import { decorateWith, dataInMarkup, h } from '../dom.js';
import { chartHeight, valueFormat } from '../attach.js';
import { chartState } from '../state.js';
import { HOUR } from '../time.js';
import { CHART_SELECT_EVENT } from '../constants.js';
/** @typedef {import('../api.js').ChartContext} ChartContext */
/** @typedef {import('../api.js').ChartState} ChartState */
/** @typedef {import('../group.js').ChartGroup} ChartGroup */
/** @typedef {import('../words.js').ChartData} ChartData */
/** @typedef {import('../words.js').ChartEvent} ChartEvent */
/** @typedef {import('../words.js').ChartPoint} ChartPoint */
/** @typedef {import('../words.js').ChartWindow} ChartWindow */
/** @typedef {{ median: boolean, medianWords: string, runs: boolean, minPoints: number, minUnit: string, key: boolean, band: 'tint' | 'hatch' | 'bracket' }} PlotOptions */
/** @typedef {{ x: (t: number) => number, inv: (px: number) => number, W: number, P: { l: number, r: number, t: number, b: number }, from: number, to: number, svg: SVGSVGElement }} PlotGeometry */
/** @typedef {{ si: number, label: string, v: number }} PlotMedian */
/** What plotChart() hands its controller. @typedef {{ group: ChartGroup, locale: string, ctx: ChartContext }} PlotSettings */

/**
 * The parts one chart draws into, detached.
 * @param {Document} doc
 * @param {ChartContext['strings']} strings
 */
function buildParts(doc, strings) {
    const plot = h(doc, 'div', { class: 'kp-chart__plot', tabindex: '0', role: 'application' });
    // The tooltip's parts stay: a live update changes their words, so a focused ✕ keeps its focus.
    const tipTime = h(doc, 'b');
    const release = h(doc, 'button', { type: 'button', class: 'kp-chart__release', 'aria-label': strings.release, title: strings.release }, '✕');
    const pinWord = h(doc, 'span');
    const pin = h(doc, 'span', { class: 'kp-chart__pin' }, pinWord, release);
    const tipRows = h(doc, 'div', { class: 'kp-chart__tip-rows' });
    const tipFoot = h(doc, 'p', { class: 'kp-chart__tip-foot' }, strings.change);
    const tipEvents = h(doc, 'div', { class: 'kp-chart__tip-events' });
    const tip = h(doc, 'div', { class: 'kp-chart__tip' }, h(doc, 'p', { class: 'kp-chart__tip-head' }, tipTime, pin), tipRows, tipFoot, tipEvents);
    tip.hidden = true;
    const note = h(doc, 'p', { class: 'kp-chart__note' }, strings.onePoint);
    note.hidden = true;
    const readout = h(doc, 'p', { class: 'kp-chart__readout kp-sr-only', 'aria-live': 'polite' });
    const legend = h(doc, 'div', { class: 'kp-chart__legend', role: 'group' });
    const showAll = h(doc, 'button', { type: 'button', class: 'kp-chart__show-all', title: strings.showAllTitle }, strings.showAll);
    showAll.hidden = true;
    const pointer = h(doc, 'span', { 'data-kp-when': 'pointer' }, strings.hintPointer);
    const hint = h(doc, 'p', { class: 'kp-chart__hint' }, pointer, h(doc, 'span', { 'data-kp-when': 'touch' }, strings.hintTouch));
    // The key above the plot [kpadopt5-people]: the kinds of event the data holds, each a switch.
    const annKey = h(doc, 'div', { class: 'kp-chart__annkey', role: 'group' });
    annKey.hidden = true;
    const tipMedian = h(doc, 'p', { class: 'kp-chart__tip-median' });
    tipMedian.hidden = true;
    tip.append(tipMedian);
    /** Everything the chart adds to its host, in order. */
    const parts = [annKey, plot, tip, note, readout, legend, hint];
    return { plot, tipTime, release, pinWord, pin, tipRows, tipFoot, tipEvents, tip, note, readout, legend, showAll, hint, annKey, tipMedian, parts };
}
/** @typedef {ReturnType<typeof buildParts>} PlotParts */

export class PlotBase extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        const { group, locale, ctx } = /** @type {PlotSettings} */ (/** @type {unknown} */ (options));
        this.group = group;
        this.locale = locale;
        this.ctx = ctx;
        this.doc = host.ownerDocument;
        this.strings = ctx.strings;
        this.time = ctx.time;
        this.decorate = ctx.decorate;
        /** @type {ChartData} */
        this.data = DATA.get(host) ?? dataInMarkup(host) ?? { series: [] };
        /** @type {ChartPoint[][]} */
        this.points = [];
        this.fmt = valueFormat(locale, ctx, () => this.data);
        /** The sources the reader pressed; none is all shown. @type {Set<number>} */
        this.sel = new Set();
        /** The source the pointer or the focus is on. @type {number | null} */
        this.hot = null;
        /** @type {number | null} */
        this.pinned = null;
        /** @type {number | null} */
        this.cursor = null;
        /** @type {{ x0: number, x1: number } | null} */
        this.brush = null;
        this.clip = `kp-chart-clip-${++chartState.clipIds}`;
        /** The time axis of the last window drawn: a hover redraws, the window stays. */
        this.axisMemo = { key: '', axis: { stride: 0, ticks: /** @type {number[]} */ ([]) } };
        /** The state the plot shows instead of lines, and its words, as last drawn. */
        this.shown = '';
        /** The window ('from to') the plot was last drawn in; '' while it shows a state instead. */
        this.drawnWindow = '';
        /** What the plot was last drawn for: its width, its height and the host attributes that change the drawing. */
        this.drawnFor = '';
        /** Held back while off screen (see ChartOptions.lazy); true from the moment a draw was skipped until the next. */
        this.held = false;
        this.behind = false;
        /** The kinds the reader switched off. @type {Set<string>} */
        this.kindsOff = new Set();
        /** What the key was last built from, so a redraw keeps the focused switch. */
        this.keyMemo = '';
        /** The median of each shown source, as last drawn. @type {PlotMedian[]} */
        this.medians = [];
        /** @type {{ button: HTMLElement, value: HTMLElement }[]} */
        this.items = [];
        /** The legend row holds skeletons while the chart loads. */
        this.skeleton = false;
        /** Where the last drawing put things; null while the plot shows a state. @type {PlotGeometry | null} */
        this.geo = null;
        /** The parts the chart draws into, built detached: `PlotChart.connect()` puts them in the host. */
        this.ui = buildParts(this.doc, this.strings);
        /** What attachCharts() keeps for this chart (CHARTS) and its group holds; PlotChart builds it. @type {ChartState} */
        this.state = /** @type {ChartState} */ (/** @type {unknown} */ (null));
    }

    label() {
        return this.data.label ?? this.host.getAttribute('aria-label') ?? '';
    }

    key() {
        return this.data.key ?? this.host.getAttribute('data-kp-key') ?? undefined;
    }

    /** What a drawing is for: the plot's width, its height and the host attributes that change the drawing. */
    drawnKey() {
        const { host } = this;
        return `${this.ui.plot.clientWidth} ${chartHeight(host, this.data)} ${host.hasAttribute('data-kp-chart-loading')} ${host.getAttribute('data-kp-chart-sources')}`;
    }

    /** The indexes of the sources on view. */
    visible() {
        return this.points.map((_, i) => i).filter((i) => this.sel.size === 0 || this.sel.has(i));
    }

    /** @returns {ChartWindow | null} */
    range() {
        const { group, data, points } = this;
        if (group.zoom) return group.zoom;
        const first = Math.min(...points.map((p) => p[0]?.[0] ?? Infinity));
        const to = data.to ?? group.end() ?? Math.max(...points.map((p) => p[p.length - 1]?.[0] ?? -Infinity));
        let from = data.from ?? (group.span != null ? to - group.span : first);
        // One reading and no range: an hour up to it, so its dot is drawn.
        if (from === to && data.from == null) from = to - HOUR;
        return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null;
    }

    /** @param {Set<number>} next */
    setSel(next) {
        this.sel = next;
        this.host.dispatchEvent(new CustomEvent(CHART_SELECT_EVENT, { bubbles: true, detail: { on: [...this.sel].sort((a, b) => a - b) } }));
    }

    /** Mark the chart's own controls again (its key may have changed). */
    decorateOwn() {
        const { decorate, host } = this;
        decorateWith(decorate, this.ui.plot, { kind: 'plot', host, key: this.key() });
        decorateWith(decorate, this.ui.showAll, { kind: 'show-all', host, key: this.key() });
        decorateWith(decorate, this.ui.release, { kind: 'release', host, key: this.key() });
    }

    /** The tone an event is drawn in: its own, else its kind's, else info. @param {ChartEvent} ev */
    toneOf(ev) {
        return ev.tone ?? (ev.kind ? this.data.kinds?.[ev.kind]?.tone : undefined) ?? 'info';
    }

    /** The key item an event belongs to: its kind, else its tone. @param {ChartEvent} ev */
    kindOf(ev) {
        return ev.kind ?? this.toneOf(ev);
    }

    /** @param {string} kind */
    kindWord(kind) {
        return this.data.kinds?.[kind]?.label ?? (kind === 'info' || kind === 'warning' || kind === 'critical' ? this.strings.kindTone(kind) : kind);
    }

    /** The events the key has not switched off. */
    shownEvents() {
        return (this.data.events ?? []).filter((ev) => !this.kindsOff.has(this.kindOf(ev)));
    }

    /** Reads a chart option from the data, else from the element's attribute. @returns {PlotOptions} */
    option() {
        const { data, host } = this;
        const attr = (/** @type {string} */ name) => host.getAttribute(`data-kp-chart-${name}`);
        const medianAttr = attr('median');
        const median = data.median ?? (medianAttr !== null && medianAttr !== 'off');
        const min = Number(data.minPoints ?? attr('min-points'));
        const band = data.band ?? attr('band');
        return {
            median: median !== false,
            medianWords: typeof data.median === 'string' ? data.median : (attr('median-label') ?? ''),
            runs: (data.runs ?? attr('runs')) === 'mark',
            minPoints: Number.isFinite(min) && min > 0 ? Math.floor(min) : 0,
            minUnit: data.minUnit ?? attr('min-unit') ?? '',
            key: data.annotationKey ?? attr('annotation-key') !== 'off',
            band: band === 'hatch' ? 'hatch' : band === 'bracket' ? 'bracket' : 'tint',
        };
    }

    /** Whether the key's signature changed since the key was last built; remembers the new one. @param {string} signature */
    keyChanged(signature) {
        if (signature === this.keyMemo) return false;
        this.keyMemo = signature;
        return true;
    }

    /** Whether the plot shows something new instead of lines (said once, not on every redraw); remembers it. @param {string} shown */
    showsNew(shown) {
        if (shown === this.shown) return false;
        this.shown = shown;
        return true;
    }

    /** Show every source again. @returns {boolean} whether some were pressed */
    clearSelection() {
        const had = this.sel.size > 0;
        this.sel = new Set();
        return had;
    }

    /** The words in front of a median's value. @param {PlotOptions} opt */
    medianWords(opt) {
        return opt.medianWords || this.strings.median;
    }
}
