// Builds the sequencer's markup.
import { make } from './instance.js';
/** @typedef {import('./instance.js').SequencerModel} SequencerModel */
/** @typedef {import('./units.js').Strings} Strings */

let idSeq = 0;
/** Build the parts once. @param {HTMLElement} el @param {Strings} strings @returns {SequencerModel} */
export function build(el, strings) {
    const doc = el.ownerDocument;
    const id = `kp-sequencer-${(idSeq += 1)}`;
    const bar = make(doc, 'div', 'kp-gantt__bar kp-sequencer__bar');
    const zoomGroup = make(doc, 'div', 'kp-sequencer__zoom');
    zoomGroup.setAttribute('role', 'group');
    zoomGroup.setAttribute('aria-label', strings.sequencerZoomLabel);
    /** @param {string} key @param {string} text */
    const zoomButton = (key, text) => {
        const b = make(doc, 'button', 'kp-button kp-button--sm', text);
        b.type = 'button';
        b.dataset.kpSequencerZoom = key;
        return b;
    };
    const zoomButtons = [
        zoomButton('out', strings.sequencerZoomOut),
        zoomButton('fit', strings.sequencerZoomFit),
        zoomButton('in', strings.sequencerZoomIn),
    ];
    const zoomValue = make(doc, 'span', 'kp-sequencer__zoomvalue');
    zoomValue.setAttribute('aria-hidden', 'true');
    zoomGroup.append(...zoomButtons, zoomValue);
    const total = make(doc, 'p', 'kp-sequencer__total');
    bar.append(zoomGroup, total);

    const scroll = make(doc, 'div', 'kp-gantt__scroll kp-sequencer__scroll');
    const body = make(doc, 'div', 'kp-gantt__body kp-sequencer__body');
    body.setAttribute('role', 'group');
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) body.setAttribute('aria-label', strings.sequencerLabel);
    const corner = make(doc, 'div', 'kp-gantt__corner');
    const axis = make(doc, 'div', 'kp-gantt__axis');
    axis.setAttribute('aria-hidden', 'true');
    const lines = make(doc, 'div', 'kp-gantt__lines kp-sequencer__lines');
    lines.setAttribute('aria-hidden', 'true');
    const layer = make(doc, 'div', 'kp-sequencer__items');
    const plot = make(doc, 'div', 'kp-gantt__plot kp-sequencer__plot');
    const nowLine = make(doc, 'div', 'kp-gantt__now');
    nowLine.setAttribute('role', 'separator');
    nowLine.hidden = true;
    const endLine = make(doc, 'div', 'kp-sequencer__end');
    endLine.setAttribute('aria-hidden', 'true');
    const guide = make(doc, 'div', 'kp-sequencer__guide');
    guide.setAttribute('aria-hidden', 'true');
    guide.hidden = true;
    const readout = make(doc, 'p', 'kp-sequencer__readout');
    readout.setAttribute('aria-hidden', 'true');
    readout.hidden = true;
    plot.append(endLine, nowLine, guide, readout);
    body.append(corner, axis, lines, layer, plot);
    scroll.append(body);
    const plate = make(doc, 'div', 'kp-gantt__plate');
    plate.hidden = true;
    const frame = make(doc, 'div', 'kp-gantt__frame');
    frame.append(scroll, plate);

    const selection = make(doc, 'div', 'kp-sequencer__selection');
    selection.setAttribute('role', 'group');
    const selectionText = make(doc, 'p', 'kp-sequencer__selected');
    const actions = make(doc, 'div', 'kp-sequencer__actions');
    /** @param {string} key @param {string} text */
    const action = (key, text) => {
        const b = make(doc, 'button', 'kp-button kp-button--sm', text);
        b.type = 'button';
        b.dataset.kpSequencerAction = key;
        return b;
    };
    const linkButton = action('link', strings.sequencerLinkButton);
    const unlinkButton = action('unlink', strings.sequencerUnlinkButton);
    const cancelButton = action('cancel', strings.sequencerLinkCancel);
    actions.append(linkButton, unlinkButton, cancelButton);
    selection.append(selectionText, actions);

    const hint = make(doc, 'p', 'kp-gantt__hint kp-sequencer__hint');
    const help = make(doc, 'p', 'kp-gantt__announce', strings.sequencerItemHelp);
    help.id = `${id}-help`;
    const announcer = make(doc, 'p', 'kp-gantt__announce');
    announcer.setAttribute('role', 'status');
    const measure = make(doc, 'span', 'kp-gantt__label kp-sequencer__measure');
    measure.setAttribute('aria-hidden', 'true');
    const ruler = make(doc, 'span', 'kp-gantt__label kp-sequencer__measure kp-sequencer__ruler');
    ruler.setAttribute('aria-hidden', 'true');
    const probe = make(doc, 'span', 'kp-sequencer__probe');
    probe.setAttribute('aria-hidden', 'true');
    layer.append(measure, ruler, probe);
    el.replaceChildren(bar, frame, selection, hint, help, announcer);
    el.dataset.kpSequencerId = id;
    return {
        el,
        strings,
        id,
        bar,
        zoomGroup,
        zoomButtons,
        zoomValue,
        total,
        frame,
        scroll,
        body,
        axis,
        lines,
        layer,
        plot,
        nowLine,
        endLine,
        guide,
        readout,
        plate,
        selection,
        selectionText,
        linkButton,
        unlinkButton,
        cancelButton,
        hint,
        help,
        announcer,
        measure,
        ruler,
        probe,
        rowPx: 28,
        padPx: 4,
        unit: { name: 'minute', seconds: 60 },
        step: 1,
        overlap: 'refuse',
        edges: true,
        laneMove: true,
        editable: true,
        minSpan: 0,
        items: [],
        view: [],
        lanes: [],
        rows: { rows: new Map(), counts: new Map() },
        span: 60,
        zoom: 1,
        nowAt: null,
        state: 'ready',
        stateWords: '',
        stateText: '',
        stateArt: null,
        plateKey: '',
        laneKey: '',
        tickKey: '',
        laneEls: [],
        laneTops: [],
        bars: new Map(),
        outsides: new Map(),
        joins: new Map(),
        selected: null,
        focusId: null,
        linking: null,
        kb: null,
        press: null,
        pending: null,
        busy: null,
        leaving: null,
        touches: new Map(),
        pinch: null,
        scrollTimer: 0,
        frameTimer: 0,
        drawn: false,
        observer: null,
    };
}
