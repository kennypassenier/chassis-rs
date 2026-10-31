// The loading state: the block waits at its final height under the data table's busy card.

import { getStrings } from '../strings.js';
import { openBusyCard } from '../busy-card.js';
import { LOADING_LINES_MAX, LOADING_LINES_MIN } from './constants.js';
import { make } from './dom.js';

/** @typedef {import('./controller.js').CodeBlock} CodeBlock */

/** Open the busy card over `area`, or move the one already open. @param {CodeBlock} ctl @param {HTMLElement} area */
function coverWithCard(ctl, area) {
    if (ctl.card) {
        ctl.card.place();
        return;
    }
    ctl.card = openBusyCard(ctl.host, {
        words: ctl.spec.loadingWords ?? getStrings().codeLoading,
        area: () => [area],
        className: 'kp-code__busy',
        arrive: ctl.drawn,
    });
    ctl.drawn = true;
}

/**
 * A cell waits on a block of its final height with the data table's busy card over it [states-two-1019]; the table around it
 * may lay its own over the rows, the cell is never a bare skeleton.
 * @param {CodeBlock} ctl
 */
function loadCell(ctl) {
    const el = ctl.host;
    const doc = el.ownerDocument;
    for (const node of [...el.children]) if (node !== ctl.head && node !== ctl.card?.layer) node.remove();
    el.removeAttribute('data-kp-code-folded');
    const line = make(doc, 'kp-code__skeleton');
    const bar = make(doc, 'kp-skeleton');
    bar.setAttribute('aria-hidden', 'true');
    line.append(bar);
    el.append(line);
    coverWithCard(ctl, line);
}

/** A block waits on an empty body of the height it had. @param {CodeBlock} ctl */
function loadBlock(ctl) {
    const el = ctl.host;
    const was = el.querySelector(':scope > :is(.kp-code__body, .kp-code__note)')?.getBoundingClientRect().height ?? 0;
    let body = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-code__body'));
    for (const node of [...el.children]) if (node !== ctl.head && node !== body && node !== ctl.card?.layer) node.remove();
    if (!body) {
        body = make(el.ownerDocument, 'kp-code__body', 'pre');
        el.append(body);
    }
    const lines = Math.max(LOADING_LINES_MIN, Math.min(ctl.lines || LOADING_LINES_MIN, ctl.spec.maxLines || LOADING_LINES_MAX));
    body.style.setProperty('--kp-code-min-lines', String(lines));
    body.style.minBlockSize = was > 0 ? `${was}px` : '';
    body.replaceChildren(make(el.ownerDocument, '', 'code'));
    coverWithCard(ctl, body);
}

/** @param {CodeBlock} ctl */
export function drawLoading(ctl) {
    ctl.host.setAttribute('aria-busy', 'true');
    ctl.host.setAttribute('data-kp-state', 'loading');
    if (ctl.cell) loadCell(ctl);
    else loadBlock(ctl);
}
