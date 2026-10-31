// Paints the window, the selection and the state.
import { hostStatePlate } from '../state-plate.js';
import { openBusyCard } from '../busy-card.js';
import { sequencerRows, sequencerTotalOf, sequencerWindow } from './timeline.js';
import { summary, words } from './instance.js';
import { EPS, SEQUENCER_RETRY_EVENT, SEQUENCER_ZOOM_MAX, SEQUENCER_ZOOM_MIN } from './constants.js';
import { measureLanes, paintLanes, place } from './lanes.js';
import { placeLabels, syncBars, syncJoins, syncTicks } from './bars.js';
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./instance.js').SequencerModel} SequencerModel */

/** The window, the zoom, the total, the line for now. @param {SequencerModel} c @param {SequencerItem[]} list @param {boolean} fit refit the window to the plan */
export function paintWindow(c, list, fit) {
    const total = sequencerTotalOf(list);
    if (fit) c.span = sequencerWindow(total, c.minSpan, c.step);
    c.body.style.setProperty('--kp-g-from', '0');
    c.body.style.setProperty('--kp-g-span', String(c.span));
    c.body.style.setProperty('--kp-tl-zoom', String(c.zoom));
    c.endLine.style.setProperty('--kp-g-t', String(total));
    c.endLine.hidden = total <= 0;
    c.total.textContent = list.length ? c.strings.sequencerTotal(words(c, total)) : '';
    c.zoomValue.textContent = c.strings.sequencerZoomValue(Math.round(c.zoom * 100));
    const [out, fitButton, zin] = /** @type {[HTMLButtonElement, HTMLButtonElement, HTMLButtonElement]} */ (c.zoomButtons);
    out.setAttribute('aria-disabled', String(c.zoom <= SEQUENCER_ZOOM_MIN + EPS));
    zin.setAttribute('aria-disabled', String(c.zoom >= SEQUENCER_ZOOM_MAX - EPS));
    fitButton.setAttribute('aria-disabled', String(c.zoom === 1));
    if (c.nowAt === null) c.nowLine.hidden = true;
    else {
        c.nowLine.hidden = false;
        c.body.style.setProperty('--kp-g-now', String(c.nowAt));
        c.nowLine.toggleAttribute('data-kp-out', c.nowAt < 0 || c.nowAt > c.span);
        c.nowLine.setAttribute('aria-label', c.strings.sequencerNow(words(c, c.nowAt)));
    }
}
/** The selection line and its buttons. @param {SequencerModel} c */
export function paintSelection(c) {
    const item = c.selected ? c.view.find((i) => i.id === c.selected) : undefined;
    const linking = c.linking ? c.view.find((i) => i.id === c.linking) : undefined;
    c.selectionText.textContent = linking ? c.strings.sequencerLinkStart(linking.label) : item ? summary(c, item) : c.strings.sequencerSelectedNone;
    const can = c.editable && Boolean(item) && !linking;
    c.linkButton.hidden = !can || c.view.length < 2;
    c.unlinkButton.hidden = !can || !item?.with;
    c.cancelButton.hidden = !linking;
    c.selection.dataset.kpMode = linking ? 'linking' : item ? 'selected' : 'none';
}
/** The state: loading card, plate. @param {SequencerModel} c */
function paintState(c) {
    const empty = c.state === 'ready' && c.items.length === 0;
    const plateKind = c.state === 'error' || c.state === 'empty' || empty ? (c.state === 'error' ? 'error' : 'empty') : null;
    c.el.dataset.kpState = empty ? 'empty' : c.state;
    c.el.setAttribute('aria-busy', String(c.state === 'loading'));
    const title = c.state === 'error' ? c.stateWords || c.strings.sequencerFailed : c.stateWords || c.strings.sequencerEmpty;
    const text = c.state === 'error' ? c.stateText : c.stateText || c.strings.sequencerEmptyText;
    const key = plateKind ? `${plateKind}|${title}|${text}` : '';
    if (key !== c.plateKey) {
        c.plateKey = key;
        c.plate.replaceChildren();
        if (plateKind)
            c.plate.append(
                hostStatePlate(c.el, {
                    kind: plateKind,
                    title,
                    ...(text ? { text } : {}),
                    art: c.stateArt,
                    retryEvent: SEQUENCER_RETRY_EVENT,
                }),
            );
    }
    c.plate.hidden = plateKind === null;
    c.plate.dataset.kpState = plateKind ?? '';
    const want = c.state === 'loading';
    if (want === (c.busy !== null)) {
        c.busy?.place();
        return;
    }
    if (!want) {
        const card = /** @type {import('../busy-card.js').BusyCard} */ (c.busy);
        c.busy = null;
        const gone = card.close();
        c.leaving = gone;
        c.el.toggleAttribute('data-kp-leaving', true);
        void gone.then(() => {
            if (c.leaving !== gone) return;
            c.leaving = null;
            c.el.removeAttribute('data-kp-leaving');
        });
        return;
    }
    for (const old of c.el.querySelectorAll(':scope > .kp-gantt__busy')) old.remove();
    c.leaving = null;
    c.el.removeAttribute('data-kp-leaving');
    c.busy = openBusyCard(c.el, {
        words: c.strings.sequencerLoading,
        area: () => [c.frame],
        className: 'kp-gantt__busy',
        arrive: c.drawn,
    });
}
/** Draw everything from the committed items. @param {SequencerModel} c @param {{ fit?: boolean }} [how] */
export function paint(c, { fit = true } = {}) {
    c.view = c.items;
    c.rows = sequencerRows(
        c.items,
        c.lanes.map((l) => l.id),
    );
    paintLanes(c);
    paintState(c);
    measureLanes(c);
    paintWindow(c, c.view, fit);
    syncTicks(c);
    syncBars(c, c.view);
    for (const item of c.view) {
        const bar = c.bars.get(item.id);
        if (bar) place(c, bar, item, c.rows.rows.get(item.id) ?? 0);
    }
    syncJoins(c, c.view);
    placeLabels(c);
    paintSelection(c);
    c.drawn = true;
}
