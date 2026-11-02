// The state of one automatic refresh control, its painting and its schedule: the interval, the timer with its back-off, a refresh in progress.

import { Controller } from '../controller.js';
import { humanDuration, setAgo } from '../freshness.js';
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
} from './constants.js';
import { BarLabels } from './labels.js';
import { blockedReason, regionRefresh } from './region.js';
import { numbers } from './words.js';

/** The state, painting and schedule of one `[data-kp-refresh]` control; the events build on it. */
export class RefreshBase extends Controller {
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

    /** Whether a refresh is owed on return (one was missed while hidden, or its time came); clears the mark and sets the reason. */
    takeReturnDue() {
        if (!this.missedWhileHidden && this.clock() < this.dueAt) return false;
        this.missedWhileHidden = false;
        this.reason = 'return';
        return true;
    }
}
