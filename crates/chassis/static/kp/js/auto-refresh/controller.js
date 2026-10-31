// One automatic refresh control: the interval, the schedule with its back-off, what makes a refresh wait, and the events [kpadopt5-ops].

import { Controller } from '../controller.js';
import { humanDuration, setAgo } from '../freshness.js';
import { watchOptions } from '../live-options.js';
import { memoryFor } from '../remember.js';
import { getStrings } from '../strings.js';
import { buildBar } from './bar.js';
import { Chooser } from './chooser.js';
import {
    BLOCKED_RETRY_MS,
    MAX_BACKOFF_POWER,
    MIN_STALE_S,
    REFRESH_CHOICES,
    REFRESH_DEFAULT,
    REFRESH_EVENT,
    REFRESH_INTERVAL_EVENT,
    SECOND_MS,
    STALE_INTERVALS,
    WATCHED_ATTRIBUTES,
} from './constants.js';
import { BarLabels } from './labels.js';
import { blockedReason, regionRefresh } from './region.js';
import { numbers } from './words.js';

/** The controller of one `[data-kp-refresh]` control. */
export class RefreshController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {{ now?: () => number }} [options] `now` so a test never reads the real clock
     */
    constructor(host, options = {}) {
        super(host, options);
        this.doc = host.ownerDocument;
        this.view = /** @type {Window} */ (this.doc.defaultView);
        this.clock = options.now ?? (() => Date.now());
        this.memory = memoryFor(host, 'refresh');
        this.parts = buildBar(this.doc);
        this.chooser = new Chooser(host, this.parts.chooser);
        this.labels = new BarLabels(host, this.parts.bar);
        this.interval = this.startInterval();
        this.busy = false;
        this.failures = 0;
        /** @type {'timer' | 'now' | 'retry' | 'return'} */
        this.reason = 'timer';
        this.dueAt = 0;
        this.timer = 0;
        /** @type {number | null} */
        this.updatedAt = null;
        this.missedWhileHidden = false;
        /** What a page gets back from refreshOf(). @type {import('./constants.js').RefreshHandle} */
        this.handle = {
            element: host,
            interval: () => this.interval,
            setInterval: (seconds, by) => this.setInterval(seconds, by),
            now: (why) => this.refreshNow(why),
            done: (ok) => this.finish(ok),
        };
    }

    /** The interval the control opens with: the attribute, else the default, else what the device remembered. */
    startInterval() {
        const start = Number(this.host.getAttribute('data-kp-refresh') ?? REFRESH_DEFAULT);
        let interval = Number.isFinite(start) && start >= 0 ? Math.round(start) : REFRESH_DEFAULT;
        const remembered = this.memory?.read('value', null);
        if (typeof remembered === 'number' && remembered >= 0) interval = remembered;
        return interval;
    }

    /** The seconds offered. */
    choices() {
        return numbers(this.host.getAttribute('data-kp-refresh-choices'), REFRESH_CHOICES);
    }

    /** `event` (the app fetches), `page` (reload) or `region` (swap one element). */
    mode() {
        return this.host.getAttribute('data-kp-refresh-mode') ?? 'event';
    }

    connect() {
        const el = this.host;
        const { bar, count, custom, failure } = this.parts;
        el.classList.add('kp-refresh');
        this.chooser.build();
        this.labels.paintLabel();
        this.labels.paintTitle();
        el.replaceChildren(bar, count, custom, failure);
        this.chooser.wire();
        this.own(() => this.chooser.unwire?.());
        this.own(() => this.view.clearTimeout(this.timer));
        this.wireEvents();
        this.own(watchOptions(el, WATCHED_ATTRIBUTES, (names) => this.onOptions(names)));
        this.paintChoice();
        this.paintAgo();
        this.schedule();
    }

    /** Listen to the chooser, the custom form, the buttons, the R key and the tab's visibility. */
    wireEvents() {
        const { custom, now, retry } = this.parts;
        const picked = (/** @type {Event} */ event) => this.onPicked(/** @type {CustomEvent} */ (event));
        this.listen(this.host, 'kp-menu-select', picked);
        this.listen(this.host, 'kp-segmented-change', picked);
        this.listen(custom, 'submit', (event) => this.onCustomSubmit(/** @type {SubmitEvent} */ (event)));
        custom.addEventListener('keydown', (event) => this.onCustomKey(event));
        this.listen(now, 'click', () => this.refreshNow('now'));
        this.listen(retry, 'click', () => this.refreshNow('retry'));
        this.listen(this.doc, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.doc, 'visibilitychange', () => this.onVisible());
    }

    // --- Painting. ---
    staleAfter() {
        const own = Number(this.host.getAttribute('data-kp-stale-after'));
        return Number.isFinite(own) && own > 0 ? own : Math.max(MIN_STALE_S, STALE_INTERVALS * (this.interval || REFRESH_DEFAULT));
    }

    paintAgo() {
        const { ago } = this.parts;
        ago.setAttribute('data-kp-stale-after', String(this.staleAfter()));
        ago.setAttribute('data-kp-ago-announce', this.host.getAttribute('data-kp-announce') === 'off' ? 'off' : 'state');
        setAgo(ago, this.updatedAt);
    }

    paintChoice() {
        this.chooser.paint(this.choices(), this.interval);
    }

    /** Restart the thin rule that runs down to the next refresh. */
    runBar() {
        const { count } = this.parts;
        const ms = Math.max(0, this.dueAt - this.clock());
        count.style.setProperty('--kp-refresh-ms', `${ms}ms`);
        count.removeAttribute('data-kp-run');
        void count.offsetWidth;
        if (this.interval > 0 && !this.busy) count.setAttribute('data-kp-run', '');
    }

    // --- Schedule. ---
    /** The wait before the next try: the interval, then twice, four times, then that. */
    delayNow() {
        return (this.failures > 0 ? this.interval * 2 ** Math.min(this.failures - 1, MAX_BACKOFF_POWER) : this.interval) * SECOND_MS;
    }

    /** Arm the timer for the next refresh. @param {number} [ms] */
    schedule(ms = this.delayNow()) {
        this.view.clearTimeout(this.timer);
        if (this.interval <= 0) {
            this.parts.count.removeAttribute('data-kp-run');
            return;
        }
        this.dueAt = this.clock() + ms;
        this.timer = this.view.setTimeout(() => this.fire(), ms);
        this.runBar();
    }

    /** The app's answer to the refresh in progress. @param {boolean} ok */
    finish(ok) {
        if (!this.busy) return;
        const { busyWords, line, failure, retry, note } = this.parts;
        const s = getStrings();
        this.busy = false;
        this.host.removeAttribute('aria-busy');
        busyWords.hidden = true;
        line.removeAttribute('data-kp-busy');
        if (ok) {
            this.failures = 0;
            this.updatedAt = this.clock();
            failure.hidden = true;
            retry.hidden = true;
        } else {
            this.failures += 1;
            // Paused, nothing retries by itself: the note says only that it failed, and Retry now stays [live-options-1019].
            note.textContent = this.interval <= 0 ? s.refreshFailedPaused : s.refreshFailed(humanDuration(Math.round(this.delayNow() / SECOND_MS), s));
            failure.hidden = false;
            retry.hidden = false;
        }
        // The ago line turns stale by its own clock; make sure it is checked now.
        this.paintAgo();
        this.schedule();
    }

    /**
     * Refresh. The timer calls it with no argument and only runs while an interval is set; "Refresh now", the R key and
     * "Retry now" call it as `manual` and always work, paused or not, and never wait for a dialog or a field: the person asked.
     * @param {boolean} [manual]
     */
    fire(manual = false) {
        if (this.busy || (this.interval <= 0 && !manual)) return;
        const why = manual ? '' : blockedReason(this.host);
        if (why === 'hidden') {
            this.missedWhileHidden = true;
            return;
        }
        if (why) {
            this.timer = this.view.setTimeout(() => this.fire(), BLOCKED_RETRY_MS);
            return;
        }
        const reason = this.reason;
        this.reason = 'timer';
        this.markBusy();
        const mode = this.mode();
        if (mode === 'page') {
            this.view.location.reload();
            return;
        }
        if (mode === 'region') {
            void regionRefresh(this.host).then(
                (ok) => this.finish(ok),
                () => this.finish(false),
            );
            return;
        }
        this.askApp(reason);
    }

    /** The control is working: busy marks, "updating…" in the line's place, the rule stopped. */
    markBusy() {
        const { busyWords, line, count } = this.parts;
        this.busy = true;
        this.host.setAttribute('aria-busy', 'true');
        busyWords.hidden = false;
        line.setAttribute('data-kp-busy', '');
        count.removeAttribute('data-kp-run');
    }

    /** Fire `kp-refresh`; the app answers once with `detail.done(ok)`. @param {'timer' | 'now' | 'retry' | 'return'} reason */
    askApp(reason) {
        let answered = false;
        this.host.dispatchEvent(
            new CustomEvent(REFRESH_EVENT, {
                bubbles: true,
                detail: {
                    reason,
                    interval: this.interval,
                    done: (/** @type {boolean} */ ok = true) => {
                        if (answered) return;
                        answered = true;
                        this.finish(ok);
                    },
                },
            }),
        );
    }

    /** Set the interval (any whole number of seconds; 0 pauses). @param {number} seconds @param {'user' | 'script'} [by] */
    setInterval(seconds, by = 'script') {
        const next = Math.max(0, Math.round(Number(seconds)));
        if (!Number.isFinite(next)) return;
        this.interval = next;
        this.memory?.write('value', this.interval);
        this.failures = 0;
        this.parts.failure.hidden = true;
        this.host.toggleAttribute('data-kp-paused', this.interval === 0);
        this.paintChoice();
        this.paintAgo();
        if (!this.busy) this.schedule();
        this.host.dispatchEvent(new CustomEvent(REFRESH_INTERVAL_EVENT, { bubbles: true, detail: { seconds: this.interval, by } }));
    }

    /** Refresh at once. @param {'now' | 'retry'} [why] */
    refreshNow(why = 'now') {
        if (this.busy) return;
        this.reason = why;
        this.view.clearTimeout(this.timer);
        this.fire(true);
    }

    // --- Events. ---
    /** The chooser picked a value: "other" opens the custom form. @param {CustomEvent} event */
    onPicked(event) {
        const { custom, input } = this.parts;
        const value = event.detail?.value;
        if (value === undefined || value === null) return;
        if (value === 'other') {
            custom.hidden = false;
            input.value = String(this.interval || REFRESH_DEFAULT);
            input.focus();
            input.select();
            return;
        }
        custom.hidden = true;
        this.setInterval(Number(value), 'user');
    }

    /** @param {SubmitEvent} event */
    onCustomSubmit(event) {
        const { custom, input, problem } = this.parts;
        event.preventDefault();
        const n = Number(input.value);
        if (!Number.isInteger(n) || n < 1) {
            problem.textContent = getStrings().refreshInvalid;
            input.setAttribute('aria-invalid', 'true');
            input.focus();
            return;
        }
        problem.textContent = '';
        input.removeAttribute('aria-invalid');
        custom.hidden = true;
        this.setInterval(n, 'user');
    }

    /** Escape closes the custom form and gives the focus back to the chooser. @param {KeyboardEvent} event */
    onCustomKey(event) {
        if (event.key !== 'Escape') return;
        this.parts.custom.hidden = true;
        this.chooser.focusTarget()?.focus?.();
    }

    /** The R key refreshes now, except inside a field. @param {KeyboardEvent} event */
    onKey(event) {
        if (event.key !== 'r' && event.key !== 'R') return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (this.host.getAttribute('data-kp-refresh-key') === 'off') return;
        const t = event.target;
        if (t instanceof HTMLElement && t.matches('input, textarea, select, [contenteditable]')) return;
        this.refreshNow('now');
    }

    /** Hidden: stop. Visible again: refresh once if one was due, else wait out the rest. */
    onVisible() {
        if (this.doc.visibilityState === 'hidden') {
            this.view.clearTimeout(this.timer);
            this.parts.count.removeAttribute('data-kp-run');
            return;
        }
        if (this.interval > 0 && !this.busy) {
            if (this.missedWhileHidden || this.clock() >= this.dueAt) {
                this.missedWhileHidden = false;
                this.reason = 'return';
                this.fire();
            } else this.schedule(Math.max(0, this.dueAt - this.clock()));
        }
    }

    /**
     * The options are read again when their attribute changes [live-options-1019]: the look redraws the chooser (segments or a
     * menu), the choices and the freshness line follow their attributes, and a new `data-kp-refresh` sets the interval.
     * @param {string[]} names
     */
    onOptions(names) {
        if (names.includes('data-kp-refresh-title')) this.labels.paintTitle();
        if (names.includes('data-kp-refresh-label')) this.labels.paintLabel();
        if (names.includes('data-kp-look') && this.chooser.look() !== this.chooser.drawnLook) this.chooser.redraw(this.choices(), this.interval);
        if (names.includes('data-kp-refresh-choices')) this.paintChoice();
        if (names.includes('data-kp-stale-after') || names.includes('data-kp-announce')) this.paintAgo();
        if (names.includes('data-kp-refresh')) {
            const next = Number(this.host.getAttribute('data-kp-refresh'));
            if (Number.isFinite(next) && next >= 0 && Math.round(next) !== this.interval) this.setInterval(next, 'script');
        }
    }
}
