// The loading picture: busy bars and ghosts.
import { openBusyCard } from '../busy-card.js';
import { gantts, make } from './constants.js';
import { paint } from './paint.js';
import { tick } from './selection.js';
/** @typedef {import('./constants.js').GanttModel} GanttModel */

/**
 * While the timeline loads, the data table's own loading card stands centred over its lanes (Kenny, 2026-10-16:
 * "zoals bij een table waar het icoon in het midden van de matrix staat en lijkt te laden"): js/busy-card.js, the
 * layer and panel js/datatable.js drawOverlay() builds, so every theme dresses it as it dresses its busy table. The
 * toolbar, the axis and the lane names stay readable beside it; the frame keeps its height (the ghost lanes, or the
 * lanes it had). It arrives the theme's way, except on the first render, and leaves as the busy table's layer leaves;
 * the runs are drawn once it has gone. The sentence is still read out (`role="status"`), no longer drawn.
 * @param {GanttModel} c
 */
export function drawBusy(c) {
    const want = c.state === 'loading';
    if (want === (c.busy !== null)) {
        c.busy?.place();
        return;
    }
    const frameBox = /** @type {HTMLElement} */ (c.scroll.parentElement);
    if (!want) {
        const card = /** @type {import('../busy-card.js').BusyCard} */ (c.busy);
        c.busy = null;
        const gone = card.close();
        c.leaving = gone;
        void gone.then(() => {
            if (c.leaving !== gone) return;
            c.leaving = null;
            if (gantts.get(c.el) === c) {
                paint(c);
                tick(c);
            }
        });
        return;
    }
    // A timeline's card is laid on the whole component and covers what the held footprint holds under the toolbar: the frame, and the
    // legend and hint beneath it, which a frame as short as its ghost lanes would leave the card (100 px over a 260 px area at 390)
    // [hlcomp-1019 gantt-busy]. A dated line keeps the card in its frame.
    const laid = c.line ? frameBox : c.el;
    for (const old of laid.querySelectorAll(':scope > .kp-gantt__busy')) old.remove();
    c.leaving = null;
    c.busy = openBusyCard(laid, {
        words: c.strings.ganttLoading,
        area: () => {
            const hostFloor = () =>
                c.el.getBoundingClientRect().bottom - c.el.clientTop - (Number.parseFloat(getComputedStyle(c.el).paddingBottom) || 0);
            // A dated line is short: its card covers the whole frame, the line and its dates [kpadopt4].
            if (c.line) return [c.scroll];
            const tracks = /** @type {HTMLElement[]} */ ([...c.body.querySelectorAll(':scope > .kp-gantt__track')]);
            const scroll = c.scroll.getBoundingClientRect();
            const axis = c.axis.getBoundingClientRect();
            if (!tracks.length) return [];
            // The lanes in view, under the axis.
            const boxes = tracks.map((t) => t.getBoundingClientRect());
            return [
                {
                    // A dated line has its axis under the lane [kpadopt4].
                    // The whole frame, axis and lane names included: the card covers the data area the timeline holds [gaps-time-1019].
                    top: c.line ? Math.min(...boxes.map((b) => b.top)) : frameBox.getBoundingClientRect().top,
                    left: c.line ? Math.min(...boxes.map((b) => b.left)) : frameBox.getBoundingClientRect().left,
                    right: c.line ? Math.max(...boxes.map((b) => b.right)) : frameBox.getBoundingClientRect().right,
                    // The whole data area: down to the frame's foot, which a held footprint has grown past the ghost lanes [gaps-time-1019].
                    bottom: c.line
                        ? Math.min(axis.top, Math.max(...boxes.map((b) => b.bottom)))
                        : Math.max(scroll.bottom, frameBox.getBoundingClientRect().bottom - 1, hostFloor()),
                },
            ];
        },
        className: 'kp-gantt__busy',
        arrive: c.drawn,
    });
}
/** Ghost lanes while loading with no lanes yet. @param {GanttModel} c */
export function paintGhosts(c) {
    const doc = c.el.ownerDocument;
    // While the busy card leaves the ghosts stay: nothing of the runs is drawn under a card on its way out.
    const need = (c.state === 'loading' || c.leaving !== null) && c.lanes.length === 0;
    if (!need) {
        for (const g of c.ghosts.splice(0)) g.remove();
        return;
    }
    if (c.ghosts.length) return;
    const shapes = [
        [0.08, 0.2, 0.52, 0.12],
        [0.3, 0.28],
        [0.14, 0.1, 0.6],
        [0.4, 0.2],
        [0.05, 0.5],
        [0.25, 0.1],
    ];
    // `data-kp-gantt-ghosts="2 3 2 1 1"`: the rows of each ghost lane, so the loading frame is as tall as the lanes will be.
    const rows = (c.el.dataset.kpGanttGhosts ?? (c.line ? '1' : '1 1 1'))
        .split(/\s+/)
        .map((n) => Math.max(1, Math.min(6, Number.parseInt(n, 10) || 1)));
    rows.forEach((count, i) => {
        const bars = /** @type {number[]} */ (shapes[i % shapes.length]);
        const label = make(doc, 'div', 'kp-gantt__lane kp-gantt__ghost');
        label.setAttribute('aria-hidden', 'true');
        label.append(make(doc, 'span', 'kp-skeleton'));
        label.style.setProperty('grid-row', String(i + 2));
        const track = make(doc, 'div', 'kp-gantt__track kp-gantt__ghost');
        track.setAttribute('aria-hidden', 'true');
        track.style.setProperty('grid-row', String(i + 2));
        track.style.setProperty('--kp-g-rows', String(count));
        for (const [k, at] of bars.entries()) {
            const piece = make(doc, 'span', 'kp-gantt__run kp-skeleton');
            piece.style.setProperty('--kp-g-row', String(k % count));
            piece.style.setProperty('--kp-g-at', String(at));
            piece.style.setProperty('--kp-g-width', String(0.05 + ((i + k) % 3) * 0.05));
            track.append(piece);
        }
        c.body.insertBefore(label, c.plot);
        c.body.insertBefore(track, c.plot);
        c.ghosts.push(label, track);
    });
    c.body.style.setProperty('--kp-g-lanes', String(rows.length));
}
