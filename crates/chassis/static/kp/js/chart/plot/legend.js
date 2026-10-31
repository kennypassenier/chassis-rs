// The legend of a full chart: its source keys, the key of event kinds above the plot, and the loading skeleton.
import { decorateWith, h } from '../dom.js';
import { paintSeries } from '../attach.js';
import { toggleSource } from '../selection.js';
import { PlotBase } from './base.js';
/** @typedef {import('./base.js').PlotOptions} PlotOptions */

/** The most source stubs a loading legend shows, and the figure spaces that give a stub its width. */
const MAX_STUBS = 50;
const STUB_WIDTH = 12;

export class PlotLegend extends PlotBase {
    /** The legend's own listeners: Show all, Escape in the legend, and the pin's ✕. */
    wireLegend() {
        const { showAll, legend, release, plot } = this.ui;
        this.listen(showAll, 'click', () => {
            this.setSel(new Set());
            this.draw();
        });
        this.listen(legend, 'keydown', (event) => {
            if (/** @type {KeyboardEvent} */ (event).key !== 'Escape' || this.sel.size === 0) return;
            event.stopPropagation();
            this.setSel(new Set());
            this.draw();
        });
        this.listen(release, 'click', () => {
            this.pinned = null;
            this.draw();
            plot.focus();
        });
    }

    /** Draw the chart: PlotDraw does it; the legend has none of its own. */
    draw() {}

    /** The kinds of event the data holds, with their tone and count. */
    countKinds() {
        /** @type {Map<string, { tone: string, count: number }>} */
        const kinds = new Map();
        for (const ev of this.data.events ?? []) {
            const k = this.kindOf(ev);
            const was = kinds.get(k);
            if (was) was.count += 1;
            else kinds.set(k, { tone: this.toneOf(ev), count: 1 });
        }
        return kinds;
    }

    /** Build (or update) the key above the plot: one switch per kind, and a note for the median and the runs. @param {PlotOptions} opt */
    paintKey(opt) {
        const { annKey } = this.ui;
        const kinds = this.countKinds();
        const notes = [opt.median && this.medians.length === 1 ? 'median' : '', opt.median && opt.runs ? 'runs' : ''].filter(Boolean);
        const wanted = opt.key && (kinds.size > 0 || notes.length > 0);
        annKey.hidden = !wanted;
        annKey.removeAttribute('data-kp-wait');
        if (!wanted) {
            this.keyMemo = '';
            annKey.replaceChildren();
            return;
        }
        annKey.setAttribute('aria-label', this.strings.keyLabel);
        const signature = JSON.stringify([...kinds].map(([k, v]) => [k, v.tone, v.count, this.kindWord(k)]).concat(notes.map((n) => [n])));
        if (this.keyChanged(signature)) this.rebuildKey(kinds, notes);
        for (const button of annKey.querySelectorAll('[data-kp-kind]')) {
            const off = this.kindsOff.has(button.getAttribute('data-kp-kind') ?? '');
            button.setAttribute('aria-pressed', String(!off));
            button.toggleAttribute('data-kp-off', off);
        }
        const note = annKey.querySelector('[data-kp-note="median"]');
        if (note && this.medians.length === 1) {
            const words = note.querySelector('.kp-chart__annkey-median');
            if (words) words.textContent = `${this.medianWords(opt)} ${this.fmt(this.medians[0].v, 'tip')}`;
        }
    }

    /**
     * Put the key's switches and notes in again, keeping the focus on the switch that had it.
     * @param {Map<string, { tone: string, count: number }>} kinds
     * @param {string[]} notes
     */
    rebuildKey(kinds, notes) {
        const { annKey } = this.ui;
        const active = this.doc.activeElement;
        const focused = active instanceof HTMLElement && annKey.contains(active) ? active.getAttribute('data-kp-kind') : null;
        const items = [...kinds].map(([k, v]) => this.keyButton(k, v.tone, v.count));
        annKey.replaceChildren(...items, ...notes.map((n) => this.keyNote(n)));
        if (focused) /** @type {HTMLElement | null} */ (annKey.querySelector(`[data-kp-kind="${CSS.escape(focused)}"]`))?.focus();
    }

    /** One switch of the key: its kind on or off. @param {string} k @param {string} tone @param {number} count */
    keyButton(k, tone, count) {
        const { doc, strings, kindsOff } = this;
        const dot = h(doc, 'i', { class: 'kp-chart__dot', 'data-kp-tone': tone, 'aria-hidden': 'true' });
        const button = h(
            doc,
            'button',
            { type: 'button', class: 'kp-chart__annkey-item', 'data-kp-kind': k, title: strings.kindOn(this.kindWord(k)) },
            dot,
            h(doc, 'span', {}, this.kindWord(k)),
            h(doc, 'b', { class: 'kp-chart__annkey-count' }, String(count)),
        );
        // The switch is replaced with its listener when the key is built again.
        button.addEventListener('click', () => {
            if (kindsOff.has(k)) kindsOff.delete(k);
            else kindsOff.add(k);
            this.host.dispatchEvent(new CustomEvent('kp-chart-kinds', { bubbles: true, detail: { off: [...kindsOff] } }));
            this.draw();
        });
        return button;
    }

    /** One note of the key: the median line or the runs' ring. @param {string} n */
    keyNote(n) {
        const { doc } = this;
        if (n === 'median')
            return h(
                doc,
                'span',
                { class: 'kp-chart__annkey-note', 'data-kp-note': 'median' },
                h(doc, 'i', { class: 'kp-chart__annkey-line', 'aria-hidden': 'true' }),
                h(doc, 'span', { class: 'kp-chart__annkey-median' }),
            );
        return h(
            doc,
            'span',
            { class: 'kp-chart__annkey-note', 'data-kp-note': 'runs' },
            h(doc, 'i', { class: 'kp-chart__annkey-ring', 'aria-hidden': 'true' }),
            this.strings.runsKey,
        );
    }

    buildLegend() {
        const { legend, plot, showAll } = this.ui;
        this.skeleton = false;
        legend.removeAttribute('aria-hidden');
        legend.setAttribute('aria-label', this.strings.sources(this.label()));
        plot.setAttribute('aria-label', this.strings.plot(this.label()));
        this.items = this.data.series.map((series, i) => this.sourceButton(series, i));
        legend.replaceChildren(...this.items.map((it) => it.button), showAll);
    }

    /**
     * One source of the legend: a button that isolates it while pointed at or focused, and presses it on a click.
     * @param {import('../words.js').ChartSeries} series
     * @param {number} i
     */
    sourceButton(series, i) {
        const { doc, strings } = this;
        const swatch = h(doc, 'i', { class: 'kp-chart__swatch', 'aria-hidden': 'true' });
        const value = h(doc, 'b', { class: 'kp-chart__value' });
        const label = h(doc, 'span', { class: 'kp-chart__source-label' }, series.label);
        const button = h(doc, 'button', { type: 'button', class: 'kp-chart__source', title: strings.source(series.label) }, swatch, label, value);
        paintSeries(button, series, i);
        const isolate = (/** @type {number | null} */ v) => () => {
            this.hot = v;
            this.draw();
        };
        // The buttons are replaced with their listeners when the legend is built again.
        button.addEventListener('pointerenter', isolate(i));
        button.addEventListener('pointerleave', isolate(null));
        button.addEventListener('focus', isolate(i));
        button.addEventListener('blur', isolate(null));
        button.addEventListener('click', () => {
            this.setSel(toggleSource(this.sel, i, this.data.series.length));
            this.draw();
        });
        decorateWith(this.decorate, button, { kind: 'source', host: this.host, key: this.key(), index: i, label: series.label });
        return { button, value };
    }

    /** The legend row kept for `data-kp-chart-sources` sources while loading. */
    skeletonLegend() {
        const { legend } = this.ui;
        const n = Number(this.host.getAttribute('data-kp-chart-sources'));
        this.skeleton = true;
        this.items = [];
        legend.setAttribute('aria-hidden', 'true');
        legend.replaceChildren(
            ...Array.from({ length: n > 1 ? Math.min(n, MAX_STUBS) : 0 }, () => {
                const stub = h(this.doc, 'span', { class: 'kp-chart__source-stub kp-skeleton kp-skeleton--block' }, ' '.repeat(STUB_WIDTH));
                // A source button's height, not a block skeleton's.
                stub.style.setProperty('--kp-skeleton-block', 'auto');
                return stub;
            }),
        );
        legend.hidden = !(n > 1);
    }
}
