// One live list: its pill placed, the rows it counts, the listeners for the reader's scroll, keys and pause buttons, and the way it is taken down.

import { watchOptions } from '../live-options.js';
import { NewPillAway } from './away.js';
import { isRow, isTableRow, rowKeyOf } from './rows.js';
import { NEWPILL_JUMP_EVENT } from './values.js';

/** @typedef {import('../newpill.js').NewPillOptions} NewPillOptions */

export class NewPill extends NewPillAway {
    /**
     * @param {HTMLElement} host the scroller
     * @param {NewPillOptions} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        /** What the page gets back, the same object every time. @type {import('../newpill.js').NewPillHandle} */
        this.handle = {
            pause: () => this.pause(),
            resume: () => this.jump(),
            jump: () => this.jump(),
            unseen: () => this.count(),
            following: () => this.isFollowing(),
        };
    }

    connect() {
        const { host, doc, view, pill, live } = this;
        // Registered first, so they run last on detach: the pill and the status line go, then the mark.
        this.own(() => host.removeAttribute('data-kp-following'));
        this.own(() => live.remove());
        this.own(() => pill.remove());
        this.own(() => view?.clearTimeout(this.sayLater));
        host.parentElement?.setAttribute('data-kp-newpill-host', '');
        host.parentElement?.append(pill, live);
        this.seedKnown();
        this.watchRows();
        this.listen(host, 'scroll', () => this.onScroll(), { passive: true });
        this.listen(host, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(pill, 'click', () => this.jump());
        this.listen(doc, 'click', (event) => this.onToggle(event));
        this.listen(doc, 'visibilitychange', () => this.onVisibility());
        // The list opens at the end the rows arrive at (once it has been laid out).
        view?.requestAnimationFrame(() => view.requestAnimationFrame(() => this.openAtEnd()));
        this.draw();
        const stop = watchOptions(host, ['data-kp-pill-placement'], () => pill.setAttribute('data-kp-pill-placement', this.placementNow()));
        this.own(stop);
    }

    openAtEnd() {
        if (!this.destroyed && this.isFollowing() && this.host.scrollHeight > this.host.clientHeight) this.toEnd();
    }

    /** In `tbody` mode the rows already there are known, so a sort or a filter that brings them back counts none. */
    seedKnown() {
        if (!this.read.inTbody) return;
        for (const row of this.host.querySelectorAll('tbody > tr')) if (isTableRow(row) && rowKeyOf(row)) this.known.add(rowKeyOf(row));
    }

    watchRows() {
        const { view, host } = this;
        if (!view || !('MutationObserver' in view)) return;
        const observer = this.observe(new view.MutationObserver((records) => this.onRows(records)));
        observer.observe(host, this.read.inTbody ? { childList: true, subtree: true } : { childList: true });
    }

    /** Whether a node added to the list is a new row to count. @param {MutationRecord} record @param {Node} node */
    isNewRow(record, node) {
        if (!(node instanceof Element)) return false;
        if (!this.read.inTbody) return isRow(node);
        if (!(record.target instanceof Element) || record.target.tagName !== 'TBODY' || !isTableRow(node)) return false;
        const key = rowKeyOf(node);
        if (key && this.known.has(key)) return false;
        if (key) this.known.add(key);
        return true;
    }

    /** @param {MutationRecord[]} records */
    onRows(records) {
        let added = false;
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (!this.isNewRow(record, node)) continue;
                added = true;
                this.noteRow(/** @type {Element} */ (node));
                if (!this.isFollowing()) this.unseen.add(/** @type {Element} */ (node));
            }
        }
        if (!added) return;
        if (this.isFollowing()) this.toEnd();
        this.draw();
    }

    jump() {
        this.setFollowing(true, false);
        this.unseen.clear();
        this.toEnd();
        this.draw();
        this.host.dispatchEvent(new CustomEvent(NEWPILL_JUMP_EVENT, { bubbles: true, detail: { unseen: 0 } }));
    }

    pause() {
        this.setFollowing(false, true);
        this.draw();
    }

    /** The reader scrolled: away from the end stops following, back to it follows again. */
    onScroll() {
        if (this.programmatic) return;
        if (this.atEnd()) {
            if (!this.following || this.paused) {
                // Back at the end by hand: following again by itself, and everything is seen.
                this.setFollowing(true, false);
                this.unseen.clear();
                this.draw();
            }
        } else if (this.following) {
            this.setFollowing(false, this.paused);
            this.draw();
        }
    }

    /** Jump back to the tail, or pause and resume with Space. @param {KeyboardEvent} event */
    onKey(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('input, textarea, select, button, a')) return;
        if (event.key === this.read.keyName) {
            event.preventDefault();
            this.jump();
        } else if (this.read.space && event.key === ' ') {
            event.preventDefault();
            this.toggle();
        }
    }

    /** Resume when paused or away from the end, otherwise pause. */
    toggle() {
        if (this.paused || !this.following) this.jump();
        else this.pause();
    }

    /** @param {Event} event */
    onToggle(event) {
        const toggle = event.target instanceof Element ? event.target.closest('[data-kp-follow-toggle]') : null;
        if (!toggle || toggle.getAttribute('data-kp-follow-toggle') !== this.host.id) return;
        this.toggle();
    }
}
