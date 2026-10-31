// The KPI toggle: a click flips aria-pressed and fires the event; the page does the filtering.

import { KPI_TOGGLE, KPI_TOGGLE_EVENT } from './values.js';
import { ScopeWatch } from './scope.js';

/** The clicks a toggle has already answered. @type {WeakSet<Event>} */
const FLIPPED = new WeakSet();

/**
 * Wire every KPI toggle under a scope: a click flips `aria-pressed` and fires `kp-kpi-toggle`. A tile marked
 * `data-kp-kpi-owned` is left to the page (a framework that keeps the pressed state itself).
 */
export class KpiToggles extends ScopeWatch {
    connect() {
        for (const tile of this.scope.querySelectorAll(KPI_TOGGLE))
            if (!tile.hasAttribute('aria-pressed')) tile.setAttribute('aria-pressed', 'false');
        this.listen(this.scope, 'click', (event) => this.onClick(event));
    }

    /** @param {Event} event */
    onClick(event) {
        const tile = /** @type {Element | null} */ (event.target instanceof Element ? event.target.closest(KPI_TOGGLE) : null);
        if (!tile || tile.hasAttribute('data-kp-kpi-owned')) return;
        // A tile under two attached roots (the document, and a part of it
        // attached again later) flips once per click.
        if (FLIPPED.has(event)) return;
        FLIPPED.add(event);
        const pressed = tile.getAttribute('aria-pressed') !== 'true';
        tile.setAttribute('aria-pressed', String(pressed));
        tile.dispatchEvent(new CustomEvent(KPI_TOGGLE_EVENT, { bubbles: true, detail: { pressed } }));
    }
}
