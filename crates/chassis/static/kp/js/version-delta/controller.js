// One version chip: drawn from its attributes and redrawn when they change, and copied with Shift+click.

import { VERSION_COPY_EVENT, VERSION_OBSERVED } from './values.js';
import { ChipView } from './view.js';

export class VersionChip extends ChipView {
    connect() {
        // A chip that already carries the mark (a copy of a drawn one) is left alone, as it always was.
        if (this.host.dataset.kpVersionAttached === undefined) this.wire();
    }

    /** Mark the chip, draw it, and keep it in step with its attributes and its clicks. */
    wire() {
        const el = this.host;
        el.dataset.kpVersionAttached = '';
        // Registered first, so it runs last on detach: the chip is emptied and its classes and marks go back.
        this.own(() => {
            el.replaceChildren();
            el.className = this.before;
            for (const name of ['data-kp-level', 'data-kp-sort-value', 'data-kp-version-attached']) el.removeAttribute(name);
        });
        this.draw();
        this.listen(el, 'click', (event) => void this.copy(/** @type {MouseEvent} */ (event)));
        this.observe(new MutationObserver(() => this.draw())).observe(el, { attributes: true, attributeFilter: [...VERSION_OBSERVED] });
    }

    /** Draw the chip from its attributes. */
    draw() {
        const v = this.settings();
        this.markChip(v);
        if (this.drawState(v)) return;
        const toNode = this.toNode(v);
        const children = this.children(v, toNode);
        this.host.replaceChildren(...children, this.spoken(v));
        if (v.show === 'level' || !v.from) this.host.title = v.from ? [v.from, v.arrow, v.to].join(' ') : v.to;
    }

    /** Shift+click copies "10.11 → 12.1". @param {MouseEvent} event */
    async copy(event) {
        const el = this.host;
        if (!event.shiftKey || (event.target instanceof Element && event.target.closest('a'))) return;
        const from = el.getAttribute('data-kp-version-from') ?? '';
        const to = el.getAttribute('data-kp-version-to') ?? '';
        const text = from ? `${from} ${el.getAttribute('data-kp-version-arrow') ?? '→'} ${to}` : to;
        event.preventDefault();
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // No clipboard (an insecure page, or refused): nothing was copied, so nothing is announced.
            return;
        }
        el.dispatchEvent(new CustomEvent(VERSION_COPY_EVENT, { bubbles: true, detail: { text } }));
    }
}
