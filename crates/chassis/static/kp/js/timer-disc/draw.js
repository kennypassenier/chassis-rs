// Drawing the disc and its words: the edge, the face's label, the caption and the status line, the controls, and the clock that moves them.

import { setStateWord } from '../components.js';
import { COUNTDOWN_END_EVENT, COUNTDOWN_EVENT, countdownClock, timerButton, timerZone, untilLabel, untilZone } from '../countdown.js';
import { DiscCore } from './core.js';
import { discShare } from './share.js';
import { MINUTE_MS, SECOND_MS, TENTHS_OF_A_TURN, TIMER_DISC_LEFT } from './values.js';

export class DiscDraw extends DiscCore {
    /**
     * @param {HTMLElement} host
     * @param {{ now?: () => number, wall?: () => number }} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        /** The share last written, and the frame and minute the running loop is at. */
        this.drawn = -1;
        this.frame = 0;
        this.minute = -1;
        /** The Start/Pause and Reset buttons and their box, when the disc has controls. @type {ReturnType<typeof timerButton> | null} */
        this.go = null;
        /** @type {ReturnType<typeof timerButton> | null} */
        this.reset = null;
        /** @type {HTMLElement | null} */
        this.controls = null;
        this.clock = countdownClock({
            seconds: this.seconds,
            now: options.now,
            onChange: (state) => this.onClockChange(state),
            onEnd: () => this.onClockEnd(),
        });
    }

    scaleMs() {
        return this.scaleSeconds > 0 ? this.scaleSeconds * SECOND_MS : this.clock.total();
    }

    /** @param {boolean} [force] */
    draw(force = false) {
        const ms = this.clock.remaining();
        let share = discShare(ms, this.scaleMs());
        // Reduced motion: the edge steps once a minute, once a second in the last minute.
        if (this.still() && this.clock.state() === 'running') {
            const unit = ms > MINUTE_MS ? MINUTE_MS : SECOND_MS;
            share = discShare(Math.ceil(ms / unit) * unit, this.scaleMs());
        }
        if (!force && Math.abs(share - this.drawn) * TENTHS_OF_A_TURN < 1) return; // under a tenth of a degree
        this.drawn = share;
        this.host.style.setProperty(TIMER_DISC_LEFT, share.toFixed(5));
    }

    /** The face says the time left in whole minutes (under a minute at the last), so a screen reader is not told every second. */
    label() {
        const { s, clock } = this;
        const ms = clock.remaining();
        const minutes = Math.ceil(ms / MINUTE_MS);
        const left = ms <= 0 ? '' : minutes > 1 ? s.timerDuration(minutes * 60) : s.timerUnderMinute;
        this.parts.face.setAttribute('aria-label', ms <= 0 ? s.timerEnded : s.timerDiscLeft(left, s.timerDuration(Math.round(clock.total() / SECOND_MS))));
    }

    captionText() {
        const { s, host, until, clock } = this;
        const length =
            until !== null
                ? s.timerUntil(untilLabel(until, this.wallNow(), untilZone(host.dataset.kpTimerDiscUntil, timerZone(host, 'data-kp-timer-disc-timezone'))))
                : s.timerDuration(Math.round(clock.total() / SECOND_MS));
        return this.name ? s.timerDiscCaption(this.name, length) : length;
    }

    show() {
        const { s, clock, go, reset } = this;
        const state = clock.state();
        this.host.dataset.kpTimerDiscState = state;
        if (go) {
            setStateWord(go.label, state === 'running' ? s.timerPause : state === 'paused' ? s.timerResume : s.timerStart);
            go.button.disabled = this.disabled || state === 'ended';
        }
        if (reset) reset.button.disabled = this.disabled || (state === 'idle' && clock.total() === this.seconds * SECOND_MS);
        // The caption follows the clock: a reset(seconds) from the page changes the length it names.
        this.parts.caption.textContent = this.captionText();
        this.parts.line.textContent = state === 'paused' ? s.timerPaused : state === 'ended' ? s.timerEnded : '';
        this.label();
    }

    loop() {
        cancelAnimationFrame(this.frame);
        if (this.clock.state() !== 'running') return;
        this.draw();
        const m = Math.ceil(this.clock.remaining() / MINUTE_MS);
        if (m !== this.minute) {
            this.minute = m;
            this.label();
        }
        this.frame = requestAnimationFrame(() => this.loop());
    }

    /** @param {string} state */
    onClockChange(state) {
        if (state === 'ended') return;
        this.draw(true);
        this.show();
        if (state === 'running') this.loop();
        this.host.dispatchEvent(
            new CustomEvent(COUNTDOWN_EVENT, { bubbles: true, detail: { state, remaining: this.clock.remaining(), total: this.clock.total() } }),
        );
    }

    onClockEnd() {
        this.draw(true);
        this.show();
        this.parts.said.textContent = this.name ? this.s.timerEndedNamed(this.name) : this.s.timerEnded;
        this.host.dispatchEvent(new CustomEvent(COUNTDOWN_END_EVENT, { bubbles: true, detail: { total: this.clock.total() } }));
    }

    /**
     * The controls are built when the disc has them and left out of the document (and the tab order) when it has none.
     * @param {() => void} onGo @param {() => void} onReset
     */
    mountControls(onGo, onReset) {
        const { host, doc, s } = this;
        if (this.bare) {
            this.controls?.remove();
            this.controls = this.go = this.reset = null;
            host.toggleAttribute('data-kp-timer-disc-bare', true);
            return;
        }
        host.removeAttribute('data-kp-timer-disc-bare');
        if (this.controls) return;
        const controls = doc.createElement('div');
        controls.className = 'kp-timer-disc__controls';
        const go = timerButton(doc, 'kp-button--primary kp-timer-disc__go', [s.timerStart, s.timerPause, s.timerResume]);
        const reset = timerButton(doc, 'kp-button--ghost kp-timer-disc__reset', [s.timerReset]);
        controls.append(go.button, reset.button);
        this.listen(go.button, 'click', onGo);
        this.listen(reset.button, 'click', onReset);
        host.insertBefore(controls, this.parts.said);
        this.controls = controls;
        this.go = go;
        this.reset = reset;
    }
}
