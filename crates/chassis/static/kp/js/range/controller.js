// One wired range picker: the preset bar and the line built and taken down, the preset choice, and the custom panel when there is one.

import { SEGMENTED_EVENT, attachSegmented } from '../segmented.js';
import { RangeCore } from './core.js';
import { RangePanel } from './panel.js';

export class RangeController extends RangeCore {
    connect() {
        const el = this.host;
        this.own(() => this.unbuild());
        el.classList.add('kp-range');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
        this.line.className = 'kp-range__label';
        this.line.id = `${this.id}-label`;
        this.line.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-describedby', this.line.id);
        this.listen(this.group, SEGMENTED_EVENT, (event) => this.onPreset(event));
        el.replaceChildren(this.bar, this.line);
        this.own(attachSegmented(el));
        if (this.withCustom) new RangePanel(this).connect();
        this.firstWindow();
    }

    /** The first window, as the markup asks; a custom start in the markup (`data-kp-range-start`, `-end`) wins. */
    firstWindow() {
        const start = Date.parse(this.host.dataset.kpRangeStart ?? '');
        const end = Date.parse(this.host.dataset.kpRangeEnd ?? '');
        if (this.withCustom && Number.isFinite(start) && Number.isFinite(end)) this.set({ preset: null, start, end }, false);
        else if (this.value.preset) this.set({ preset: this.value.preset, start: 0, end: 0 }, false);
    }

    /** Takes the markup and the marks the picker added off the host again. */
    unbuild() {
        const el = this.host;
        el.replaceChildren();
        el.removeAttribute('aria-describedby');
        delete el.dataset.kpRangeValue;
    }

    /** @param {Event} event */
    onPreset(event) {
        if (event.target !== this.group) return;
        const key = /** @type {CustomEvent} */ (event).detail.value;
        if (key) this.set({ preset: key, start: 0, end: 0 }, true);
    }
}
