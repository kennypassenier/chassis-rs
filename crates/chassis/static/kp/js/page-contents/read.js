// Reading the entries: the items the page gave, or the headings of the scope, each with an id of its own.

import { DEFAULT_HEADINGS } from './values.js';
import { contentsSlug } from './slug.js';
import { ContentsCore } from './core.js';

/** @typedef {import('./core.js').ContentsItem} ContentsItem */

export class ContentsRead extends ContentsCore {
    /** The entries the page gave, each with the section it names. @param {ContentsItem[]} given @returns {{ item: ContentsItem, target: HTMLElement }[]} */
    readGiven(given) {
        return given.flatMap((item) => {
            const target = /** @type {HTMLElement | null} */ (this.lookup(`#${this.view.CSS.escape(item.id)}`));
            return target ? [{ item, target }] : [];
        });
    }

    /** The headings that count: in the scope, not in the list, shown, with words. @returns {HTMLElement[]} */
    headings() {
        const selector = this.host.getAttribute('data-kp-contents-headings') || DEFAULT_HEADINGS;
        /** @type {HTMLElement[]} */
        let found;
        try {
            found = /** @type {HTMLElement[]} */ ([...this.scope().querySelectorAll(selector)]);
        } catch {
            // A selector that is not valid names no headings.
            found = [];
        }
        return found.filter((h) => !this.host.contains(h) && !h.hidden && (h.textContent ?? '').trim() !== '');
    }

    /** Give a heading an id from its words, one that no element has yet. @param {HTMLElement} target @param {Set<string>} used */
    ensureHeadingId(target, used) {
        if (target.id) return;
        const base = contentsSlug(target.textContent ?? '');
        let candidate = base;
        for (let n = 2; used.has(candidate); n += 1) candidate = `${base}-${n}`;
        target.id = candidate;
        used.add(candidate);
    }

    /** The entries now: the items the page gave, else the headings, nested by their level. @returns {{ item: ContentsItem, target: HTMLElement }[]} */
    read() {
        if (this.given) return this.readGiven(this.given);
        const headings = this.headings();
        const levels = headings.map((h) => (/^H[1-6]$/.test(h.tagName) ? Number(h.tagName[1]) : 2));
        const top = Math.min(...levels);
        const used = new Set([...this.doc.querySelectorAll('[id]')].map((e) => e.id));
        return headings.map((target, i) => {
            this.ensureHeadingId(target, used);
            return { item: { id: target.id, label: (target.textContent ?? '').trim(), level: Math.max(0, levels[i] - top) }, target };
        });
    }
}
