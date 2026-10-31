// The controller of one step list: it syncs the items, makes the status region, and follows `data-state` changes.

import { Controller } from '../controller.js';
import { syncItem } from './item.js';
import { regionOf } from './region.js';

/** Follows one `.kp-steplist`, so a framework or a hand-written `setAttribute` is followed too. */
export class StepListController extends Controller {
    connect() {
        for (const item of this.host.querySelectorAll(':scope > .kp-steplist__item')) syncItem(item);
        regionOf(this.host);
        if (typeof MutationObserver === 'undefined') return;
        this.observe(new MutationObserver((records) => this.onChange(records))).observe(this.host, {
            attributes: true,
            attributeFilter: ['data-state'],
            subtree: true,
        });
    }

    /** @param {MutationRecord[]} records */
    onChange(records) {
        for (const record of records) {
            const target = /** @type {Element} */ (record.target);
            if (target.classList.contains('kp-steplist__item')) syncItem(target, { announce: true });
        }
    }
}
