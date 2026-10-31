// The notification centre as it is drawn: its model read through the host's options, and the render of the counter, the
// panel, the list, the plates and the source switches. The NoticesCentre in controller.js adds the wiring and the events.

import { openBusyCard } from '../busy-card.js';
import { Controller } from '../controller.js';
import { agoMoment } from '../freshness.js';
import { toast } from '../overlays.js';
import { statePlate } from '../state-plate.js';
import { getStrings } from '../strings.js';
import { TOAST_MS } from './events.js';
import { orderNotices, panelSlice, toMs } from './model.js';
import { make } from './parts.js';
import { noticeRow, sourceSwitch } from './row.js';

/** @typedef {import('../notices.js').Notice} Notice */
/** @typedef {import('../notices.js').NoticesModel} NoticesModel */
/** @typedef {import('../notices.js').NoticesHandle} NoticesHandle */

/** The length of the date `agoMoment` writes (`YYYY-MM-DD`), and where its time of day starts after the `T`. */
const DATE_LENGTH = 10;
const TIME_START = 11;

export class NoticesView extends Controller {
    /** @param {HTMLElement} el */
    constructor(el) {
        super(el);
        this.doc = el.ownerDocument;
        /** @type {NoticesModel} */
        this.model = { state: 'ready', items: [] };
        /** Keys read in this page, beside the ones the model says are read. */
        this.readKeys = new Set();
        /** The keys of the last refresh; null before the first, so the first list is not announced as new. @type {Set<string> | null} */
        this.seen = null;
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** The tab title without our count, and whether the count is in it now. */
        this.baseTitle = '';
        this.titled = false;
        /** The parts, built in connect(). @type {import('./parts.js').NoticeParts} */
        this.p = /** @type {any} */ (null);
    }

    // --- The model. ---

    look() {
        return this.host.getAttribute('data-kp-notices-look') ?? 'both';
    }
    isPage() {
        return this.look() === 'page';
    }
    /** The embedded read-only preview [homelab gap 26]: in the page like `page`, without the heading, Mark all read, Mark read and the switches. */
    isPreview() {
        return this.look() === 'preview';
    }
    /** Whether the list stands in the page (no counter, no panel). */
    inPage() {
        return this.isPage() || this.isPreview();
    }
    items() {
        return this.model.items ?? [];
    }
    /** @param {Notice} n */
    isRead(n) {
        return n.read === true || this.readKeys.has(n.key);
    }
    unread() {
        return this.items().filter((n) => !this.isRead(n));
    }
    /** The number the counter shows: `data-kp-count` when given, else the unread notices. */
    countNow() {
        const given = Number(this.host.getAttribute('data-kp-count'));
        return this.host.hasAttribute('data-kp-count') && Number.isFinite(given) ? given : this.unread().length;
    }
    ordered() {
        return orderNotices(this.items(), this.host.getAttribute('data-kp-order') === 'time' ? 'time' : 'severity');
    }
    /** The end of a quiet time still ahead [epoch ms], or null. */
    quiet() {
        const q = toMs(this.model.quietUntil);
        return q !== null && q > Date.now() ? q : null;
    }
    quietText() {
        const q = this.quiet();
        if (q === null) return '';
        const sameDay = agoMoment(q).slice(0, DATE_LENGTH) === agoMoment(Date.now()).slice(0, DATE_LENGTH);
        return getStrings().noticesQuiet(sameDay ? agoMoment(q).slice(TIME_START) : agoMoment(q));
    }
    counterText() {
        if (this.model.state === 'error') return '?';
        if (this.model.state === 'loading') return '…';
        const n = this.countNow();
        return n > 0 ? String(n) : '';
    }
    counterLabel() {
        const t = getStrings();
        if (this.model.state === 'error') return t.noticesCounterError(this.model.error ?? t.noticesErrorText);
        if (this.model.state === 'loading') return t.noticesLoading;
        const n = this.countNow();
        return n > 0 ? t.noticesUnread(n) : t.noticesNoneUnread;
    }

    /** @param {NoticesModel} next */
    set(next) {
        this.model = { ...this.model, ...next };
        const keys = new Set(this.items().map((n) => n.key));
        const seen = this.seen;
        if (seen !== null) this.announce(this.items().filter((n) => !seen.has(n.key) && !this.isRead(n)));
        this.seen = keys;
        if (next.state === undefined && (this.model.items?.length ?? 0) === 0 && this.model.state === 'ready') this.model.state = 'empty';
        this.render();
    }

    // --- Rendering. ---

    render() {
        const t = getStrings();
        const st = this.model.state ?? 'ready';
        this.host.setAttribute('data-kp-state', st);
        this.renderHead(t, st);
        const focus = this.focusNow();
        this.renderList(t, st);
        this.renderBusy(t, st);
        this.renderSources(t);
        this.restoreFocus(focus);
        this.paintTitle();
    }

    /** The counter, the quiet line and the panel's head and foot. @param {ReturnType<typeof getStrings>} t @param {string} st */
    renderHead(t, st) {
        const p = this.p;
        const q = this.quiet();
        this.host.toggleAttribute('data-kp-quiet', q !== null);
        // The counter: exact, with a place of its own width.
        const text = this.counterText();
        p.badge.textContent = text || '0';
        p.badge.classList.toggle('kp-notices__count--zero', !text);
        p.badge.setAttribute('data-kp-count', text);
        p.triggerLabel.textContent = t.noticesInbox;
        p.trigger.setAttribute('aria-label', t.noticesCounterName(t.noticesInbox, this.counterLabel(), q !== null ? this.quietText() : ''));
        p.moon.hidden = q === null;
        p.quietLine.textContent = this.quietText();
        p.quietLine.hidden = q === null;
        p.endQuiet.textContent = t.noticesEndQuiet;
        p.endQuiet.hidden = q === null;
        p.heading.textContent = this.isPage() ? t.noticesPageTitle : t.noticesTitle;
        p.readAll.textContent = t.noticesReadAll;
        p.readAll.disabled = this.unread().length === 0 || st !== 'ready';
        p.inbox.textContent = t.noticesAllInInbox(this.items().length);
        p.inbox.href = this.host.getAttribute('data-kp-inbox-href') ?? '#';
        // The preview links to the full Inbox only when the page says where it is.
        p.foot.hidden = !(this.look() === 'both' || (this.isPreview() && this.host.hasAttribute('data-kp-inbox-href')));
    }

    /** The rows when ready, else the empty or error plate in their place. @param {ReturnType<typeof getStrings>} t @param {string} st */
    renderList(t, st) {
        const { list, state } = this.p;
        const visible = this.isPage() ? this.ordered() : panelSlice(this.ordered(), this.host.getAttribute('data-kp-panel-max'));
        const readOnly = this.isPreview();
        list.replaceChildren(...(st === 'ready' ? visible.map((n) => noticeRow(this.doc, t, n, this.isRead(n), readOnly)) : []));
        list.hidden = st !== 'ready';
        state.hidden = st === 'ready' || st === 'loading';
        if (st === 'empty') state.replaceChildren(statePlate(this.doc, { kind: 'empty', title: t.noticesEmpty, text: t.noticesEmptyText }));
        else if (st === 'error') state.replaceChildren(this.errorPlate(t));
        else state.replaceChildren();
    }

    /** @param {ReturnType<typeof getStrings>} t */
    errorPlate(t) {
        return statePlate(this.doc, {
            kind: 'error',
            title: t.noticesErrorTitle,
            text: this.model.error ?? t.noticesErrorText,
            actionLabel: t.noticesRetry,
            actionAttribute: 'data-kp-notices-retry',
        });
    }

    /** The theme's busy card over the list while loading. @param {ReturnType<typeof getStrings>} t @param {string} st */
    renderBusy(t, st) {
        const body = this.p.body;
        body.setAttribute('aria-busy', String(st === 'loading'));
        if (st === 'loading' && !this.busy)
            this.busy = openBusyCard(body, { words: t.noticesLoading, area: () => [body], className: 'kp-notices__busy', arrive: false });
        else if (st !== 'loading' && this.busy) {
            const b = this.busy;
            this.busy = null;
            void b.close();
        }
    }

    /** A switch per source, on the Inbox page only. @param {ReturnType<typeof getStrings>} t */
    renderSources(t) {
        const box = this.p.sourcesBox;
        box.replaceChildren();
        const sources = this.model.sources ?? [];
        box.hidden = !this.isPage() || sources.length === 0;
        if (!sources.length) return;
        box.append(make(this.doc, 'strong', 'kp-notices__sources-title', t.noticesSources));
        for (const src of sources) box.append(sourceSwitch(this.doc, t, src));
    }

    /** Which row, and which of its controls, has the focus before a render replaces the rows. */
    focusNow() {
        const active = this.doc.activeElement;
        if (!(active instanceof HTMLElement)) return { key: null, control: '' };
        const key = active.closest('.kp-notices__item')?.getAttribute('data-kp-key') ?? null;
        const control = active.getAttribute('data-kp-notice-fix') !== null ? 'fix' : active.getAttribute('data-kp-notice-read') !== null ? 'read' : '';
        return { key, control };
    }

    /** Keep the focus where it was across a live refresh. @param {{ key: string | null, control: string }} focus */
    restoreFocus({ key, control }) {
        if (!key) return;
        const again = this.p.list.querySelector(`[data-kp-key="${CSS.escape(key)}"]`);
        if (!(again instanceof HTMLElement)) return;
        const target = control ? again.querySelector(control === 'fix' ? '[data-kp-notice-fix]' : '[data-kp-notice-read]') : again;
        if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }

    /** "(5) " in front of the tab title while there are unread notices, unless `data-kp-count-in-title="off"`; a preview leaves it alone. */
    paintTitle() {
        if (this.host.getAttribute('data-kp-count-in-title') === 'off' || this.isPreview()) return;
        const n = this.model.state === 'ready' ? this.countNow() : 0;
        if (!this.titled && n > 0) this.baseTitle = this.doc.title;
        if (n > 0) this.doc.title = `(${n}) ${this.baseTitle}`;
        else if (this.titled) this.doc.title = this.baseTitle;
        this.titled = n > 0;
    }

    /** New notices are announced once, critical ones assertively; a toast for the severe ones. @param {Notice[]} fresh */
    announce(fresh) {
        const worst = fresh.find((n) => n.severity === 'critical') ?? fresh[0];
        if (!worst) return;
        const t = getStrings();
        this.p.voice.setAttribute('role', worst.severity === 'critical' ? 'alert' : 'status');
        this.p.voice.textContent = fresh.length > 1 ? t.noticesNewMany(fresh.length, worst.title) : t.noticesNew(worst.title);
        // A preview stands beside the page's own counter, which already toasts: it toasts only when its attribute asks.
        const mode = this.host.getAttribute('data-kp-toast-new') ?? (this.isPreview() ? 'none' : 'severe');
        const toasted = mode === 'all' ? fresh : mode === 'severe' ? fresh.filter((n) => n.severity === 'critical') : [];
        for (const n of toasted) toast(n.title, { live: n.severity === 'critical' ? 'assertive' : 'polite', close: true, ms: TOAST_MS });
    }
}
