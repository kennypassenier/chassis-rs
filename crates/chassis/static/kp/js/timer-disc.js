// The visual timer: the time left as a shrinking disc [kpadopt4-ideas, Kenny 2026-10-16].
//
// The Time Timer's idea: no numbers ticking, only a coloured disc that grows
// smaller as the time goes, so the time left is seen at a glance and nothing
// on the page flickers.
//
//   <div class="kp-timer-disc" data-kp-timer-disc="25m" data-kp-timer-disc-name="Focus"></div>
//
// The disc starts full (the whole set time) and its edge turns back towards
// twelve o'clock as the time goes; with `data-kp-timer-disc-scale="60"` the face
// is a 60-minute dial instead, the classic Time Timer, and 25 minutes is a
// sector of 150°. Twelve marks stand round the rim, nothing else is written on
// the face. Under it: the timer's name and its length ("Focus · 25 min",
// still), one line for "Paused" or "Time is up", and Start, Pause and Reset
// as the package's buttons (Start keeps one width for its three words).
//
// The disc is drawn by one number, `--kp-timer-disc-left` (1 full, 0 gone),
// written only when the edge has moved a tenth of a degree, so a 25-minute
// timer writes a few times a second and a page does nothing else. Reset fills
// the disc again in the theme's own time and curve (--fx-duration, --fx-ease).
// Under reduced motion the disc steps once a minute (once every second under
// a minute) and nothing glides or breathes.
//
// At the end the face breathes three times, slowly, under the flash
// threshold, and stands still under reduced motion; the line says "Time is up"
// and a status region says it. A screen reader hears the time left in whole
// minutes on the face (role="img"), and the start, the pause and the end.
//
// Options, read again when the attribute changes (js/live-options.js) [gaps-time-1019]:
//   data-kp-timer-disc-until   "14:30" (the next 14:30 on this device's clock), a date and time or epoch ms: the disc counts
//                              down to that moment, starts at once and has no controls (a moment does not wait); the line
//                              under it reads "until 14:30"
//   data-kp-timer-disc-timezone "Europe/Brussels" (on the disc or an ancestor): the zone "14:30" and the caption are in; a date and
//                              time with its own offset ("+02:00", "Z") is read and written in that offset. Without either,
//                              this device's clock
//   data-kp-timer-disc-controls="none"  display only: no Start, Pause or Reset is built (left out of the tab order too); the
//                              page drives the clock with timerDiscOf(el).start() / .pause() / .reset(seconds). The caption
//                              follows the clock, so a reset(seconds) from the page changes "Focus · 25 min" too
//
// Events: the countdown's, `kp-countdown-change` and `kp-countdown-end` (the
// clock is js/countdown.js's countdownClock).
//
// Nothing runs on import; attachTimerDiscs(root) returns a detach.

import { getStrings } from './strings.js';
import { motionAllowed } from './calm.js';
import { setStateWord } from './components.js';
import { COUNTDOWN_END_EVENT, COUNTDOWN_EVENT, countdownClock, parseDuration, parseUntil, timerButton, timerZone, untilLabel, untilZone } from './countdown.js';
import { watchOptions } from './live-options.js';

/** A visual timer. */
export const TIMER_DISC = '[data-kp-timer-disc], [data-kp-timer-disc-until]';
/** The custom property the disc is drawn by: 1 full, 0 gone. */
export const TIMER_DISC_LEFT = '--kp-timer-disc-left';

/** The custom property is registered once, so a reset can fill the disc in the theme's own curve. */
let registered = false;
const register = () => {
    if (registered || typeof CSS === 'undefined' || typeof CSS.registerProperty !== 'function') return;
    registered = true;
    try {
        CSS.registerProperty({ name: TIMER_DISC_LEFT, syntax: '<number>', inherits: true, initialValue: '1' });
    } catch {
        // Registered before (a second copy of this module): the same registration stands.
    }
};

/**
 * The share of the disc left: the time left over the face's scale.
 * @param {number} remainingMs @param {number} scaleMs the face's whole turn
 */
export function discShare(remainingMs, scaleMs) {
    if (scaleMs <= 0) return 0;
    return Math.min(1, Math.max(0, remainingMs / scaleMs));
}

/** @type {WeakMap<HTMLElement, import('./countdown.js').CountdownClock>} */
const CLOCKS = new WeakMap();
/** The clock of an attached visual timer, to drive it from a script. @param {Element} el */
export const timerDiscOf = (el) => CLOCKS.get(/** @type {HTMLElement} */ (el)) ?? null;

/**
 * Wire every visual timer under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number, wall?: () => number }} [options] `now` is the clock's (performance.now), `wall` the device's
 *   date and time (Date.now), which an `until` option is counted against
 * @returns {() => void} detach
 */
export function attachTimerDiscs(root = document, { now, wall } = {}) {
    register();
    /** @type {(() => void)[]} */
    const cleanups = [];
    const timers = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(TIMER_DISC) ? [root] : []),
        ...root.querySelectorAll(TIMER_DISC),
    ]);
    for (const el of timers) {
        if (CLOCKS.has(el)) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const view = doc.defaultView ?? window;
        const wallNow = wall ?? (() => Date.now());
        // The options, read again when an attribute changes.
        let seconds = 0;
        let scaleSeconds = 0;
        let name = '';
        let disabled = false;
        let bare = false;
        /** The moment the disc counts down to, epoch ms, when the `until` option names one. @type {number | null} */
        let until = null;
        const read = () => {
            const at = wallNow();
            until = parseUntil(el.dataset.kpTimerDiscUntil, at, timerZone(el, 'data-kp-timer-disc-timezone'));
            seconds = until !== null ? Math.max(0, Math.ceil((until - at) / 1000)) : parseDuration(el.dataset.kpTimerDisc);
            scaleSeconds = parseDuration(el.dataset.kpTimerDiscScale ? `${el.dataset.kpTimerDiscScale}m` : '') || 0;
            name = el.dataset.kpTimerDiscName ?? '';
            disabled = el.hasAttribute('data-kp-timer-disc-disabled');
            // A moment does not wait: counting down to one has no Start, Pause or Reset.
            bare = until !== null || el.dataset.kpTimerDiscControls === 'none';
        };
        read();
        const still = () => !motionAllowed(doc);
        el.classList.add('kp-timer-disc');

        const face = doc.createElement('div');
        face.className = 'kp-timer-disc__face';
        face.setAttribute('role', 'img');
        const sector = doc.createElement('span');
        sector.className = 'kp-timer-disc__sector';
        const marks = doc.createElement('span');
        marks.className = 'kp-timer-disc__marks';
        const hub = doc.createElement('span');
        hub.className = 'kp-timer-disc__hub';
        for (const part of [sector, marks, hub]) part.setAttribute('aria-hidden', 'true');
        face.append(sector, marks, hub);

        const caption = doc.createElement('p');
        caption.className = 'kp-timer-disc__caption';
        const line = doc.createElement('p');
        line.className = 'kp-timer-disc__status';
        const said = doc.createElement('span');
        said.className = 'kp-sr-only';
        said.setAttribute('role', 'status');

        el.replaceChildren(face, caption, line, said);
        /** @type {ReturnType<typeof timerButton> | null} */
        let go = null;
        /** @type {ReturnType<typeof timerButton> | null} */
        let reset = null;
        /** @type {HTMLElement | null} */
        let controls = null;

        let drawn = -1;
        let frame = 0;
        /** @type {Animation | null} */
        let filling = null;
        const scaleMs = () => (scaleSeconds > 0 ? scaleSeconds * 1000 : clock.total());
        /** @param {boolean} [force] */
        const draw = (force = false) => {
            const ms = clock.remaining();
            let share = discShare(ms, scaleMs());
            // Reduced motion: the edge steps once a minute, once a second in the last minute.
            if (still() && clock.state() === 'running') {
                const unit = ms > 60000 ? 60000 : 1000;
                share = discShare(Math.ceil(ms / unit) * unit, scaleMs());
            }
            if (!force && Math.abs(share - drawn) * 3600 < 1) return; // under a tenth of a degree
            drawn = share;
            el.style.setProperty(TIMER_DISC_LEFT, share.toFixed(5));
        };
        // The face says the time left in whole minutes (under a minute at the last), so a screen reader is not told every second.
        const name_ = () => {
            const ms = clock.remaining();
            const minutes = Math.ceil(ms / 60000);
            const left = ms <= 0 ? '' : minutes > 1 ? s.timerDuration(minutes * 60) : s.timerUnderMinute;
            face.setAttribute('aria-label', ms <= 0 ? s.timerEnded : s.timerDiscLeft(left, s.timerDuration(Math.round(clock.total() / 1000))));
        };
        const captionText = () => {
            const length = until !== null ? s.timerUntil(untilLabel(until, wallNow(), untilZone(el.dataset.kpTimerDiscUntil, timerZone(el, 'data-kp-timer-disc-timezone')))) : s.timerDuration(Math.round(clock.total() / 1000));
            return name ? s.timerDiscCaption(name, length) : length;
        };
        const show = () => {
            const state = clock.state();
            el.dataset.kpTimerDiscState = state;
            if (go) {
                setStateWord(go.label, state === 'running' ? s.timerPause : state === 'paused' ? s.timerResume : s.timerStart);
                go.button.disabled = disabled || state === 'ended';
            }
            if (reset) reset.button.disabled = disabled || (state === 'idle' && clock.total() === seconds * 1000);
            // The caption follows the clock: a reset(seconds) from the page changes the length it names.
            caption.textContent = captionText();
            line.textContent = state === 'paused' ? s.timerPaused : state === 'ended' ? s.timerEnded : '';
            name_();
        };
        let minute = -1;
        const loop = () => {
            cancelAnimationFrame(frame);
            if (clock.state() !== 'running') return;
            draw();
            const m = Math.ceil(clock.remaining() / 60000);
            if (m !== minute) {
                minute = m;
                name_();
            }
            frame = requestAnimationFrame(loop);
        };
        const clock = countdownClock({
            seconds,
            now,
            onChange: (state) => {
                if (state === 'ended') return;
                draw(true);
                show();
                if (state === 'running') loop();
                el.dispatchEvent(
                    new CustomEvent(COUNTDOWN_EVENT, { bubbles: true, detail: { state, remaining: clock.remaining(), total: clock.total() } }),
                );
            },
            onEnd: () => {
                draw(true);
                show();
                said.textContent = name ? s.timerEndedNamed(name) : s.timerEnded;
                el.dispatchEvent(new CustomEvent(COUNTDOWN_END_EVENT, { bubbles: true, detail: { total: clock.total() } }));
            },
        });
        CLOCKS.set(el, clock);
        const onGo = () => {
            const state = clock.state();
            filling?.finish();
            if (state === 'running') {
                clock.pause();
                said.textContent = s.timerPaused;
            } else {
                clock.start();
                said.textContent = state === 'paused' ? s.timerResumed : s.timerStarted;
            }
        };
        const onReset = () => {
            const from = drawn;
            clock.reset(seconds);
            said.textContent = '';
            draw(true);
            // The disc fills again in the theme's own time and curve; at once under reduced motion.
            if (!still() && typeof el.animate === 'function' && registered && from < drawn) {
                const style = view.getComputedStyle(el);
                const raw = style.getPropertyValue('--fx-duration').trim();
                const duration = (Number.parseFloat(raw) || 0.2) * (/[^m]s$/.test(raw) ? 1000 : 1) || 200;
                const easing = style.getPropertyValue('--fx-ease').trim() || 'ease-out';
                filling?.cancel();
                try {
                    filling = el.animate([{ [TIMER_DISC_LEFT]: String(from) }, { [TIMER_DISC_LEFT]: String(drawn) }], {
                        duration: Math.max(duration, 240),
                        easing,
                    });
                } catch {
                    filling = null;
                }
            }
            show();
        };
        /** The controls are built when the disc has them and left out of the document (and the tab order) when it has none. */
        const mountControls = () => {
            if (bare) {
                controls?.remove();
                controls = go = reset = null;
                el.toggleAttribute('data-kp-timer-disc-bare', true);
                return;
            }
            el.removeAttribute('data-kp-timer-disc-bare');
            if (controls) return;
            controls = doc.createElement('div');
            controls.className = 'kp-timer-disc__controls';
            go = timerButton(doc, 'kp-button--primary kp-timer-disc__go', [s.timerStart, s.timerPause, s.timerResume]);
            reset = timerButton(doc, 'kp-button--ghost kp-timer-disc__reset', [s.timerReset]);
            controls.append(go.button, reset.button);
            go.button.addEventListener('click', onGo);
            reset.button.addEventListener('click', onReset);
            el.insertBefore(controls, said);
        };
        mountControls();
        // Counting down to a moment starts at once; the clock then runs to it whatever the page does.
        const startUntil = () => {
            if (until !== null && seconds > 0) clock.start();
        };
        draw(true);
        show();
        startUntil();

        // A tab that slept keeps the device's clock, not the timer's: when it is visible again the moment is counted anew.
        const onVisible = () => {
            if (until === null || doc.visibilityState !== 'visible') return;
            read();
            filling?.cancel();
            clock.reset(seconds);
            startUntil();
        };
        doc.addEventListener('visibilitychange', onVisible);

        const stopWatching = watchOptions(
            el,
            [
                'data-kp-timer-disc',
                'data-kp-timer-disc-until',
                'data-kp-timer-disc-timezone',
                'data-kp-timer-disc-name',
                'data-kp-timer-disc-scale',
                'data-kp-timer-disc-controls',
                'data-kp-timer-disc-disabled',
            ],
            (names) => {
                read();
                mountControls();
                if (names.includes('data-kp-timer-disc') || names.includes('data-kp-timer-disc-until') || names.includes('data-kp-timer-disc-timezone')) {
                    filling?.cancel();
                    said.textContent = '';
                    clock.reset(seconds);
                    startUntil();
                } else {
                    draw(true);
                    show();
                }
            },
        );
        cleanups.push(() => {
            stopWatching();
            doc.removeEventListener('visibilitychange', onVisible);
            cancelAnimationFrame(frame);
            filling?.cancel();
            clock.stop();
            CLOCKS.delete(el);
            el.replaceChildren();
            el.removeAttribute('data-kp-timer-disc-bare');
            el.style.removeProperty(TIMER_DISC_LEFT);
            delete el.dataset.kpTimerDiscState;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
