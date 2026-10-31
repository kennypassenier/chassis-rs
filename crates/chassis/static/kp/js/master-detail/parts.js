// The layout's panes and the detail's fixed parts: finding a pane, the column list, and the head, Back button, body and state box.

import { getStrings } from '../strings.js';

/** One pane of a layout. @param {HTMLElement} root @param {string} pane */
export const paneOf = (root, pane) => /** @type {HTMLElement | null} */ (root.querySelector(`:scope > [data-kp-pane="${pane}"]`));

/** `1fr` is `minmax(0, 1fr)` in a grid, so a long word never widens a column. @param {string} widths */
export const columns = (widths) =>
    widths
        .trim()
        .split(/\s+/)
        .map((w) => (w === '1fr' ? 'minmax(0, 1fr)' : w))
        .join(' ');

/** The detail's head (with its heading and Back), body and state box: found in the markup, or made and put in by `mount()`. */
export class DetailParts {
    /** @param {HTMLElement} detail */
    constructor(detail) {
        const doc = detail.ownerDocument;
        this.detail = detail;
        const foundHead = /** @type {HTMLElement | null} */ (detail.querySelector(':scope > .kp-pane__head'));
        /** Whether the head was made here and still has to be put in. */
        this.madeHead = foundHead === null;
        this.head = foundHead ?? this.make(doc, 'div', 'kp-pane__head');
        const foundBack = /** @type {HTMLButtonElement | null} */ (this.head.querySelector('.kp-pane__back'));
        this.madeBack = foundBack === null;
        this.back = foundBack ?? /** @type {HTMLButtonElement} */ (this.make(doc, 'button', 'kp-button kp-pane__back'));
        const foundBody = /** @type {HTMLElement | null} */ (detail.querySelector(':scope > .kp-pane__body'));
        this.madeBody = foundBody === null;
        this.body = foundBody ?? this.make(doc, 'div', 'kp-pane__body');
        const foundState = /** @type {HTMLElement | null} */ (detail.querySelector(':scope > .kp-pane__state'));
        this.madeState = foundState === null;
        this.stateBox = foundState ?? this.make(doc, 'div', 'kp-pane__state');
    }

    /** @param {Document} doc @param {string} tag @param {string} className */
    make(doc, tag, className) {
        const node = doc.createElement(tag);
        node.className = className;
        return node;
    }

    /** Put the made parts in, in the order the markup would have them. */
    mount() {
        const { detail, head, back, body, stateBox } = this;
        if (this.madeHead) {
            const heading = detail.querySelector('[data-kp-pane-heading]');
            detail.prepend(head);
            if (heading) head.append(heading);
        }
        if (this.madeBack) {
            /** @type {HTMLButtonElement} */ (back).type = 'button';
            back.textContent = getStrings().paneBack;
            head.prepend(back);
        }
        if (this.madeBody) {
            for (const child of [...detail.childNodes]) if (child !== head) body.append(child);
            detail.append(body);
        }
        if (this.madeState) detail.append(stateBox);
        detail.classList.add('kp-pane__detail');
    }
}
