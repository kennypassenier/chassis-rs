// The release notes in a gate [wish-1120, homelab 113]: a fold under the alert with a scrolling, named box that holds the markdown as DOM.

import { markdownFragment } from '../markdown.js';
import { make } from './build.js';

/** The level a `#` heading in the notes is written at when the gate does not say (a `##` is an h4). */
const DEFAULT_HEADING_LEVEL = 3;

export class AckNotes {
    /**
     * @param {HTMLElement} gate
     * @param {HTMLElement} before the element the fold is put in front of
     * @param {import('../strings.js').Strings} s
     * @param {() => void} paint called when the fold opens or closes
     */
    constructor(gate, before, s, paint) {
        this.gate = gate;
        this.before = before;
        this.s = s;
        this.paint = paint;
        /** The fold, made when notes arrive. @type {HTMLDetailsElement | null} */
        this.fold = null;
        /** Whether the fold was opened once. */
        this.opened = false;
    }

    /** Take the fold away. */
    remove() {
        this.fold?.remove();
        this.fold = null;
    }

    /** Make the fold, closed unless the gate asks for it open. */
    create() {
        const { gate, s } = this;
        const fold = /** @type {HTMLDetailsElement} */ (make(gate.ownerDocument, 'kp-ack__notes', 'details'));
        this.fold = fold;
        const summary = make(gate.ownerDocument, 'kp-ack__notes-summary', 'summary');
        summary.textContent = s.ackNotes;
        const body = make(gate.ownerDocument, 'kp-ack__notes-body kp-markdown');
        body.tabIndex = 0;
        body.setAttribute('role', 'region');
        fold.append(summary, body);
        fold.addEventListener('toggle', () => {
            if (this.fold?.open) this.opened = true;
            this.paint();
        });
        gate.insertBefore(fold, this.before);
        if (gate.hasAttribute('data-kp-ack-notes-open')) {
            fold.open = true;
            this.opened = true;
        }
        return fold;
    }

    /** @param {string | null} markdown null or an empty text takes the notes away */
    set(markdown) {
        const { gate, s } = this;
        const text = markdown === null ? '' : String(markdown);
        if (text.trim() === '') {
            this.remove();
            this.paint();
            return;
        }
        const fold = this.fold ?? this.create();
        const body = /** @type {HTMLElement} */ (fold.querySelector('.kp-ack__notes-body'));
        body.setAttribute('aria-label', gate.getAttribute('data-kp-ack-notes-label') ?? s.ackNotes);
        const levels = Number(gate.getAttribute('data-kp-ack-notes-headings'));
        body.replaceChildren(markdownFragment(gate.ownerDocument, text, { headings: levels >= 1 ? levels : DEFAULT_HEADING_LEVEL }));
        this.paint();
    }
}
