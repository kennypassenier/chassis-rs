// One countdown: its options, its clock, its digits and controls, the visibility catch-up and the live option watcher [kpadopt4-ideas].

import { Controller } from '../controller.js';
import { setStateWord } from '../components.js';
import { watchOptions } from '../live-options.js';
import { getStrings } from '../strings.js';
import { COUNTDOWN_END_EVENT, COUNTDOWN_EVENT, COUNTDOWN_STEP, HOUR_MS, HOUR_S, SECOND_MS, WATCHED_ATTRIBUTES } from './constants.js';
import { countdownClock } from './clock.js';
import { Digits } from './digits.js';
import { formatCountdown, parseDuration } from './duration.js';
import { buildParts, timerButton } from './parts.js';
import { parseUntil } from './until.js';
import { timerZone } from './zones.js';

/** The controller of one `[data-kp-countdown]` timer. */
export class CountdownController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {{ now?: () => number, wall?: () => number }} [options] `now` is the clock's (performance.now), `wall` the device's
     *   date and time (Date.now), which an `until` option is counted against
     */
    constructor(host, options = {}) {
        super(host, options);
        this.strings = getStrings();
        this.doc = host.ownerDocument;
        this.wallNow = options.wall ?? (() => Date.now());
        this.parts = buildParts(this.doc);
        this.digits = new Digits(this.parts.digits);
        // The options, read again when an attribute changes.
        this.seconds = 0;
        this.step = COUNTDOWN_STEP;
        this.name = '';
        this.disabled = false;
        this.bare = false;
        this.daysOn = true;
        /** The moment the timer counts down to, epoch ms, when the `until` option names one. @type {number | null} */
        this.until = null;
        /** Whether the timer shows hours (it holds an hour or more). */
        this.hours = false;
        /** The animation frame of the running loop. */
        this.frame = 0;
        /** @type {ReturnType<typeof timerButton> | null} */
        this.go = null;
        /** @type {ReturnType<typeof timerButton> | null} */
        this.more = null;
        /** @type {ReturnType<typeof timerButton> | null} */
        this.reset = null;
        /** @type {HTMLElement | null} */
        this.controls = null;
        /** The clock a page drives from countdownOf(). @type {import('./constants.js').CountdownClock | undefined} */
        this.clock = undefined;
    }

    /** The clock, which exists from `connect()` on. */
    get timer() {
        return /** @type {import('./constants.js').CountdownClock} */ (this.clock);
    }

    /** Read the options from the attributes. */
    read() {
        const el = this.host;
        const at = this.wallNow();
        this.until = parseUntil(el.dataset.kpCountdownUntil, at, timerZone(el, 'data-kp-countdown-timezone'));
        this.seconds = this.until !== null ? Math.max(0, Math.ceil((this.until - at) / SECOND_MS)) : parseDuration(el.dataset.kpCountdown);
        this.step = parseDuration(el.dataset.kpCountdownStep) || COUNTDOWN_STEP;
        this.name = el.dataset.kpCountdownName ?? '';
        this.disabled = el.hasAttribute('data-kp-countdown-disabled');
        this.daysOn = el.dataset.kpCountdownDays !== 'off';
        // A moment does not wait: counting down to one has no Start, no minute more and no Reset.
        this.bare = this.until !== null || el.dataset.kpCountdownControls === 'none';
    }

    connect() {
        const el = this.host;
        const { title, time, line, said } = this.parts;
        const doc = this.doc;
        el.classList.add('kp-countdown');
        this.read();
        el.replaceChildren(title, time, line, said);
        this.hours = this.seconds >= HOUR_S;
        this.clock = countdownClock({
            seconds: this.seconds,
            ...(this.options.now ? { now: /** @type {() => number} */ (this.options.now) } : {}),
            onChange: (state) => {
                if (state === 'ended') return; // the end has its own words and event, below
                this.changed(state);
            },
            onEnd: () => this.onEnd(),
        });
        this.own(() => this.undoDom());
        this.own(() => this.timer.stop());
        this.own(() => cancelAnimationFrame(this.frame));
        this.mountControls();
        this.show();
        this.speak();
        // Counting down to a moment starts at once; the clock then runs to it whatever the page does.
        this.startUntil();
        // A tab that slept keeps the device's clock, not the timer's: when it is visible again the moment is counted anew.
        this.listen(doc, 'visibilitychange', () => this.onVisible());
        this.own(watchOptions(el, WATCHED_ATTRIBUTES, (names) => this.onOptions(names)));
    }

    /** Take the timer's markup away again. */
    undoDom() {
        this.host.replaceChildren();
        this.host.removeAttribute('data-kp-countdown-bare');
        delete this.host.dataset.kpCountdownState;
    }

    // --- Showing. ---
    /** Say how much time is left, for a screen reader. */
    speak() {
        const s = this.strings;
        this.parts.spoken.textContent = s.timerLeft(s.timerDuration(Math.ceil(this.timer.remaining() / SECOND_MS)));
    }

    /** Bring the digits, the name, the buttons and the status line in step with the clock. */
    show() {
        const s = this.strings;
        const clock = this.timer;
        const { title, line } = this.parts;
        const state = clock.state();
        this.host.dataset.kpCountdownState = state;
        // A reset (a press, or a script's `reset(seconds)`) that brings the timer back to its start sets the format again.
        if (state === 'idle') this.hours = clock.total() >= HOUR_MS;
        this.digits.paint(formatCountdown(clock.remaining(), this.hours, this.daysOn));
        title.textContent = this.name;
        title.hidden = this.name === '';
        if (this.go) {
            setStateWord(this.go.label, state === 'running' ? s.timerPause : state === 'paused' ? s.timerResume : s.timerStart);
            this.go.button.disabled = this.disabled || state === 'ended';
        }
        if (this.more) this.more.button.disabled = this.disabled;
        if (this.reset) this.reset.button.disabled = this.disabled || (state === 'idle' && clock.total() === this.seconds * SECOND_MS);
        line.textContent = state === 'paused' ? s.timerPaused : state === 'ended' ? s.timerEnded : '';
    }

    /** Write the digits on every frame while the clock runs. */
    loop() {
        cancelAnimationFrame(this.frame);
        if (this.timer.state() !== 'running') return;
        this.digits.paint(formatCountdown(this.timer.remaining(), this.hours, this.daysOn));
        this.frame = requestAnimationFrame(() => this.loop());
    }

    /** The clock started, paused, reset or gained time. @param {import('./constants.js').CountdownState} state */
    changed(state) {
        this.show();
        this.speak();
        if (state === 'running') this.loop();
        const clock = this.timer;
        this.host.dispatchEvent(new CustomEvent(COUNTDOWN_EVENT, { bubbles: true, detail: { state, remaining: clock.remaining(), total: clock.total() } }));
    }

    /** The time is up. */
    onEnd() {
        this.show();
        this.parts.said.textContent = this.name ? this.strings.timerEndedNamed(this.name) : this.strings.timerEnded;
        this.host.dispatchEvent(new CustomEvent(COUNTDOWN_END_EVENT, { bubbles: true, detail: { total: this.timer.total() } }));
    }

    // --- Presses. ---
    onGo() {
        const state = this.timer.state();
        if (state === 'running') {
            this.timer.pause();
            this.parts.said.textContent = this.strings.timerPaused;
        } else {
            this.timer.start();
            this.parts.said.textContent = state === 'paused' ? this.strings.timerResumed : this.strings.timerStarted;
        }
    }

    onMore() {
        this.timer.add(this.step);
        // A minute more past the hour shows the hours from now on; this is a press, not the clock.
        if (!this.hours && this.timer.total() >= HOUR_MS) {
            this.hours = true;
            this.digits.paint(formatCountdown(this.timer.remaining(), this.hours, this.daysOn));
        }
        this.show();
    }

    onReset() {
        this.timer.reset(this.seconds);
        this.hours = this.seconds >= HOUR_S;
        this.parts.said.textContent = '';
        this.show();
    }

    /** The controls are built when the timer has them and left out of the document (and the tab order) when it has none. */
    mountControls() {
        const el = this.host;
        if (this.bare) {
            this.controls?.remove();
            this.controls = this.go = this.more = this.reset = null;
            el.toggleAttribute('data-kp-countdown-bare', true);
            return;
        }
        el.removeAttribute('data-kp-countdown-bare');
        if (this.controls) return;
        const s = this.strings;
        const controls = this.doc.createElement('div');
        controls.className = 'kp-countdown__controls';
        const go = timerButton(this.doc, 'kp-button--primary kp-countdown__go', [s.timerStart, s.timerPause, s.timerResume]);
        const more = timerButton(this.doc, 'kp-countdown__more', [s.timerAddMinute(this.step)], s.timerAddMinuteTitle(this.step));
        const reset = timerButton(this.doc, 'kp-button--ghost kp-countdown__reset', [s.timerReset]);
        controls.append(go.button, more.button, reset.button);
        go.button.addEventListener('click', () => this.onGo());
        more.button.addEventListener('click', () => this.onMore());
        reset.button.addEventListener('click', () => this.onReset());
        el.insertBefore(controls, this.parts.said);
        this.controls = controls;
        this.go = go;
        this.more = more;
        this.reset = reset;
    }

    // --- Until, visibility and options. ---
    startUntil() {
        if (this.until !== null && this.seconds > 0) this.timer.start();
    }

    onVisible() {
        if (this.until === null || this.doc.visibilityState !== 'visible') return;
        this.read();
        this.timer.reset(this.seconds);
        this.hours = this.seconds >= HOUR_S;
        this.startUntil();
    }

    /** An option attribute changed. @param {string[]} names */
    onOptions(names) {
        const s = this.strings;
        const before = this.step;
        this.read();
        if (this.step !== before && !this.bare && this.more) {
            setStateWord(this.more.label, s.timerAddMinute(this.step));
            this.more.button.title = s.timerAddMinuteTitle(this.step);
        }
        this.mountControls();
        if (names.includes('data-kp-countdown') || names.includes('data-kp-countdown-until') || names.includes('data-kp-countdown-timezone')) {
            this.timer.reset(this.seconds);
            this.hours = this.seconds >= HOUR_S;
            this.parts.said.textContent = '';
            this.startUntil();
        } else this.show();
    }
}
