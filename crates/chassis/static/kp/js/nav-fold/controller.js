// One wired folding bar: the More item put into the list and taken out again, the menu's pick, and what makes the bar fit again.

import { attachMenuButtons } from '../menu-button.js';
import { NavFoldCore } from './core.js';

export class NavFold extends NavFoldCore {
    connect() {
        const { list, menu, more, doc, view } = this;
        this.writeWords();
        list.append(more);
        this.own(() => this.unfold());
        this.own(attachMenuButtons(more, { strings: this.strings }));
        this.observe(new MutationObserver(() => this.ruleMenu())).observe(menu, { childList: true });
        // A pick clicks the real link: the router, the counter and the page's own handlers all hear it. A modified click
        // (new tab, new window) goes to the entry's own href instead.
        this.listen(menu, 'click', (event) => this.onPick(/** @type {MouseEvent} */ (event)), true);
        this.watchSizes();
        this.watchList();
        // The font of the theme is a width; so is the narrow toggle's visibility. A bar taken down meanwhile stays down.
        doc.fonts?.ready.then(() => {
            if (!this.destroyed) this.fit();
        });
        this.listen(view, 'resize', () => this.fit());
        this.fit();
    }

    /** Takes the More item and the marks the bar added off it again. */
    unfold() {
        const { host, list } = this;
        this.more.remove();
        for (const li of this.itemsOf()) li.removeAttribute('data-kp-nav-folded');
        host.removeAttribute('data-kp-nav-folding');
        host.removeAttribute('data-kp-nav-fold-ready');
        list.style.removeProperty('--kp-nav-fold-used');
        list.style.removeProperty('--kp-nav-fold-more');
    }

    /** Fit again when the list, an item or the More item changes size. */
    watchSizes() {
        this.resize = typeof ResizeObserver === 'undefined' ? null : this.observe(new ResizeObserver(() => this.fit()));
        this.resize?.observe(this.list);
        this.watchItems();
        this.resize?.observe(this.more);
    }

    /** The items whose natural width the fit reads: a font that loads, a counter that grows. */
    watchItems() {
        for (const li of this.itemsOf()) this.resize?.observe(li);
    }

    /** The list changing (a render adds a link, a router moves aria-current) is a reason to fit again; the More item's own menu is not. */
    watchList() {
        const mutations = new MutationObserver((records) => {
            if (records.every((r) => this.more.contains(r.target))) return;
            this.watchItems();
            this.fit();
        });
        this.observe(mutations).observe(this.list, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['aria-current', 'hidden', 'disabled', 'aria-disabled', 'data-kp-nav-keep'],
        });
    }

    /** @param {MouseEvent} event */
    onPick(event) {
        const entryEl = event.target instanceof Element ? event.target.closest('[role="menuitem"]') : null;
        const source = entryEl ? this.groups.sources[Number(/** @type {HTMLElement} */ (entryEl).dataset.kpValue)] : undefined;
        if (!source || entryEl?.getAttribute('aria-disabled') === 'true') return;
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        source.click();
        // A router may handle the click without leaving the page; the focus must not be left on a menu that has closed.
        queueMicrotask(() => {
            if (this.doc.activeElement === this.doc.body || this.doc.activeElement === null) this.button.focus();
        });
    }
}
