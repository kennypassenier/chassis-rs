// The More menu's groups for the folded items: one entry per link that clicks the real one, a named group for a dropdown, and a rule where a separator folded.

import { counterOf, hintOf, isSep, pinnedGroup, unavailable, wordsOf } from './read.js';

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
        /** The name of the open group of plain links: '' or the group a pinned item names [parts-1102]. */
        this.plainName = '';
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
        this.plainName = '';
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
            // A pinned item that names a group (`data-kp-nav-more="Kitchen"`) opens that group; the next one with the name joins it.
            // A group named as the More button itself (chassis-rs Page::group "More") needs no heading inside that menu.
            const named = pinnedGroup(li);
            const name = named === this.s.navMore ? '' : named;
            if (!this.plain || this.plainName !== name) {
                this.plain = [];
                this.plainName = name;
                this.open({ group: name, items: this.plain });
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
        const hint = hintOf(el);
        if (hint) item.hint = hint;
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
