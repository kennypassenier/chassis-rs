// One master-detail layout: the list as a listbox, the selection, opening and closing the folded detail, history, keys and states [kpadopt5-ops].

import { ITEM, PANE_CLOSE_EVENT, PANE_RETRY_EVENT } from './constants.js';
import { MasterDetailBase } from './base.js';

/**
 * The controller of one `[data-kp-master-detail]` layout that has a detail pane and a window, and a list pane, or, without one, an
 * aside: the detail + aside variant [homelab gap 73], where the detail always shows and only the aside folds.
 */
export class MasterDetailController extends MasterDetailBase {
    connect() {
        const root = this.host;
        root.toggleAttribute('data-kp-pane-listless', this.list === null);
        this.setColumns();
        this.readItems();
        this.folding.measure();
        this.parts.mount();
        this.listen(root, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(root, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.view, 'popstate', () => this.onPop());
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(() => this.onSize())).observe(root);
        this.observe(new MutationObserver(() => this.sync())).observe(root, { attributes: true, attributeFilter: ['data-kp-narrow'] });
        this.own(() => this.undoMarks());
        this.own(() => this.detailState.release());
        this.paint();
        this.sync();
        // Nothing selected: the detail says what to do rather than stand blank. Without a list there is nothing to select: the detail is ready.
        if (!this.selected && !root.hasAttribute('data-kp-state') && this.list) this.detailState.setState('empty');
        else if (root.hasAttribute('data-kp-state')) this.detailState.setState(/** @type {import('./constants.js').PaneState} */ (root.getAttribute('data-kp-state')));
    }

    // --- Events. ---
    /** @param {MouseEvent} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-kp-pane-retry]') && this.detail.contains(target)) {
            this.host.dispatchEvent(new CustomEvent(PANE_RETRY_EVENT, { bubbles: true, detail: { key: this.selected } }));
            return;
        }
        if (target.closest('.kp-pane__back') === this.parts.back) {
            this.close();
            return;
        }
        const item = target.closest(ITEM);
        if (item instanceof HTMLElement && this.list?.contains(item)) this.open(item.getAttribute('data-kp-pane-key') ?? '');
    }

    /** The arrow keys, Home and End move the selection; Enter and Space open; Esc closes the aside or the folded detail. @param {KeyboardEvent} event */
    onKey(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const item = target.closest(ITEM);
        if (item instanceof HTMLElement && this.list?.contains(item)) {
            this.onItemKey(event, item);
            return;
        }
        if (event.key !== 'Escape') return;
        const aside = this.aside;
        if (aside && aside.contains(target) && this.host.hasAttribute('data-kp-aside-closable')) {
            event.preventDefault();
            aside.hidden = true;
            this.host.dispatchEvent(new CustomEvent(PANE_CLOSE_EVENT, { bubbles: true, detail: { pane: 'aside', key: this.selected } }));
        } else if (this.detail.contains(target) && this.folding.narrow && this.folding.shown === 'detail') {
            event.preventDefault();
            this.close();
        }
    }

    /** A key on a list item: move, jump, or open. @param {KeyboardEvent} event @param {HTMLElement} item */
    onItemKey(event, item) {
        const all = this.items();
        const at = all.indexOf(item);
        let to = -1;
        if (event.key === 'ArrowDown') to = Math.min(all.length - 1, at + 1);
        else if (event.key === 'ArrowUp') to = Math.max(0, at - 1);
        else if (event.key === 'Home') to = 0;
        else if (event.key === 'End') to = all.length - 1;
        if (to >= 0) {
            event.preventDefault();
            const next = all[to];
            if (next) this.select(next.getAttribute('data-kp-pane-key'), { focus: true });
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.open(item.getAttribute('data-kp-pane-key') ?? '', { focus: true });
        }
    }

    onPop() {
        if (this.pushed || this.folding.shown === 'detail') this.close({ fromHistory: true });
    }

    onSize() {
        if (this.folding.widthNow() <= 0) return;
        this.folding.resize();
        this.sync();
    }
}
