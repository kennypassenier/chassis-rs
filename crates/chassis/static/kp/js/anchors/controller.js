// One anchored container: copying a mark's link (a press, Shift for Markdown, `y l` on a focused row), and landing on a
// link: opening what folds it, scrolling, the short highlight, and the notice when a hash has no place.

import { motionAllowed } from '../calm.js';
import { LAST_CHANGE, serveCopyKey } from './copy-key.js';
import { AnchorMarks } from './marks.js';
import { ANCHOR_COPY_EVENT, ANCHOR_HIT_MS, ANCHOR_MISSING_EVENT, ANCHOR_QUIET_MS, ANCHOR_REVEAL_EVENT, ANCHORS, copyText, nameOf } from './text.js';

/** How often a hash without a place yet is looked for again [ms]. */
const LOOK_AGAIN_MS = 250;

export class AnchorBox extends AnchorMarks {
    /** @param {HTMLElement} box @param {import('../anchors.js').AnchorOptions} [options] */
    constructor(box, options = {}) {
        super(box, options);
        /** The notice of a hash without a place. @type {HTMLElement | null} */
        this.notice = null;
        this.waitTimer = 0;
        /** The place a link landed on, while it is marked. @type {HTMLElement | null} */
        this.lit = null;
        this.litTimer = 0;
        /** The timers that take "Copied" off the marks. @type {number[]} */
        this.timers = [];
        /** Whether a scan is queued for the end of this task. */
        this.scheduled = false;
    }

    connect() {
        const box = this.host;
        box.dataset.kpAnchorsAttached = '';
        box.classList.add('kp-anchors');
        box.setAttribute('data-kp-anchor-show', this.showMode());
        const offset = box.getAttribute('data-kp-anchor-offset');
        if (offset) box.style.setProperty('--kp-anchor-offset', offset);
        this.mountVoice();
        // Registered first, so it runs last: everything attach drew comes off once nothing listens any more.
        this.own(() => this.takeDown());
        this.listen(box, 'click', (event) => void this.onClick(event));
        this.listen(this.view, 'hashchange', () => this.arrive());
        // The page's rows come and go: a datatable draws them again on a sort.
        this.observe(new MutationObserver(() => this.changed())).observe(box, { childList: true, subtree: true });
        // y then l on a focused row copies its link; listed in the ? sheet, once for the page however many containers there are.
        this.own(serveCopyKey(this.doc, this.strings, () => this.copyFocused()));
        this.scan();
        // The hash the page opened with.
        if (this.view.location.hash) this.view.setTimeout(() => this.arrive(), 0);
    }

    takeDown() {
        const box = this.host;
        for (const t of this.timers) this.view.clearTimeout(t);
        window.clearTimeout(this.waitTimer);
        window.clearTimeout(this.litTimer);
        this.unmark();
        this.clearNotice();
        this.live.remove();
        this.lit?.removeAttribute('data-kp-anchor-hit');
        box.classList.remove('kp-anchors');
        box.removeAttribute('data-kp-anchor-show');
        delete box.dataset.kpAnchorsAttached;
    }

    changed() {
        LAST_CHANGE.set(this.doc, Date.now());
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            this.scan();
        });
    }

    // --- Landing on a link. ---

    clearNotice() {
        this.notice?.remove();
        this.notice = null;
    }

    /** Open every closed `<details>` around the place, unless the container says not to. @param {HTMLElement} target */
    reveal(target) {
        if (!this.opensFirst()) return;
        for (let p = target.parentElement; p && p !== this.doc.body; p = p.parentElement) {
            if (p instanceof HTMLDetailsElement && !p.open) p.open = true;
        }
    }

    /** @param {string} id @returns {boolean} whether there was a place to land */
    land(id) {
        const box = this.host;
        const target = id ? this.doc.getElementById(id) : null;
        if (!target || !box.contains(target)) return false;
        this.clearNotice();
        window.clearTimeout(this.waitTimer);
        const go = box.dispatchEvent(new CustomEvent(ANCHOR_REVEAL_EVENT, { bubbles: true, cancelable: true, detail: { id, target } }));
        if (go) this.reveal(target);
        target.scrollIntoView({ block: 'start', behavior: motionAllowed(box) ? 'smooth' : 'auto' });
        if (this.highlights()) this.light(target);
        return true;
    }

    /** Mark the place a link landed on for a moment. @param {HTMLElement} target */
    light(target) {
        if (this.lit && this.lit !== target) this.lit.removeAttribute('data-kp-anchor-hit');
        this.lit = target;
        target.setAttribute('data-kp-anchor-hit', '');
        window.clearTimeout(this.litTimer);
        this.litTimer = window.setTimeout(() => {
            target.removeAttribute('data-kp-anchor-hit');
            if (this.lit === target) this.lit = null;
        }, ANCHOR_HIT_MS);
    }

    /** The notice of a hash without a place, with Show all, which drops the hash. @param {string} id */
    showMissing(id) {
        this.clearNotice();
        const notice = this.doc.createElement('div');
        notice.className = 'kp-alert kp-alert--info kp-anchors__notice';
        notice.setAttribute('role', 'status');
        const text = this.doc.createElement('span');
        text.className = 'kp-alert__body kp-anchors__notice-text';
        text.textContent = this.strings.anchorMissing;
        const reset = this.doc.createElement('button');
        reset.type = 'button';
        reset.className = 'kp-button kp-button--sm kp-anchors__notice-action';
        reset.textContent = this.strings.anchorShowAll;
        reset.addEventListener('click', () => {
            try {
                this.view.history.replaceState(null, '', `${this.view.location.pathname}${this.view.location.search}`);
            } catch {
                // A sandboxed frame may refuse; the notice still goes.
            }
            this.clearNotice();
            this.host.dispatchEvent(new CustomEvent('kp-anchor-reset', { bubbles: true, detail: { id } }));
        });
        notice.append(text, reset);
        this.notice = notice;
        this.host.prepend(notice);
        this.host.dispatchEvent(new CustomEvent(ANCHOR_MISSING_EVENT, { bubbles: true, detail: { id } }));
    }

    idOfHash() {
        try {
            return decodeURIComponent(this.view.location.hash.slice(1));
        } catch {
            return this.view.location.hash.slice(1);
        }
    }

    /** Land on the hash, waiting for a place that is still being drawn. */
    arrive() {
        const id = this.idOfHash();
        window.clearTimeout(this.waitTimer);
        if (!id) return;
        const startedAt = Date.now();
        const tick = () => {
            const there = this.doc.getElementById(id);
            if (there && this.host.contains(there)) return void this.land(id);
            // The place belongs to another part of the page: not this container's to answer for.
            if (there) return;
            // Give up at the longest wait, or as soon as the container has been still and nothing in it is drawing: a row that
            // was deleted is not waited for ten seconds.
            const now = Date.now();
            const still = !this.drawing() && now - Math.max(startedAt, LAST_CHANGE.get(this.doc) ?? 0) >= ANCHOR_QUIET_MS;
            if (now - startedAt >= this.waitMs() || still) {
                // One notice for the page: the first container says it.
                if (this.doc.querySelector(ANCHORS) === this.host) this.showMissing(id);
                return;
            }
            this.waitTimer = window.setTimeout(tick, LOOK_AGAIN_MS);
        };
        tick();
    }

    // --- Copying. ---

    /** A press copies; with Shift, as a Markdown link. @param {Event} event */
    async onClick(event) {
        const button = event.target instanceof Element ? /** @type {HTMLButtonElement | null} */ (event.target.closest('[data-kp-anchor-mark]')) : null;
        if (!button || !this.host.contains(button)) return;
        const el = [...this.marks].find(([, b]) => b === button)?.[0];
        if (!el) return;
        await this.copyLink(el, button, event instanceof MouseEvent && event.shiftKey);
    }

    /** The `y l` provider: a way to copy the focused row's link, or null when no row of this container is focused. */
    copyFocused() {
        const active = this.doc.activeElement;
        if (!(active instanceof Element) || !this.host.contains(active)) return null;
        for (const [el, button] of this.marks) if (el.contains(active) && el.getAttribute('data-kp-anchored') === 'row') return () => void this.copyLink(el, button);
        return null;
    }

    /** @param {HTMLElement} el @param {HTMLButtonElement} button @param {boolean} [markdownWanted] */
    async copyLink(el, button, markdownWanted = false) {
        const view = this.view;
        const id = el.id;
        const hash = `#${encodeURIComponent(id)}`;
        const url = this.copyMode() === 'hash' ? hash : `${view.location.origin}${view.location.pathname}${view.location.search}${hash}`;
        const markdown = `[${nameOf(el)}](${url})`;
        const text = markdownWanted ? markdown : url;
        try {
            view.history.replaceState(null, '', hash);
        } catch {
            // Not every frame may write its address.
        }
        const ok = await copyText(this.doc, text);
        this.showCopied(el, button, ok);
        button.dispatchEvent(new CustomEvent(ANCHOR_COPY_EVENT, { bubbles: true, detail: { id, url, text, markdown, ok } }));
        this.timers.push(view.setTimeout(() => button.removeAttribute('data-kp-anchor-state'), this.copiedMs()));
    }

    /** The mark says Copied (a tick on a row) or that it failed, and the voice says it. @param {HTMLElement} el @param {HTMLButtonElement} button @param {boolean} ok */
    showCopied(el, button, ok) {
        const s = this.strings;
        button.setAttribute('data-kp-anchor-state', ok ? 'copied' : 'failed');
        const done = button.querySelector('.kp-anchor__done');
        const row = el.getAttribute('data-kp-anchored') === 'row';
        if (done) done.setAttribute('data-kp-text', ok ? (row ? '✓' : s.anchorCopied) : row ? '!' : s.anchorFailed);
        this.say(ok ? s.anchorCopiedAnnounce(nameOf(el)) : s.anchorFailedAnnounce);
    }
}
