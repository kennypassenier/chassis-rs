// The states of the day timeline [parts-1102], the package's own: loading lays the data table's busy card over the hours (a
// timeline loads with the busy card); empty and failed put the package's plate over the whole box, the failed one with Try again
// (`kp-dayline-retry`). An empty day lets a press and a drop through its plate, so an item from a list can still land on an hour.

import { openBusyCard } from '../busy-card.js';
import { hostStatePlate } from '../state-plate.js';
import { DAYLINE_RETRY_EVENT } from './constants.js';

/**
 * What the states draw on.
 * @typedef {object} StateParts
 * @property {HTMLElement} host
 * @property {HTMLElement} frame the positioned box the card and the plate stand in
 * @property {HTMLElement} scroll the hours, under the card or the plate
 * @property {HTMLElement} plate
 * @property {import('./constants.js').DaylineState} state
 * @property {string} words the plate's heading, when the page gave one
 * @property {string} text the plate's sentence, when the page gave one
 * @property {boolean} drawn whether the day has been drawn once (a first loading card is the page, not news)
 * @property {import('../busy-card.js').BusyCard | null} busy
 */

/** The plate for an empty or failed day, or none. @param {StateParts} c @param {boolean} empty whether a ready day holds nothing @param {import('../strings.js').Strings} s */
export function drawPlate(c, empty, s) {
    const shown = c.state === 'error' ? 'error' : c.state === 'empty' || (c.state === 'ready' && empty) ? 'empty' : null;
    c.plate.replaceChildren();
    c.plate.hidden = shown === null;
    c.plate.dataset.kpState = shown ?? '';
    c.scroll.toggleAttribute('inert', shown === 'error');
    if (!shown) return;
    const error = shown === 'error';
    c.plate.append(
        hostStatePlate(c.host, {
            kind: shown,
            title: c.words || (error ? s.daylineFailed : s.daylineEmpty),
            text: c.text || (error ? s.stateFailedText : s.daylineEmptyText),
            retryEvent: DAYLINE_RETRY_EVENT,
            retryLabel: s.daylineRetry,
        }),
    );
}

/** The loading card over the hours, the data table's own; it leaves the theme's way. @param {StateParts} c @param {import('../strings.js').Strings} s */
export function drawBusy(c, s) {
    const want = c.state === 'loading';
    c.scroll.toggleAttribute('aria-busy', want);
    if (want === (c.busy !== null)) return;
    if (!want) {
        const card = /** @type {import('../busy-card.js').BusyCard} */ (c.busy);
        c.busy = null;
        void card.close();
        return;
    }
    c.busy = openBusyCard(c.frame, { words: s.daylineLoading, area: () => [c.scroll], className: 'kp-dayline__busy', arrive: c.drawn });
}
