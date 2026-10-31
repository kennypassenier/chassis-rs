// One banner: the state it shows, the grace before a drop shows, the automatic tries with their countdown, and "Connected again" leaving.

import { Controller } from '../controller.js';
import { arriveShown, leave } from '../motion.js';
import { humanDuration } from '../freshness.js';
import { getStrings } from '../strings.js';
import { backMsOf, delaysOf, graceOf, sourceOf } from './options.js';
import { buildBanner, make } from './parts.js';
import { textFor } from './text.js';
import { CONNECTION_RETRY_EVENT, CONNECTION_STATES, CONNECTION_STATE_EVENT, SECOND_MS, TICK_MS } from './values.js';

/** @typedef {import('../connection.js').ConnectionState} ConnectionState */
/** @typedef {import('../connection.js').ConnectionDetail} ConnectionDetail */

export class ConnectionBanner extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.doc = host.ownerDocument;
        this.view = /** @type {Window} */ (this.doc.defaultView);
        this.parts = buildBanner(this.doc);
        /** @type {ConnectionState} */
        this.shown = 'online';
        this.pending = Number(host.getAttribute('data-kp-pending') ?? 0) || 0;
        this.attempt = 0;
        this.nextAt = 0;
        this.graceTimer = 0;
        this.backTimer = 0;
        this.tickTimer = 0;
        this.leaving = false;
        this.refusedWhy = '';
        /** What the page gets back, the same object every time. @type {import('../connection.js').ConnectionHandle} */
        this.handle = { element: host, state: () => this.shown, set: (state, detail) => this.set(state, detail) };
    }

    connect() {
        const el = this.host;
        const { band, retry, voice } = this.parts;
        el.classList.add('kp-connection');
        el.hidden = true;
        el.replaceChildren(band, voice);
        if (el.getAttribute('data-kp-placement') !== 'top') el.setAttribute('data-kp-placement', 'bottom');
        this.listen(retry, 'click', () => {
            if (this.shown === 'offline' || this.shown === 'refused') this.tryNow(false);
        });
        this.listen(this.view, 'offline', () => {
            if (sourceOf(el) !== 'app') this.set('offline');
        });
        this.listen(this.view, 'online', () => {
            if (sourceOf(el) !== 'app') this.set('online');
        });
        // Registered after the listeners, so it runs first on detach: the timers stop.
        this.own(() => {
            this.view.clearTimeout(this.graceTimer);
            this.view.clearTimeout(this.backTimer);
            this.stopTick();
        });
        if (sourceOf(el) !== 'app' && this.view.navigator.onLine === false) this.set('offline');
    }

    stopTick() {
        this.view.clearInterval(this.tickTimer);
        this.tickTimer = 0;
    }

    pendingText() {
        return this.pending > 0 ? getStrings().connPending(this.pending) : '';
    }

    /** The time to the next try is redrawn; when it has come, the try is made. */
    countdown() {
        const left = Math.max(0, Math.ceil((this.nextAt - Date.now()) / SECOND_MS));
        const pendingText = this.pendingText();
        this.parts.meta.textContent =
            pendingText + (this.shown === 'offline' && this.nextAt ? `${pendingText ? ' · ' : ''}${getStrings().connNextTry(humanDuration(left, getStrings()))}` : '');
        if (this.nextAt && Date.now() >= this.nextAt && this.shown === 'offline') {
            this.nextAt = 0;
            this.stopTick();
            this.tryNow(true);
        }
    }

    /** @param {boolean} auto */
    tryNow(auto) {
        this.attempt += 1;
        this.stopTick();
        this.nextAt = 0;
        this.draw('reconnecting');
        this.host.dispatchEvent(new CustomEvent(CONNECTION_RETRY_EVENT, { bubbles: true, detail: { attempt: this.attempt, auto } }));
    }

    /** The automatic try is planned: after the next delay, the last one repeating. */
    scheduleTry() {
        const list = delaysOf(this.host);
        if (!list.length || this.host.getAttribute('data-kp-retry-delays') === 'off') return;
        const wait = list[Math.min(this.attempt, list.length - 1)] ?? list[0] ?? 3;
        this.nextAt = Date.now() + wait * SECOND_MS;
        this.stopTick();
        this.countdown();
        this.tickTimer = this.view.setInterval(() => this.countdown(), TICK_MS);
    }

    /** The band's tone and mark for a state. @param {ConnectionState} state */
    paintBand(state) {
        const { band, mark } = this.parts;
        band.classList.toggle('kp-alert--warning', state === 'offline' || state === 'reconnecting');
        band.classList.toggle('kp-alert--success', state === 'back');
        band.classList.toggle('kp-alert--destructive', state === 'refused');
        mark.replaceChildren();
        if (state === 'reconnecting') mark.append(make(this.doc, 'span', 'kp-spinner'));
        else mark.textContent = state === 'back' ? '✓' : '!';
    }

    /** @param {ConnectionState} state */
    draw(state) {
        const el = this.host;
        const { title, why, meta, retry, voice } = this.parts;
        const previous = this.shown;
        this.shown = state;
        el.setAttribute('data-kp-state', state);
        this.paintBand(state);
        const t = getStrings();
        const text = textFor(t, state, this);
        title.textContent = text[0] ?? '';
        why.textContent = text[1] ?? '';
        meta.textContent = state === 'back' ? '' : this.pendingText();
        retry.textContent = t.connRetry;
        retry.hidden = el.getAttribute('data-kp-retry') === 'off';
        retry.toggleAttribute('data-kp-idle', state === 'back' || state === 'reconnecting');
        retry.tabIndex = state === 'back' || state === 'reconnecting' ? -1 : 0;
        retry.disabled = false;
        if (state === 'offline') this.scheduleTry();
        if (el.getAttribute('data-kp-announce') !== 'off') {
            voice.setAttribute('role', state === 'offline' ? 'alert' : 'status');
            voice.textContent = `${text[0]}. ${text[1]}`;
        }
        if (previous !== state) el.dispatchEvent(new CustomEvent(CONNECTION_STATE_EVENT, { bubbles: true, detail: { state, previous, pending: this.pending } }));
    }

    show() {
        const el = this.host;
        this.view.clearTimeout(this.backTimer);
        if (this.leaving) el.removeAttribute('data-kp-leaving');
        this.leaving = false;
        this.parts.band.hidden = false;
        if (el.hidden) {
            el.hidden = false;
            arriveShown(this.parts.band);
        }
    }

    hide() {
        const el = this.host;
        const { band } = this.parts;
        if (el.hidden || this.leaving) return;
        this.leaving = true;
        el.setAttribute('data-kp-leaving', '');
        void leave(band, { hide: true }).then(() => {
            if (this.destroyed) return;
            if (!this.leaving) {
                band.hidden = false;
                return;
            }
            this.leaving = false;
            el.removeAttribute('data-kp-leaving');
            el.hidden = true;
            band.hidden = false;
        });
    }

    /** The app reports what it sees. @param {ConnectionState} state @param {ConnectionDetail} [detail] */
    set(state, detail = {}) {
        if (!CONNECTION_STATES.includes(state)) return;
        if (detail.pending !== undefined) this.pending = Math.max(0, Math.round(detail.pending));
        if (detail.attempt !== undefined) this.attempt = detail.attempt;
        this.refusedWhy = detail.why ?? (state === 'refused' ? this.refusedWhy : '');
        this.view.clearTimeout(this.graceTimer);
        this.graceTimer = 0;
        if (state === 'offline' || state === 'refused' || state === 'reconnecting') this.setTrouble(state);
        else if (state === 'online') this.setOnline();
    }

    /** Offline, refused or reconnecting: shown now, or after the grace for a short drop. @param {ConnectionState} state */
    setTrouble(state) {
        const grace = graceOf(this.host);
        if (state === 'offline' && this.shown === 'online' && grace > 0) {
            // A drop shorter than the grace shows nothing.
            this.graceTimer = this.view.setTimeout(() => {
                this.show();
                this.draw('offline');
            }, grace);
            return;
        }
        if (state === 'refused') this.attempt = 0;
        this.show();
        this.draw(state);
    }

    /** Back online: "Connected again" for a moment, when anything was shown. */
    setOnline() {
        const el = this.host;
        this.stopTick();
        this.nextAt = 0;
        const wasShown = this.shown !== 'online' && !el.hidden;
        this.attempt = 0;
        if (!wasShown) {
            this.shown = 'online';
            return;
        }
        this.show();
        this.draw('back');
        this.backTimer = this.view.setTimeout(() => {
            this.shown = 'online';
            el.setAttribute('data-kp-state', 'online');
            this.hide();
            el.dispatchEvent(new CustomEvent(CONNECTION_STATE_EVENT, { bubbles: true, detail: { state: 'online', previous: 'back', pending: this.pending } }));
        }, backMsOf(el));
    }
}
