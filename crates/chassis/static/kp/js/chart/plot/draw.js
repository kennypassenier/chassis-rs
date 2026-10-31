// Draws the chart: the state plate (loading, empty, failed) or a drawing of its window, then the key, the legend and the tooltip.
import { h, keepEndsInside } from '../dom.js';
import { CHART_RETRY_EVENT } from '../constants.js';
import { statePlate } from '../../state-plate.js';
import { chartHeight } from '../attach.js';
import { PlotDrawing } from './drawing.js';
import { PlotTip } from './tip.js';
/** @typedef {import('../words.js').ChartWindow} ChartWindow */

export class PlotDraw extends PlotTip {
    draw() {
        const { host, data, ui } = this;
        const H = chartHeight(host, data);
        this.drawnWindow = '';
        this.drawnFor = this.drawnKey();
        const loading = host.hasAttribute('data-kp-chart-loading');
        ui.plot.setAttribute('aria-busy', String(loading));
        if (loading) {
            this.skeletonLegend();
            return this.drawState('loading', H);
        }
        if (this.skeleton) this.buildLegend();
        ui.legend.hidden = data.series.length <= 1;
        if (data.error) return this.drawState('error', H);
        const win = this.range();
        if (!win || this.points.every((p) => p.length === 0)) return this.drawState('empty', H);
        if (this.held) {
            // Off screen: the plot keeps its footprint (the loading plate) and is drawn as it comes into view.
            this.behind = true;
            if (!this.geo && this.shown === '') this.drawState('loading', H);
            return;
        }
        this.drawWindow(win, H);
    }

    /**
     * The plot at its height with no lines: loading (a pulse), empty or an error (a sentence), so the card keeps its place in every
     * state.
     * @param {'loading' | 'empty' | 'error'} kind
     * @param {number} H
     */
    drawState(kind, H) {
        const { host, ui, doc, strings } = this;
        this.geo = null;
        // The state on the host too, so js/footprint.js holds the loaded height while it shows.
        host.setAttribute('data-kp-state', kind);
        // A key already drawn keeps its room (unseen), so the chart's height is the same in every state.
        if (this.keyMemo) ui.annKey.setAttribute('data-kp-wait', '');
        else ui.annKey.hidden = true;
        ui.tip.hidden = true;
        ui.note.hidden = true;
        ui.hint.hidden = true;
        const box = h(doc, 'div', {
            class: kind === 'loading' ? 'kp-chart__state kp-skeleton kp-skeleton--block' : 'kp-chart__state',
            'data-kp-state': kind,
        });
        // The plot's own height, borders and padding inside it.
        box.style.boxSizing = 'border-box';
        box.style.blockSize = `${H}px`;
        const words = kind === 'loading' ? strings.loading : kind === 'error' ? (this.data.error ?? '') : strings.empty;
        if (kind === 'loading') box.append(h(doc, 'span', { class: 'kp-sr-only' }, words));
        else if (kind === 'error') box.append(this.failedPlate(words));
        else box.append(h(doc, 'div', { class: 'kp-chart__state-text' }, words));
        ui.plot.replaceChildren(box);
        // Said once, not on every redraw.
        if (this.showsNew(`${kind} ${words}`) && kind !== 'loading') ui.readout.textContent = `${this.label()}: ${words}`;
    }

    /**
     * The failed plate is the package's own (`statePlate`: the destructive alert every other failed area uses, so each register
     * dresses it): what failed, and a normal Retry under it (`kp-chart-retry`). The button goes with the state, so the focus moves to
     * the plot first, as a card's Try again hands it to its stage.
     * @param {string} words
     */
    failedPlate(words) {
        return statePlate(this.doc, {
            kind: 'error',
            title: words,
            actionLabel: this.strings.retry,
            onAction: () => {
                this.ui.plot.focus({ preventScroll: true });
                this.host.dispatchEvent(new CustomEvent(CHART_RETRY_EVENT, { bubbles: true }));
            },
        });
    }

    /** Draw the window with its readings, then the key, the plot's name, and the legend and tooltip (or the too-few plate). @param {ChartWindow} win @param {number} H */
    drawWindow(win, H) {
        const { host, ui, data, strings } = this;
        this.behind = false;
        this.shown = '';
        host.setAttribute('data-kp-state', 'ready');
        ui.hint.hidden = data.series.length <= 1;
        this.drawnWindow = `${win.from} ${win.to}`;
        const drawing = new PlotDrawing(this, win, H);
        drawing.build();
        this.medians = drawing.medians;
        ui.plot.replaceChildren(drawing.svg);
        keepEndsInside(drawing.axisLabels, drawing.W);
        this.geo = drawing.geometry();
        const { opt } = drawing;
        this.paintKey(opt);
        const aria = [strings.plot(this.label())];
        for (const m of this.medians) aria.push(`${this.medianWords(opt)} ${this.medians.length > 1 ? `${m.label} ` : ''}${this.fmt(m.v, 'readout')}`);
        if (drawing.beforeCount) aria.push(strings.edgeBefore(drawing.beforeCount));
        if (drawing.afterCount) aria.push(strings.edgeAfter(drawing.afterCount));
        ui.plot.setAttribute('aria-label', aria.join(', '));
        if (drawing.few) return this.drawFew(drawing);
        const withPoints = drawing.vis.filter((si) => this.points[si].length > 0);
        ui.note.hidden = !(data.onePointNote && withPoints.length > 0 && withPoints.every((si) => this.points[si].length === 1));
        this.paintLegend();
        this.paintTip();
    }

    /**
     * Too early for a trend: the empty plot, faint, and the sentence on an opaque plate in the middle of its whole height. The plate
     * stands on an opaque ground of the card's colour, so a theme that draws its empty plate as a see-through texture keeps that
     * texture and still lets nothing of the plot show through (Kenny, 2026-10-18 17:45).
     * @param {PlotDrawing} drawing
     */
    drawFew(drawing) {
        const { ui, doc, strings } = this;
        const words = strings.few(drawing.have, drawing.opt.minPoints, drawing.opt.minUnit || strings.fewUnit);
        drawing.svg.setAttribute('data-kp-faint', '');
        this.geo = null;
        ui.tip.hidden = true;
        ui.hint.hidden = true;
        ui.note.hidden = true;
        const plate = h(doc, 'p', { class: 'kp-empty kp-chart__few-plate', role: 'status' }, words);
        ui.plot.append(h(doc, 'div', { class: 'kp-chart__few' }, h(doc, 'div', { class: 'kp-chart__few-ground' }, plate)));
        if (this.showsNew(`few ${words}`)) ui.readout.textContent = `${this.label()}: ${words}`;
        this.paintLegend();
    }
}
