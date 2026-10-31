// The loading of the images: the box waits under the busy card until every image has arrived or failed, and a failed image says so in its pane with a Retry.

import { openBusyCard } from '../busy-card.js';
import { CompareCore } from './core.js';
import { COMPARE_RETRY_EVENT } from './values.js';

export class CompareLoad extends CompareCore {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.images = /** @type {HTMLImageElement[]} */ ([...this.before.querySelectorAll('img'), ...this.after.querySelectorAll('img')]);
        /** The failed-image notes standing in the panes. @type {HTMLElement[]} */
        this.notes = [];
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.card = null;
        /** Whether the page holds the box in its loading state. */
        this.held = false;
        this.drawn = false;
    }

    /** Hold the box in its loading state while the page reads its panes, or let it go. @param {boolean} busy */
    hold(busy) {
        this.held = busy;
        this.settle();
    }

    settle() {
        const el = this.host;
        const waiting = this.held || this.images.some((img) => !img.complete);
        el.dataset.kpCompareState = waiting ? 'loading' : 'ready';
        el.setAttribute('aria-busy', String(waiting));
        if (waiting && !this.card) this.card = openBusyCard(el, { words: this.s.compareLoading, area: () => [el], className: 'kp-compare__busy', arrive: this.drawn });
        else if (!waiting && this.card) {
            const leaving = this.card;
            this.card = null;
            void leaving.close();
        }
        this.drawn = true;
        for (const img of this.images) {
            const pane = /** @type {HTMLElement} */ (img.closest('.kp-compare__pane'));
            const failed = !this.held && img.complete && img.naturalWidth === 0;
            if (failed && !this.notes.some((n) => n.parentElement === pane)) this.noteFailed(pane);
        }
    }

    /** A failed image says so over its pane, with a normal-size Retry that loads it again. @param {HTMLElement} pane */
    noteFailed(pane) {
        const { doc, s } = this;
        const note = doc.createElement('div');
        note.className = 'kp-compare__failed';
        note.setAttribute('role', 'alert');
        const said = doc.createElement('p');
        said.className = 'kp-compare__failed-words';
        said.textContent = s.compareFailed;
        const retry = doc.createElement('button');
        retry.type = 'button';
        retry.className = 'kp-button kp-compare__retry';
        retry.textContent = s.compareRetry;
        retry.addEventListener('click', () => this.retry(pane, note));
        note.append(said, retry);
        pane.append(note);
        this.notes.push(note);
    }

    /** @param {HTMLElement} pane @param {HTMLElement} note */
    retry(pane, note) {
        const side = pane === this.before ? 'before' : 'after';
        note.remove();
        this.notes.splice(this.notes.indexOf(note), 1);
        for (const one of pane.querySelectorAll('img')) {
            // Setting the address again asks for the image again.
            const src = one.getAttribute('src');
            if (src !== null) one.setAttribute('src', src);
        }
        this.settle();
        this.host.dispatchEvent(new CustomEvent(COMPARE_RETRY_EVENT, { bubbles: true, detail: { pane: side } }));
    }
}
