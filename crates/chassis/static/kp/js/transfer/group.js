// A group of transfers that folds to name, bar and numbers under it by its own width, not the window's.

import { Controller } from '../controller.js';
import { DEFAULT_FOLD_AT } from './values.js';

export class TransferGroup extends Controller {
    /** @param {HTMLElement} group */
    constructor(group) {
        super(group);
        /** A hidden box the width of the fold, measured and taken out again. */
        this.probe = group.ownerDocument.createElement('div');
    }

    connect() {
        const group = this.host;
        this.probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;block-size:0;overflow:hidden';
        this.fit();
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(() => this.fit())).observe(group);
    }

    /** Measure the fold width and the group's own, and mark the group narrow when it is below it (`data-kp-fold-at`, 46rem). */
    fit() {
        const group = this.host;
        const probe = this.probe;
        probe.style.inlineSize = group.getAttribute('data-kp-fold-at') ?? DEFAULT_FOLD_AT;
        group.append(probe);
        const limit = probe.getBoundingClientRect().width;
        probe.remove();
        const width = group.getBoundingClientRect().width;
        if (width > 0) group.toggleAttribute('data-kp-narrow', width < limit);
    }
}
