// Builds the timeline's markup: the frame, its bar and lanes.
import { clock, duration, rangeSeconds, stamp, stateWord } from './scale.js';
import { restEnd, windowOf } from './window.js';
import { keyOf, make } from './constants.js';
/** @typedef {import('./constants.js').GanttBar} GanttBar */
/** @typedef {import('./constants.js').GanttModel} GanttModel */

let idSeq = 0;
/** The words of a bar's name and card. @param {GanttModel} c @param {GanttBar} b */
export function wordsOf(c, b) {
    const { run } = b;
    const nowMs = c.now();
    const startMs = b.s * 1000 + c.base * 1000;
    const endMs = b.e == null ? nowMs : b.e * 1000 + c.base * 1000;
    const state = stateWord(c, run.state);
    const length = duration(c, (endMs - startMs) / 1000);
    const when =
        run.state === 'queued'
            ? `${stamp(c, startMs)}, ${length}`
            : run.state === 'running'
              ? `${stamp(c, startMs)}, ${length}`
              : `${stamp(c, startMs)} – ${clock(c, endMs)}, ${length}`;
    const planned = restEnd(c, run);
    const until =
        planned !== null && planned * 1000 + c.base * 1000 > nowMs ? c.strings.ganttPlannedUntil(clock(c, planned * 1000 + c.base * 1000)) : '';
    return { name: c.strings.ganttBar(run.label, when, state), card: [run.label, when, state, until, run.detail ?? ''].filter(Boolean).join(' · ') };
}
/** Build the chrome once. @param {GanttModel} c */
export function build(c) {
    const doc = c.el.ownerDocument;
    const s = c.strings;
    const bar = make(doc, 'div', 'kp-gantt__bar');
    c.ranges = make(doc, 'div', 'kp-segmented kp-gantt__ranges');
    c.ranges.setAttribute('data-kp-segmented', 'single');
    c.ranges.setAttribute('role', 'radiogroup');
    c.ranges.setAttribute('aria-label', s.ganttRange);
    const words = (c.el.dataset.kpGanttRanges ?? (c.line ? 'all' : '1h 6h 24h 7d'))
        .split(/[\s,]+/)
        .filter((w) => w === 'all' || Number.isFinite(rangeSeconds(w)));
    const wanted = c.el.dataset.kpGanttRange ?? (c.line ? 'all' : (words[Math.min(1, words.length - 1)] ?? '6h'));
    for (const word of words) {
        const item = make(doc, 'button', 'kp-segmented__item');
        item.type = 'button';
        item.dataset.value = word;
        item.setAttribute('role', 'radio');
        item.setAttribute('aria-checked', String(word === wanted));
        item.title = word === 'all' ? s.ganttAllTitle : s.ganttRangeTitle(word);
        item.append(make(doc, 'span', 'kp-segmented__label', word === 'all' ? s.ganttAll : word));
        c.ranges.append(item);
    }
    // `all` fits the window to what the timeline holds [kpadopt4].
    c.fit = wanted === 'all';
    if (c.fit) c.live = false;
    c.span = rangeSeconds(wanted) || 21_600;
    c.liveButton = make(doc, 'button', 'kp-button kp-button--sm kp-gantt__live', s.ganttLive);
    c.liveButton.type = 'button';
    c.liveButton.setAttribute('aria-pressed', 'true');
    c.liveButton.title = s.ganttLiveTitle;
    c.selection = make(doc, 'div', 'kp-gantt__selection');
    c.selection.setAttribute('role', 'group');
    c.selection.setAttribute('aria-label', s.ganttSelection);
    c.selectionText = make(doc, 'span', 'kp-gantt__selected');
    const zoom = make(doc, 'button', 'kp-button kp-button--sm', s.ganttZoom);
    zoom.type = 'button';
    zoom.title = s.ganttZoomTitle;
    zoom.dataset.kpGanttZoom = '';
    const clear = make(doc, 'button', 'kp-button kp-button--sm', s.ganttClear);
    clear.type = 'button';
    clear.title = s.ganttClearTitle;
    clear.dataset.kpGanttClear = '';
    c.selection.append(c.selectionText, zoom, clear);
    // The chip sits in the toolbar row, over the range buttons and Live while a range is selected: it lies on no data and
    // adds no height when it comes.
    bar.append(c.ranges, c.liveButton, c.selection);
    c.decorate?.(c.liveButton, { kind: 'live', host: c.el, key: keyOf(c.el) });
    c.decorate?.(zoom, { kind: 'zoom', host: c.el, key: keyOf(c.el) });
    c.decorate?.(clear, { kind: 'clear', host: c.el, key: keyOf(c.el) });

    c.scroll = make(doc, 'div', 'kp-gantt__scroll');
    c.body = make(doc, 'div', 'kp-gantt__body');
    c.body.setAttribute('role', 'group');
    if (!c.el.hasAttribute('aria-label') && !c.el.hasAttribute('aria-labelledby')) c.body.setAttribute('aria-label', s.ganttGroup);
    const corner = make(doc, 'div', 'kp-gantt__corner');
    c.axis = make(doc, 'div', 'kp-gantt__axis');
    // With day buttons the axis holds controls; its other labels are hidden one by one (syncTicks).
    if (!c.days) c.axis.setAttribute('aria-hidden', 'true');
    c.plot = make(doc, 'div', 'kp-gantt__plot');
    c.lines = make(doc, 'div', 'kp-gantt__lines');
    c.lines.setAttribute('aria-hidden', 'true');
    c.nowLine = make(doc, 'div', 'kp-gantt__now');
    c.nowLine.setAttribute('role', 'separator');
    c.selectBox = make(doc, 'div', 'kp-gantt__select');
    c.selectBox.hidden = true;
    c.brushBox = make(doc, 'div', 'kp-gantt__brush');
    c.brushBox.hidden = true;
    c.plot.append(c.selectBox, c.nowLine, c.brushBox);
    // The rules sit under the lanes' bars, the line for now and the brush over them.
    c.body.append(corner, c.axis, c.lines, c.plot);
    c.scroll.append(c.body);
    c.stateLine = make(doc, 'p', 'kp-gantt__state');
    c.stateLine.setAttribute('role', 'status');
    c.announcer = make(doc, 'p', 'kp-gantt__announce');
    c.announcer.setAttribute('role', 'status');
    const frame = make(doc, 'div', 'kp-gantt__frame');
    c.selection.hidden = true;
    // Empty and failed are the package's state plate over the plot, not a sentence; the line keeps only the loading words for a
    // screen reader (the busy card is drawn) [state-plates-1019].
    c.plate = make(doc, 'div', 'kp-gantt__plate');
    c.plate.hidden = true;
    frame.append(c.scroll, c.stateLine, c.plate);
    const hint = make(doc, 'p', 'kp-gantt__hint', c.el.hasAttribute('data-kp-gantt-points') ? s.ganttPointsHint : s.ganttHint);
    const legend = make(doc, 'ul', 'kp-gantt__legend');
    c.legend = legend;
    for (const state of /** @type {const} */ (['ok', 'failed', 'running', 'queued', 'planned'])) {
        const li = make(doc, 'li', 'kp-gantt__legend-state');
        const swatch = make(doc, 'span', 'kp-gantt__swatch');
        swatch.dataset.kpState = state;
        swatch.setAttribute('aria-hidden', 'true');
        li.append(swatch, make(doc, 'span', '', stateWord(c, state)));
        legend.append(li);
    }
    c.el.replaceChildren(bar, frame, legend, hint, c.announcer);
    c.el.dataset.kpGanttId = String((idSeq += 1));
}
/** Move the window (custom properties only); tick labels follow when the set changes. @param {GanttModel} c */
export function frame(c) {
    const w = windowOf(c);
    const st = c.body.style;
    st.setProperty('--kp-g-from', w.from.toFixed(2));
    st.setProperty('--kp-g-span', String(c.span));
    st.setProperty('--kp-g-now', w.now.toFixed(2));
    // The line for now sits outside a fixed window that has not reached it.
    c.nowLine.toggleAttribute('data-kp-out', w.now < w.from || w.now > w.end);
    c.nowLine.setAttribute('aria-label', `${c.strings.ganttNow}, ${clock(c, c.now())}`);
    return w;
}
