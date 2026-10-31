// One notification centre: the NoticesView wired to its host, plus the clicks, the source switches, the panel's toggle and the keys.

import { getStrings } from '../strings.js';
import {
    G_I_WINDOW_MS,
    NOTICE_FIX_EVENT,
    NOTICE_READ_EVENT,
    NOTICES_END_QUIET_EVENT,
    NOTICES_INBOX_EVENT,
    NOTICES_READ_ALL_EVENT,
    NOTICES_RETRY_EVENT,
    NOTICES_SOURCE_EVENT,
} from './events.js';
import { buildParts, mountParts } from './parts.js';
import { NoticesView } from './view.js';

/** Numbers the panels of a page, so each counter anchors its own panel. */
let idSeq = 0;

export class NoticesCentre extends NoticesView {
    /** @param {HTMLElement} el */
    constructor(el) {
        super(el);
        /** When `g` was last pressed [ms], for the g-then-i shortcut. */
        this.gAt = 0;
        /** What noticesOf(el) hands the page. @type {import('../notices.js').NoticesHandle} */
        this.handle = { element: el, set: (m) => this.set(m), count: () => this.countNow(), open: () => this.p.panel.showPopover?.() };
    }

    connect() {
        const el = this.host;
        el.classList.add('kp-notices');
        this.p = buildParts(this.doc, `kp-notices-${(idSeq += 1)}`, getStrings().noticesList);
        mountParts(el, this.p, this.inPage(), this.isPreview());
        // Registered first, so it runs last: the busy card goes and the tab title is put back once the listeners are gone.
        this.own(() => {
            this.busy?.remove();
            if (this.titled) this.doc.title = this.baseTitle;
        });
        this.listen(el, 'click', (event) => this.onClick(event));
        this.listen(el, 'change', (event) => this.onChange(event));
        this.listen(this.p.panel, 'toggle', (event) => this.onToggle(/** @type {ToggleEvent} */ (event)));
        this.listen(this.doc, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.render();
    }

    // --- Events. ---

    /** @param {string} type @param {object} detail @param {boolean} [cancelable] */
    emit(type, detail, cancelable = false) {
        return this.host.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable, detail }));
    }

    /** @param {Event} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const fix = target.closest('[data-kp-notice-fix]');
        if (fix) return void this.emit(NOTICE_FIX_EVENT, { key: fix.getAttribute('data-kp-notice-fix') });
        const mark = target.closest('[data-kp-notice-read]');
        if (mark) return this.toggleRead(mark.getAttribute('data-kp-notice-read') ?? '');
        if (target.closest('.kp-notices__read-all')) this.readAll();
        else if (target.closest('.kp-notices__end-quiet')) this.emit(NOTICES_END_QUIET_EVENT, {});
        else if (target.closest('[data-kp-notices-retry]')) this.emit(NOTICES_RETRY_EVENT, {});
        else if (target.closest('.kp-notices__inbox')) {
            const go = this.emit(NOTICES_INBOX_EVENT, {}, true);
            if (!go || this.p.inbox.getAttribute('href') === '#') event.preventDefault();
        }
    }

    /** Mark one notice read, or unread again. @param {string} key */
    toggleRead(key) {
        const found = this.items().find((n) => n.key === key);
        const now = !this.readKeys.has(key) && !found?.read;
        if (now) this.readKeys.add(key);
        else {
            this.readKeys.delete(key);
            if (found) found.read = false;
        }
        this.render();
        this.emit(NOTICE_READ_EVENT, { key, read: now });
    }

    readAll() {
        for (const n of this.items()) this.readKeys.add(n.key);
        this.render();
        this.emit(NOTICES_READ_ALL_EVENT, {});
    }

    /** A source switch flipped. @param {Event} event */
    onChange(event) {
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        if (!input?.hasAttribute('data-kp-source')) return;
        const key = input.getAttribute('data-kp-source') ?? '';
        const found = (this.model.sources ?? []).find((x) => x.key === key);
        if (found) found.muted = input.checked;
        const stateWord = input.parentElement?.querySelector('.kp-notices__source-state');
        if (stateWord) stateWord.textContent = input.checked ? getStrings().noticesMuted : getStrings().noticesNotMuted;
        this.emit(NOTICES_SOURCE_EVENT, { source: key, muted: input.checked });
    }

    /** With `data-kp-read="on-open"`, opening the panel reads everything. @param {ToggleEvent} event */
    onToggle(event) {
        if (event.newState === 'open' && this.host.getAttribute('data-kp-read') === 'on-open' && this.unread().length) this.readAll();
    }

    /** The keys: g then i opens the Inbox, m marks the focused notice read. @param {KeyboardEvent} event */
    onKey(event) {
        if (this.host.getAttribute('data-kp-keys') === 'off' || event.ctrlKey || event.metaKey || event.altKey) return;
        const t = event.target;
        if (t instanceof HTMLElement && t.matches('input, textarea, select, [contenteditable]')) return;
        if (event.key === 'g') this.gAt = Date.now();
        else if (event.key === 'i' && Date.now() - this.gAt < G_I_WINDOW_MS) {
            this.gAt = 0;
            this.emit(NOTICES_INBOX_EVENT, {});
        } else if (event.key === 'm') {
            const row = t instanceof HTMLElement ? t.closest('.kp-notices__item') : null;
            if (row && this.host.contains(row)) row.querySelector('[data-kp-notice-read]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
    }
}
