// One wired visual timer: its parts placed, the Start / Pause and Reset presses, the fill on a reset, a counted moment, and the way it is taken down.

import { watchOptions } from '../live-options.js';
import { DiscDraw } from './draw.js';
import { isDiscPropertyRegistered } from './register.js';
import { DEFAULT_FILL_S, FALLBACK_FILL_MS, MIN_FILL_MS, RESTARTING_OPTIONS, SECOND_MS, TIMER_DISC_LEFT, WATCHED_OPTIONS } from './values.js';

export class TimerDisc extends DiscDraw {
    /**
     * @param {HTMLElement} host
     * @param {{ now?: () => number, wall?: () => number }} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** The fill animation of a reset, while it plays. @type {Animation | null} */
        this.filling = null;
    }

    connect() {
        const el = this.host;
        const { face, caption, line, said } = this.parts;
        el.classList.add('kp-timer-disc');
        el.replaceChildren(face, caption, line, said);
        // Registered first, so they run last on detach: the clock stops, then the host is emptied and its marks go.
        this.own(() => {
            el.replaceChildren();
            el.removeAttribute('data-kp-timer-disc-bare');
            el.style.removeProperty(TIMER_DISC_LEFT);
            delete el.dataset.kpTimerDiscState;
        });
        this.own(() => this.clock.stop());
        this.own(() => this.filling?.cancel());
        this.own(() => cancelAnimationFrame(this.frame));
        this.mount();
        this.draw(true);
        this.show();
        this.startUntil();
        this.listen(this.doc, 'visibilitychange', () => this.onVisible());
        this.own(watchOptions(el, WATCHED_OPTIONS, (names) => this.onOptions(names)));
    }

    mount() {
        this.mountControls(
            () => this.onGo(),
            () => this.onReset(),
        );
    }

    /** Counting down to a moment starts at once; the clock then runs to it whatever the page does. */
    startUntil() {
        if (this.until !== null && this.seconds > 0) this.clock.start();
    }

    onGo() {
        const { clock, s } = this;
        const state = clock.state();
        this.filling?.finish();
        if (state === 'running') {
            clock.pause();
            this.parts.said.textContent = s.timerPaused;
        } else {
            clock.start();
            this.parts.said.textContent = state === 'paused' ? s.timerResumed : s.timerStarted;
        }
    }

    onReset() {
        const from = this.drawn;
        this.clock.reset(this.seconds);
        this.parts.said.textContent = '';
        this.draw(true);
        // The disc fills again in the theme's own time and curve; at once under reduced motion.
        if (!this.still() && typeof this.host.animate === 'function' && isDiscPropertyRegistered() && from < this.drawn) this.fill(from);
        this.show();
    }

    /** Play the fill from where the disc was to where it is, in the theme's own duration and easing. @param {number} from */
    fill(from) {
        const el = this.host;
        const style = this.view.getComputedStyle(el);
        const raw = style.getPropertyValue('--fx-duration').trim();
        const duration = (Number.parseFloat(raw) || DEFAULT_FILL_S) * (/[^m]s$/.test(raw) ? SECOND_MS : 1) || FALLBACK_FILL_MS;
        const easing = style.getPropertyValue('--fx-ease').trim() || 'ease-out';
        this.filling?.cancel();
        try {
            this.filling = el.animate([{ [TIMER_DISC_LEFT]: String(from) }, { [TIMER_DISC_LEFT]: String(this.drawn) }], {
                duration: Math.max(duration, MIN_FILL_MS),
                easing,
            });
        } catch {
            this.filling = null;
        }
    }

    /** A tab that slept keeps the device's clock, not the timer's: when it is visible again the moment is counted anew. */
    onVisible() {
        if (this.until === null || this.doc.visibilityState !== 'visible') return;
        this.read();
        this.filling?.cancel();
        this.clock.reset(this.seconds);
        this.startUntil();
    }

    /** @param {string[]} names the options that changed */
    onOptions(names) {
        this.read();
        this.mount();
        if (names.some((name) => RESTARTING_OPTIONS.includes(name))) {
            this.filling?.cancel();
            this.parts.said.textContent = '';
            this.clock.reset(this.seconds);
            this.startUntil();
        } else {
            this.draw(true);
            this.show();
        }
    }
}
