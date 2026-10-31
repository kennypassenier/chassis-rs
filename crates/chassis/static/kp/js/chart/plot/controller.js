// PlotChart: one full chart, wired. The top of the class chain (see base.js): it puts the parts in the host, wires them, watches
// the attributes a page sets, and hands out the chart's state object; `destroy()` takes it all away.
import { nextSelection, pointsOf } from '../selection.js';
import { PlotPointer } from './pointer.js';
/** @typedef {import('../words.js').ChartData} ChartData */
/** @typedef {import('../api.js').ChartState} ChartState */

export class PlotChart extends PlotPointer {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        this.state = this.makeState();
    }

    connect() {
        const { host, group, ui } = this;
        host.classList.add('kp-chart');
        host.append(...ui.parts);
        // Registered first, so it runs last: the parts and the class go after the watch and the group's owner.
        this.own(() => {
            for (const part of ui.parts) part.remove();
            host.classList.remove('kp-chart');
        });
        this.wireLegend();
        this.wirePointer();
        this.own(() => {
            if (group.owner === this.state) group.owner = null;
        });
        this.watchAttributes();
        if (this.data.key != null) host.setAttribute('data-kp-key', this.data.key);
        this.points = this.data.series.map(pointsOf);
        this.buildLegend();
        this.decorateOwn();
    }

    /**
     * A page that sets or clears `data-kp-chart-loading` itself (the feed removes `data-kp-chart-loading` just before it draws,
     * which this watch need not draw again).
     */
    watchAttributes() {
        const { host } = this;
        const watch = this.observe(
            new (this.doc.defaultView ?? globalThis).MutationObserver(() => {
                const asked = `${host.hasAttribute('data-kp-chart-loading')} ${host.getAttribute('data-kp-chart-sources')}`;
                if (!this.drawnFor.endsWith(asked)) this.draw();
            }),
        );
        watch.observe(host, { attributes: true, attributeFilter: ['data-kp-chart-loading', 'data-kp-chart-sources'] });
    }

    /** @param {ChartData} next */
    setData(next) {
        const { host, data, ui, strings } = this;
        const sameSources = next.series.length === data.series.length && next.series.every((sr, i) => sr.label === data.series[i].label);
        const keyBefore = this.key();
        this.data = next;
        if (next.key != null) host.setAttribute('data-kp-key', next.key);
        this.points = next.series.map(pointsOf);
        if (!sameSources) {
            const had = this.clearSelection();
            this.hot = null;
            this.buildLegend();
            if (had) this.setSel(this.sel);
        } else {
            ui.legend.setAttribute('aria-label', strings.sources(this.label()));
            ui.plot.setAttribute('aria-label', strings.plot(this.label()));
        }
        if (this.key() !== keyBefore) this.decorateOwn();
        // The group's window follows its newest point: this chart draws, and a neighbour only when that window moved under it
        // (a feed to sixteen charts of a group no longer draws every chart sixteen times).
        this.draw();
        for (const c of this.group.charts) if (c !== this.state && (!c.stale || c.stale())) c.draw();
    }

    /** Whether the last drawing no longer fits the group's window (a neighbour's new data moved it). */
    stale() {
        if (!this.drawnWindow) return false;
        const win = this.range();
        return !win || `${win.from} ${win.to}` !== this.drawnWindow;
    }

    /** The newest reading's time over every source, or null without readings. */
    lastTime() {
        const last = this.points.map((p) => p[p.length - 1]?.[0] ?? -Infinity);
        const max = Math.max(-Infinity, ...last);
        return Number.isFinite(max) ? max : null;
    }

    /** What attachCharts() keeps for this chart and its group holds. @returns {ChartState} */
    makeState() {
        return {
            host: this.host,
            spark: false,
            group: this.group,
            draw: () => this.draw(),
            view: (inView) => {
                this.held = !inView;
                if (inView && this.behind) this.draw();
            },
            resize: () => {
                if (this.drawnKey() !== this.drawnFor) this.draw();
            },
            stale: () => this.stale(),
            setData: (next) => this.setData(next),
            select: (i, on) => {
                const next = nextSelection(this.sel, i, this.data.series.length, on);
                if (!next) return false;
                this.setSel(next);
                this.draw();
                return true;
            },
            cursorAt: (t, own) => {
                this.cursor = t;
                if (!own && t == null) this.hot = null;
                this.draw();
            },
            lastTime: () => this.lastTime(),
            destroy: () => this.destroy(),
            unobserve: () => {},
        };
    }
}
