// The countdown: a named timer in digits [kpadopt4-ideas, Kenny 2026-10-16].
//
// Kenny: "Ik wil ook een timer met getallen, apart" — next to the visual
// timer (js/timer-disc.js), one timer that counts down in digits, mm:ss or
// h:mm:ss, with Start, Pause, Reset and a minute more, and a gentle signal at
// the end:
//
//   <div class="kp-countdown" data-kp-countdown="25:00" data-kp-countdown-name="Tea"></div>
//
// The digits never move the layout: every digit stands in a cell one `ch`
// wide and the colons in their own, so 1:11 and 0:08 are as wide as each other
// whatever the theme's face, and only a digit that changes is written. The
// format follows the timer's length: h:mm:ss once it holds an hour or more,
// else mm:ss; it changes only when a press changes the length (a minute more
// past the hour), never while it runs. The time shown is rounded up, so the
// last second reads 0:01 and 0:00 is the end.
//
// The words beside the digits (Paused, Time is up) stand in a line that is
// always there; the Start button keeps one width for Start, Pause and Resume
// (the package's state word). At the end the plate breathes three times, under
// the flash threshold, and stands still under reduced motion; the line says
// "Time is up" and a status region says it to a screen reader, which hears the
// start, the pause and the end, not every second.
//
// Events (bubbling, on the timer):
//   kp-countdown-change  { state, remaining, total }   started, paused, reset, a minute more
//   kp-countdown-end     { total }                      the time is up
//
// The clock reads `now()` (performance.now by default; attachCountdowns takes
// another, for a test), so a hidden tab or a slow frame never loses time: the
// time left is always the end moment minus now. countdownClock() is that
// clock on its own, and the visual timer runs on it too.
//
// Nothing runs on import; attachCountdowns(root) returns a detach.

import { getStrings } from './strings.js';
import { setStateWord } from './components.js';

/** A countdown. */
export const COUNTDOWN = '[data-kp-countdown]';
/** Fired on the timer when it starts, pauses, resets or gains time: `{ state, remaining, total }` (ms). */
export const COUNTDOWN_EVENT = 'kp-countdown-change';
/** Fired on the timer when its time is up: `{ total }` (ms). */
export const COUNTDOWN_END_EVENT = 'kp-countdown-end';
/** How much "a minute more" adds, in seconds, when the timer does not say (`data-kp-countdown-step`). */
export const COUNTDOWN_STEP = 60;

/**
 * A length in seconds from "90", "25m", "1h30m", "45s", "25:00" or "1:30:00".
 * @param {string | number | null | undefined} value
 * @returns {number} seconds, 0 when unreadable
 */
export function parseDuration(value) {
    if (typeof value === 'number') return Math.max(0, Math.round(value));
    const text = String(value ?? '')
        .trim()
        .toLowerCase();
    if (text === '') return 0;
    if (/^\d+(:\d{1,2}){1,2}$/.test(text)) {
        return text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
    }
    if (/^\d+$/.test(text)) return Number(text);
    let total = 0;
    let matched = false;
    for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(h|m|s)/g)) {
        matched = true;
        total += Number(m[1]) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
    }
    return matched ? Math.round(total) : 0;
}

/**
 * The digits of a time left, rounded up to the second: "25:00", "0:08", "1:02:03".
 * @param {number} ms the time left
 * @param {boolean} hours whether the timer shows hours (it holds an hour or more)
 */
export function formatCountdown(ms, hours) {
    const total = Math.max(0, Math.ceil(ms / 1000 - 1e-9));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return hours ? `${h}:${two(m)}:${two(s)}` : `${two(Math.floor(total / 60))}:${two(s)}`;
}

/**
 * @typedef {'idle' | 'running' | 'paused' | 'ended'} CountdownState
 * @typedef {object} CountdownClock
 * @property {() => CountdownState} state
 * @property {() => number} remaining  ms left
 * @property {() => number} total      ms the timer was set to, with every minute added
 * @property {() => void} start        from idle or paused; nothing when running or ended
 * @property {() => void} pause
 * @property {(seconds?: number) => void} reset  back to idle and full, at `seconds` when given
 * @property {(seconds: number) => void} add     more time; an ended timer starts again with it
 * @property {() => void} stop          stop every timer it holds (detach)
 */

/**
 * A countdown clock: the time left is the end moment minus now, so nothing drifts.
 * @param {{ seconds: number, now?: () => number, onEnd?: () => void, onChange?: (state: CountdownState) => void }} options
 * @returns {CountdownClock}
 */
export function countdownClock({ seconds, now = () => performance.now(), onEnd, onChange }) {
    let total = Math.max(0, seconds) * 1000;
    let left = total;
    /** @type {CountdownState} */
    let state = total > 0 ? 'idle' : 'ended';
    let endsAt = 0;
    let timer = 0;
    const arm = () => {
        clearTimeout(timer);
        // The end is watched by a timer as well as by the frames, so a hidden tab still ends on time.
        timer = window.setTimeout(check, Math.max(0, endsAt - now()) + 5);
    };
    const check = () => {
        if (state !== 'running') return;
        if (endsAt - now() <= 0) {
            left = 0;
            state = 'ended';
            clearTimeout(timer);
            onChange?.(state);
            onEnd?.();
        } else arm();
    };
    return {
        state: () => {
            check();
            return state;
        },
        remaining: () => {
            check();
            return state === 'running' ? Math.max(0, endsAt - now()) : left;
        },
        total: () => total,
        start() {
            if (state !== 'idle' && state !== 'paused') return;
            endsAt = now() + left;
            state = 'running';
            arm();
            onChange?.(state);
        },
        pause() {
            if (state !== 'running') return;
            left = Math.max(0, endsAt - now());
            state = 'paused';
            clearTimeout(timer);
            onChange?.(state);
        },
        reset(next) {
            clearTimeout(timer);
            if (typeof next === 'number') total = Math.max(0, next) * 1000;
            left = total;
            state = total > 0 ? 'idle' : 'ended';
            onChange?.(state);
        },
        add(more) {
            const ms = Math.max(0, more) * 1000;
            total += ms;
            if (state === 'running') {
                endsAt += ms;
                arm();
            } else if (state === 'ended') {
                left = ms;
                endsAt = now() + left;
                state = 'running';
                arm();
            } else left += ms;
            onChange?.(state);
        },
        stop() {
            clearTimeout(timer);
        },
    };
}

/** The clock of every attached timer. @type {WeakMap<HTMLElement, CountdownClock>} */
const CLOCKS = new WeakMap();
/** The clock of an attached countdown, to drive it from a script. @param {Element} el */
export const countdownOf = (el) => CLOCKS.get(/** @type {HTMLElement} */ (el)) ?? null;

/**
 * Build one control of a timer: a package button whose words keep their width.
 * @param {Document} doc @param {string} className @param {string[]} words @param {string} [title]
 */
export function timerButton(doc, className, words, title) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `kp-button kp-button--sm ${className}`;
    const label = doc.createElement('span');
    label.className = 'kp-button__text kp-state-word kp-state-word--center';
    label.setAttribute('data-kp-words', words.join('\n'));
    label.textContent = words[0];
    button.append(label);
    if (title) button.title = title;
    return { button, label };
}

/**
 * Wire every countdown under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachCountdowns(root = document, { now } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const timers = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(COUNTDOWN) ? [root] : []),
        ...root.querySelectorAll(COUNTDOWN),
    ]);
    for (const el of timers) {
        if (CLOCKS.has(el)) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const seconds = parseDuration(el.dataset.kpCountdown);
        const step = parseDuration(el.dataset.kpCountdownStep) || COUNTDOWN_STEP;
        const name = el.dataset.kpCountdownName ?? '';
        const disabled = el.hasAttribute('data-kp-countdown-disabled');
        el.classList.add('kp-countdown');

        const title = doc.createElement('p');
        title.className = 'kp-countdown__name';
        title.textContent = name;
        title.hidden = name === '';

        // The digits: one cell per character, so nothing moves while they change.
        const time = doc.createElement('p');
        time.className = 'kp-countdown__time';
        time.setAttribute('role', 'timer');
        time.setAttribute('aria-live', 'off');
        const digits = doc.createElement('span');
        digits.className = 'kp-countdown__digits';
        digits.setAttribute('aria-hidden', 'true');
        const spoken = doc.createElement('span');
        spoken.className = 'kp-sr-only';
        time.append(digits, spoken);

        const line = doc.createElement('p');
        line.className = 'kp-countdown__status';
        const said = doc.createElement('span');
        said.className = 'kp-sr-only';
        said.setAttribute('role', 'status');

        const controls = doc.createElement('div');
        controls.className = 'kp-countdown__controls';
        const go = timerButton(doc, 'kp-button--primary kp-countdown__go', [s.timerStart, s.timerPause, s.timerResume]);
        const more = timerButton(doc, 'kp-countdown__more', [s.timerAddMinute(step)], s.timerAddMinuteTitle(step));
        const reset = timerButton(doc, 'kp-button--ghost kp-countdown__reset', [s.timerReset]);
        controls.append(go.button, more.button, reset.button);
        for (const b of [go.button, more.button, reset.button]) b.disabled = disabled;

        el.replaceChildren(title, time, line, controls, said);

        let hours = seconds >= 3600;
        let shown = '';
        let frame = 0;
        /** @param {string} text */
        const paint = (text) => {
            if (text === shown) return;
            // Rebuild the cells only when the format changes; else write only the digits that changed.
            if (text.length !== shown.length) {
                digits.replaceChildren(
                    ...[...text].map((ch) => {
                        const cell = doc.createElement('span');
                        cell.className = ch === ':' ? 'kp-countdown__colon' : 'kp-countdown__digit';
                        cell.textContent = ch;
                        return cell;
                    }),
                );
            } else {
                [...text].forEach((ch, i) => {
                    if (ch !== shown[i]) /** @type {HTMLElement} */ (digits.children[i]).textContent = ch;
                });
            }
            shown = text;
        };
        const speak = () => {
            spoken.textContent = s.timerLeft(s.timerDuration(Math.ceil(clock.remaining() / 1000)));
        };
        const show = () => {
            const state = clock.state();
            el.dataset.kpCountdownState = state;
            paint(formatCountdown(clock.remaining(), hours));
            setStateWord(go.label, state === 'running' ? s.timerPause : state === 'paused' ? s.timerResume : s.timerStart);
            go.button.disabled = disabled || state === 'ended';
            reset.button.disabled = disabled || (state === 'idle' && clock.total() === seconds * 1000);
            line.textContent = state === 'paused' ? s.timerPaused : state === 'ended' ? s.timerEnded : '';
        };
        const loop = () => {
            cancelAnimationFrame(frame);
            if (clock.state() !== 'running') return;
            paint(formatCountdown(clock.remaining(), hours));
            frame = requestAnimationFrame(loop);
        };
        /** @param {CountdownState} state */
        const changed = (state) => {
            show();
            speak();
            if (state === 'running') loop();
            el.dispatchEvent(
                new CustomEvent(COUNTDOWN_EVENT, { bubbles: true, detail: { state, remaining: clock.remaining(), total: clock.total() } }),
            );
        };
        const clock = countdownClock({
            seconds,
            now,
            onChange: (state) => {
                if (state === 'ended') return; // the end has its own words and event, below
                changed(state);
            },
            onEnd: () => {
                show();
                said.textContent = name ? s.timerEndedNamed(name) : s.timerEnded;
                el.dispatchEvent(new CustomEvent(COUNTDOWN_END_EVENT, { bubbles: true, detail: { total: clock.total() } }));
            },
        });
        CLOCKS.set(el, clock);

        const onGo = () => {
            const state = clock.state();
            if (state === 'running') {
                clock.pause();
                said.textContent = s.timerPaused;
            } else {
                clock.start();
                said.textContent = state === 'paused' ? s.timerResumed : s.timerStarted;
            }
        };
        const onMore = () => {
            clock.add(step);
            // A minute more past the hour shows the hours from now on; this is a press, not the clock.
            if (!hours && clock.total() >= 3600000) {
                hours = true;
                paint(formatCountdown(clock.remaining(), hours));
            }
            show();
        };
        const onReset = () => {
            clock.reset(seconds);
            hours = seconds >= 3600;
            said.textContent = '';
            show();
        };
        go.button.addEventListener('click', onGo);
        more.button.addEventListener('click', onMore);
        reset.button.addEventListener('click', onReset);
        show();
        speak();
        cleanups.push(() => {
            cancelAnimationFrame(frame);
            clock.stop();
            CLOCKS.delete(el);
            go.button.removeEventListener('click', onGo);
            more.button.removeEventListener('click', onMore);
            reset.button.removeEventListener('click', onReset);
            el.replaceChildren();
            delete el.dataset.kpCountdownState;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
