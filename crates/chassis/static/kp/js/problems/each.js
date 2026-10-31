// A container's state on the instance and its `each` layout: one alert per problem, kept by key, with the ones that are gone leaving and the rest put in order.

import { Controller } from '../controller.js';
import { leave } from '../motion.js';
import { paintAlert } from './alert.js';

/** @typedef {import('../problems.js').Problem} Problem */
/** @typedef {import('../problems.js').ProblemsOptions} ProblemsOptions */

export class ProblemsEach extends Controller {
    /** @param {HTMLElement} host a `[data-kp-problems]` */
    constructor(host) {
        super(host);
        /** The problems it was last given. @type {Problem[]} */
        this.items = [];
        /** The options it was last given, less the layout, for a repaint after an attribute change. @type {ProblemsOptions} */
        this.rest = {};
        /** The layout attributes as last rendered, so the observer repaints only for another one. */
        this.rendered = '';
    }

    /** The alerts on show, by key: a row that is leaving is gone, and one that is arriving the theme's way (formal: its leave played backwards) is on show [homelab 89]. @returns {Map<string, HTMLElement>} */
    shownAlerts() {
        /** @type {Map<string, HTMLElement>} */
        const shown = new Map();
        for (const el of /** @type {HTMLElement[]} */ ([...this.host.children])) {
            const key = el.getAttribute('data-kp-key');
            // A row that is leaving is gone; one that is arriving the theme's way (formal: its leave played backwards) carries
            // `data-kp-leaving` as well, and is on show [homelab 89]: skipping it drew another copy at every repaint.
            const leaving = el.hasAttribute('data-kp-leaving') && !el.hasAttribute('data-kp-arriving');
            if (el.classList.contains('kp-problem') && key !== null && !leaving) shown.set(key, el);
        }
        return shown;
    }

    /** One alert per problem, the worst first, each with its own fix. @param {Problem[]} list @param {string} remedyLabel */
    paintEach(list, remedyLabel) {
        const host = this.host;
        host.querySelector(':scope > .kp-problem--list')?.remove();
        const shown = this.shownAlerts();
        const wanted = list.map((p) => paintAlert(shown.get(p.key), p, host.ownerDocument, remedyLabel, host));
        for (const [key, el] of shown) if (!list.some((p) => p.key === key)) void leave(el).then(() => el.remove());
        let before = /** @type {Element | null} */ (null);
        for (const el of wanted) {
            const inPlace = el.parentElement === host && (before ? el.previousElementSibling === before : host.firstElementChild === el);
            if (!inPlace) {
                if (before) before.after(el);
                else host.prepend(el);
            }
            before = el;
        }
    }
}
