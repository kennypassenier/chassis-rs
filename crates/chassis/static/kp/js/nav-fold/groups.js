// The More menu's groups for the folded items: one entry per link that clicks the real one, a named group for a dropdown, and a rule where a separator folded.

import { counterOf, isSep, unavailable, wordsOf } from './read.js';

/** @typedef {import('../menu-button.js').MenuGroup} MenuGroup */
/** @typedef {import('../menu-button.js').MenuItem} MenuItem */

export class FoldGroups {
    /** @param {() => import('../strings.js').Strings} words the dictionary this bar speaks */
    constructor(words) {
        this.words = words;
        /** The real link behind each entry, by the entry's value. @type {HTMLElement[]} */
        this.sources = [];
        /** The menu's groups that follow a folded separator. @type {Set<MenuGroup>} */
        this.ruled = new Set();
        /** Their places among the groups the menu draws (menu-button.js leaves out an empty group). @type {number[]} */
        this.ruledAt = [];
        /** @type {MenuGroup[]} */
        this.groups = [];
        /** The open group of plain links, while the folded items are plain links. @type {MenuItem[] | null} */
        this.plain = null;
        /** A folded separator was seen: the next group stands below a rule. */
        this.rule = false;
        this.s = words();
    }

    /**
     * The menu's groups for the folded items; `sources` keeps the real link behind each entry.
     * @param {HTMLElement[]} folded
     * @returns {MenuGroup[]}
     */
    build(folded) {
        this.s = this.words();
        this.groups = [];
        this.plain = null;
        this.rule = false;
        this.ruled = new Set();
        this.sources = [];
        for (const li of folded) {
            if (isSep(li)) {
                this.plain = null;
                this.rule = true;
                continue;
            }
            this.take(li);
        }
        this.ruledAt = this.groups
            .filter((g) => g.items.length)
            .map((g, i) => (this.ruled.has(g) ? i : -1))
            .filter((i) => i > 0);
        return this.groups;
    }

    /** One folded item: a plain link joins the open group, an item with a panel is a group of its own. @param {HTMLElement} li */
    take(li) {
        const primary = /** @type {HTMLElement | null} */ (li.querySelector(':scope > a, :scope > button'));
        const panel = li.querySelector(':scope > .kp-nav__menu');
        if (!panel) {
            if (!primary) return;
            if (!this.plain) {
                this.plain = [];
                this.open({ group: '', items: this.plain });
            }
            this.plain.push(this.entry(primary));
            return;
        }
        this.plain = null;
        /** @type {MenuItem[]} */
        const items = [];
        if (primary?.matches('a[href]')) items.push(this.entry(primary));
        for (const link of /** @type {HTMLElement[]} */ ([...panel.querySelectorAll('a[href], button')])) {
            if (link.closest('[hidden]')) continue;
            if (link.matches('[data-kp-nav-disclosure]')) continue;
            items.push(this.entry(link));
        }
        this.open({ group: primary ? wordsOf(primary) : '', items });
    }

    /** @param {HTMLElement} el @returns {MenuItem} */
    entry(el) {
        const name = wordsOf(el) || (el.getAttribute('aria-label') ?? '');
        const count = counterOf(el);
        /** @type {MenuItem} */
        const item = { label: count ? `${name} · ${count}` : name, value: String(this.sources.length) };
        const href = el.getAttribute('href');
        if (href && el.tagName === 'A') item.href = href;
        const current = el.getAttribute('aria-current');
        if (current && current !== 'false') item.attrs = { 'aria-current': current };
        if (unavailable(el)) item.disabled = this.s.navMoreUnavailable;
        this.sources.push(el);
        return item;
    }

    /** @param {MenuGroup} group */
    open(group) {
        if (this.rule && this.groups.some((g) => g.items.length)) this.ruled.add(group);
        this.rule = false;
        this.groups.push(group);
    }
}
