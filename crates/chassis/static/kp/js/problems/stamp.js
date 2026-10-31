// A container that is attached: it carries its layout and its count from the markup, so it is complete before a page sets any problem.

import { Controller } from '../controller.js';

export class ProblemsStamp extends Controller {
    connect() {
        const el = this.host;
        el.dataset.kpProblemsAttached = '';
        if (!el.hasAttribute('data-kp-problems-mode')) el.setAttribute('data-kp-problems-mode', 'each');
        el.setAttribute('data-kp-problems-count', String(el.querySelectorAll(':scope > .kp-problem').length));
        // Only the mark is taken back; the layout and the count stay.
        this.own(() => {
            delete el.dataset.kpProblemsAttached;
        });
    }
}
