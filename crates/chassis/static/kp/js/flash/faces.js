// One button's faces: its own words, the spinner, the result and the words it may say, all in one grid cell so the width never changes.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { attr } from './read.js';

/** @typedef {import('../flash.js').FlashOptions} FlashOptions */

export class FlashFaces extends Controller {
    /**
     * @param {HTMLElement} host the button
     * @param {FlashOptions} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.flashOptions = options;
        const doc = host.ownerDocument;
        this.rest = this.span('kp-flash__face kp-flash__face--rest');
        this.busy = this.span('kp-flash__face kp-flash__face--busy');
        this.busy.setAttribute('aria-hidden', 'true');
        this.result = this.span('kp-flash__face kp-flash__face--result');
        this.result.setAttribute('aria-hidden', 'true');
        this.stack = this.span('kp-flash__stack');
        this.status = this.span('kp-sr-only');
        this.status.setAttribute('role', 'status');
        const slot = host.getAttribute('data-kp-flash-line');
        const own = slot ? doc.querySelector(slot) : null;
        /** Whether the line under the button is one this controller made. */
        this.ownLine = own === null;
        this.line = /** @type {HTMLElement} */ (own ?? doc.createElement('p'));
    }

    /** @param {string} className */
    span(className) {
        const node = this.host.ownerDocument.createElement('span');
        node.className = className;
        return node;
    }

    /** Every word the button may say holds its width, unseen. */
    ghostWords() {
        const button = this.host;
        const s = getStrings();
        return (
            button.getAttribute('data-kp-flash-words') ??
            `${attr(button, 'data-kp-flash-word', s.flashDone)},${attr(button, 'data-kp-refused-word', s.flashRefused)}`
        )
            .split(',')
            .map((w) => w.trim())
            .filter(Boolean);
    }

    connect() {
        const { host: button, rest, busy, result, stack, status, line, ownLine } = this;
        const doc = button.ownerDocument;
        rest.append(...button.childNodes);
        const spin = doc.createElement('span');
        spin.className = 'kp-spinner kp-button__spin';
        busy.append(spin);
        const label = this.flashOptions.busyLabel ?? button.getAttribute('data-kp-busy-label');
        if (label) busy.append(label);
        stack.append(rest, busy, result);
        for (const word of this.ghostWords()) {
            const ghost = doc.createElement('span');
            ghost.className = 'kp-flash__ghost';
            ghost.setAttribute('aria-hidden', 'true');
            ghost.textContent = `✓ ${word}`;
            stack.append(ghost);
        }
        button.replaceChildren(stack);
        button.classList.add('kp-flash');
        button.setAttribute('data-kp-flash-state', 'rest');
        if (ownLine) {
            line.className = 'kp-flash__line';
            line.hidden = true;
        }
        line.setAttribute('role', 'status');
        button.after(status);
        if (ownLine) status.after(line);
        this.own(() => this.unwire());
    }

    /** Give the button its own words back and take the faces, the status and the line away. */
    unwire() {
        const { host: button, rest, status, line, ownLine } = this;
        button.replaceChildren(...rest.childNodes);
        button.classList.remove('kp-flash');
        button.removeAttribute('data-kp-flash-state');
        button.removeAttribute('aria-busy');
        button.removeAttribute('aria-disabled');
        status.remove();
        if (ownLine) line.remove();
        else {
            line.textContent = '';
            line.removeAttribute('data-kp-tone');
        }
    }
}
