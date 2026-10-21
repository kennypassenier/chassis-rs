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
// Options, read again when the attribute changes (js/live-options.js) [gaps-time-1019]:
//   data-kp-countdown-until   "14:30" (the next 14:30 on this device's clock), a date and time ("2026-10-20T09:00") or epoch
//                             ms: the timer counts down to that moment instead of for a length; it starts at once and has no
//                             controls (a moment does not wait). A moment that has passed reads "Time is up".
//   data-kp-countdown-timezone "Europe/Brussels" (on the timer or an ancestor): the zone a "14:30" or a date and time without an
//                             offset is given in; a date and time with its own offset ("+02:00", "Z") is read in that one
//   data-kp-countdown-days="off"  keep digits past 24 hours ("167:59:59"); by default 24 hours or more is read with a days
//                             unit, "6 d 22 h" (under 24 hours nothing changes) [wish-1120, homelab 124]
//   data-kp-countdown-controls="none"  display only: no Start, +1 min or Reset is built (not in the tab order either); the
//                             page drives the clock with countdownOf(el).start() / .pause() / .reset()
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
import { watchOptions } from './live-options.js';

/** A countdown. */
/** A countdown: the length, or only the moment it counts down to (the documented `-until` markup). */
export const COUNTDOWN = '[data-kp-countdown], [data-kp-countdown-until]';
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
 * A zone a moment is read and written in: an IANA name ("Europe/Brussels"), a fixed offset in minutes (the "+02:00" of a
 * date and time), or null for the device's own clock.
 * @typedef {string | number | null} UntilZone
 */

/** @type {Map<string, Intl.DateTimeFormat | null>} */
const ZONE_FORMATS = new Map();

/** The reader of one IANA zone, or null for a name Intl does not know. @param {string} zone */
function zoneFormat(zone) {
    if (!ZONE_FORMATS.has(zone)) {
        try {
            ZONE_FORMATS.set(
                zone,
                new Intl.DateTimeFormat('en-GB', {
                    timeZone: zone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hourCycle: 'h23',
                }),
            );
        } catch {
            ZONE_FORMATS.set(zone, null);
        }
    }
    return ZONE_FORMATS.get(zone) ?? null;
}

/**
 * The IANA zone a timer is given in: `attribute` (`data-kp-countdown-timezone`, `data-kp-timer-disc-timezone`) on it or an
 * ancestor; null (the device) when none or unknown.
 * @param {Element} el @param {string} attribute
 */
export function timerZone(el, attribute) {
    const name = el.closest(`[${attribute}]`)?.getAttribute(attribute)?.trim() ?? '';
    return name !== '' && zoneFormat(name) !== null ? name : null;
}

/**
 * The wall-clock parts of `ms` in a zone.
 * @param {number} ms @param {UntilZone} zone
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }}
 */
function wallParts(ms, zone) {
    if (typeof zone === 'string') {
        const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
        for (const part of zoneFormat(zone)?.formatToParts(ms) ?? []) if (part.type in out) out[/** @type {keyof typeof out} */ (part.type)] = Number(part.value);
        out.hour %= 24;
        return out;
    }
    const at = typeof zone === 'number' ? new Date(ms + zone * 60000) : new Date(ms);
    return typeof zone === 'number'
        ? { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate(), hour: at.getUTCHours(), minute: at.getUTCMinutes(), second: at.getUTCSeconds() }
        : { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(), hour: at.getHours(), minute: at.getMinutes(), second: at.getSeconds() };
}

/**
 * The moment a wall-clock time names in a zone (the earlier one when the clock runs it twice; the next valid one when the
 * clock skips it).
 * @param {number} year @param {number} month @param {number} day @param {number} hour @param {number} minute @param {number} second
 * @param {UntilZone} zone
 */
function zonedMoment(year, month, day, hour, minute, second, zone) {
    if (zone === null) return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
    const wall = Date.UTC(year, month - 1, day, hour, minute, second);
    if (typeof zone === 'number') return wall - zone * 60000;
    const offsetAt = (/** @type {number} */ t) => {
        const w = wallParts(t, zone);
        return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(t / 1000) * 1000;
    };
    const first = wall - offsetAt(wall);
    return wall - offsetAt(first);
}

/** The fixed offset, in minutes, a date and time string carries ("Z", "+02:00"); null when it carries none. @param {string} text */
export function untilOffset(text) {
    const t = text.trim();
    if (/^\d{1,2}:\d{2}/.test(t) || !/^\d{4}-\d{2}-\d{2}[T ]/.test(t)) return null;
    if (/[zZ]$/.test(t)) return 0;
    const m = /([+-])(\d{2}):?(\d{2})$/.exec(t.slice(10));
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}

/**
 * The zone an `until` value is given in: the offset it carries, else the timer's zone, else the device.
 * @param {string | number | null | undefined} value @param {string | null} [timeZone]
 * @returns {UntilZone}
 */
export function untilZone(value, timeZone = null) {
    const offset = typeof value === 'string' ? untilOffset(value) : null;
    return offset ?? timeZone;
}

/**
 * The moment an `until` option names, in epoch ms: "14:30" or "14:30:15" is the next such time on the clock of `timeZone`
 * (the device's when none; today when it is still ahead, else tomorrow), a date and time is that moment (read in `timeZone`
 * when it carries no offset of its own), a number of 10 digits or more is epoch ms.
 * @param {string | number | null | undefined} value
 * @param {number} nowMs
 * @param {string | null} [timeZone] an IANA zone name
 * @returns {number | null} null when the value names no moment
 */
export function parseUntil(value, nowMs, timeZone = null) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value ?? '').trim();
    if (text === '') return null;
    const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (clock) {
        const [h, m, sec] = [Number(clock[1]), Number(clock[2]), Number(clock[3] ?? 0)];
        if (h > 23 || m > 59 || sec > 59) return null;
        const now = wallParts(nowMs, timeZone);
        let at = zonedMoment(now.year, now.month, now.day, h, m, sec, timeZone);
        // Tomorrow, by the calendar of the zone (a day is not always 24 hours).
        if (at <= nowMs) {
            const next = new Date(Date.UTC(now.year, now.month - 1, now.day + 1));
            at = zonedMoment(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), h, m, sec, timeZone);
        }
        return at;
    }
    if (/^\d{10,}$/.test(text)) return Number(text);
    const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(text);
    if (local && timeZone !== null) {
        const [y, mo, d, h, mi, sec] = local.slice(1).map((x) => Number(x ?? 0));
        return zonedMoment(y, mo, d, h, mi, sec, timeZone);
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A moment as the words after "until": "14:30" when it is today, else "20/10/2026 09:00", read on the clock of `zone`
 * (the zone the moment was given in; the device's when null).
 * @param {number} ms @param {number} nowMs @param {UntilZone} [zone]
 */
export function untilLabel(ms, nowMs, zone = null) {
    const at = wallParts(ms, zone);
    const today = wallParts(nowMs, zone);
    const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
    const clock = `${two(at.hour)}:${two(at.minute)}`;
    const sameDay = at.year === today.year && at.month === today.month && at.day === today.day;
    return sameDay ? clock : `${two(at.day)}/${two(at.month)}/${at.year} ${clock}`;
}

/**
 * The digits of a time left, rounded up to the second: "25:00", "0:08", "1:02:03".
 * @param {number} ms the time left
 * @param {boolean} hours whether the timer shows hours (it holds an hour or more)
 * @param {boolean} [days] whether 24 hours or more is written with a days unit ("6 d 22 h"); off, it reads "167:59:59"
 */
export function formatCountdown(ms, hours, days = false) {
    const total = Math.max(0, Math.ceil(ms / 1000 - 1e-9));
    // Past 24 hours a length is read in days, "6 d 22 h"; under 24 hours nothing changes [wish-1120, homelab 124].
    // Rounded up to the hour, as the digits are rounded up to the second: 6 d 21 h 59 min 59 s reads 6 d 22 h.
    if (days && total >= 86400) {
        const hoursUp = Math.ceil(total / 3600);
        return getStrings().countdownDays(Math.floor(hoursUp / 24), hoursUp % 24);
    }
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
 * @param {{ now?: () => number, wall?: () => number }} [options] `now` is the clock's (performance.now), `wall` the device's
 *   date and time (Date.now), which an `until` option is counted against
 * @returns {() => void} detach
 */
export function attachCountdowns(root = document, { now, wall } = {}) {
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
        const wallNow = wall ?? (() => Date.now());
        el.classList.add('kp-countdown');

        // The options, read again when an attribute changes.
        let seconds = 0;
        let step = COUNTDOWN_STEP;
        let name = '';
        let disabled = false;
        let bare = false;
        let daysOn = true;
        /** The moment the timer counts down to, epoch ms, when the `until` option names one. @type {number | null} */
        let until = null;
        const read = () => {
            const at = wallNow();
            until = parseUntil(el.dataset.kpCountdownUntil, at, timerZone(el, 'data-kp-countdown-timezone'));
            seconds = until !== null ? Math.max(0, Math.ceil((until - at) / 1000)) : parseDuration(el.dataset.kpCountdown);
            step = parseDuration(el.dataset.kpCountdownStep) || COUNTDOWN_STEP;
            name = el.dataset.kpCountdownName ?? '';
            disabled = el.hasAttribute('data-kp-countdown-disabled');
            daysOn = el.dataset.kpCountdownDays !== 'off';
            // A moment does not wait: counting down to one has no Start, no minute more and no Reset.
            bare = until !== null || el.dataset.kpCountdownControls === 'none';
        };
        read();

        const title = doc.createElement('p');
        title.className = 'kp-countdown__name';

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

        el.replaceChildren(title, time, line, said);

        /** @type {ReturnType<typeof timerButton> | null} */
        let go = null;
        /** @type {ReturnType<typeof timerButton> | null} */
        let more = null;
        /** @type {ReturnType<typeof timerButton> | null} */
        let reset = null;
        /** @type {HTMLElement | null} */
        let controls = null;

        let hours = seconds >= 3600;
        let shown = '';
        let frame = 0;
        /** @param {string} text */
        const paint = (text) => {
            if (text === shown) return;
            // Rebuild the cells only when the format changes; else write only the digits that changed.
            const kindOf = (/** @type {string} */ ch) => (ch === ':' ? 'colon' : /\d/.test(ch) ? 'digit' : 'unit');
            if (text.length !== shown.length || [...text].some((ch, i) => kindOf(ch) !== kindOf(shown[i]))) {
                digits.replaceChildren(
                    ...[...text].map((ch) => {
                        const cell = doc.createElement('span');
                        cell.className = `kp-countdown__${kindOf(ch)}`;
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
            // A reset (a press, or a script's `reset(seconds)`) that brings the timer back to its start sets the format again.
            if (state === 'idle') hours = clock.total() >= 3600000;
            paint(formatCountdown(clock.remaining(), hours, daysOn));
            title.textContent = name;
            title.hidden = name === '';
            if (go) {
                setStateWord(go.label, state === 'running' ? s.timerPause : state === 'paused' ? s.timerResume : s.timerStart);
                go.button.disabled = disabled || state === 'ended';
            }
            if (more) more.button.disabled = disabled;
            if (reset) reset.button.disabled = disabled || (state === 'idle' && clock.total() === seconds * 1000);
            line.textContent = state === 'paused' ? s.timerPaused : state === 'ended' ? s.timerEnded : '';
        };
        const loop = () => {
            cancelAnimationFrame(frame);
            if (clock.state() !== 'running') return;
            paint(formatCountdown(clock.remaining(), hours, daysOn));
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
                paint(formatCountdown(clock.remaining(), hours, daysOn));
            }
            show();
        };
        const onReset = () => {
            clock.reset(seconds);
            hours = seconds >= 3600;
            said.textContent = '';
            show();
        };
        /** The controls are built when the timer has them and left out of the document (and the tab order) when it has none. */
        const mountControls = () => {
            if (bare) {
                controls?.remove();
                controls = go = more = reset = null;
                el.toggleAttribute('data-kp-countdown-bare', true);
                return;
            }
            el.removeAttribute('data-kp-countdown-bare');
            if (controls) return;
            controls = doc.createElement('div');
            controls.className = 'kp-countdown__controls';
            go = timerButton(doc, 'kp-button--primary kp-countdown__go', [s.timerStart, s.timerPause, s.timerResume]);
            more = timerButton(doc, 'kp-countdown__more', [s.timerAddMinute(step)], s.timerAddMinuteTitle(step));
            reset = timerButton(doc, 'kp-button--ghost kp-countdown__reset', [s.timerReset]);
            controls.append(go.button, more.button, reset.button);
            go.button.addEventListener('click', onGo);
            more.button.addEventListener('click', onMore);
            reset.button.addEventListener('click', onReset);
            el.insertBefore(controls, said);
        };
        mountControls();
        // Counting down to a moment starts at once; the clock then runs to it whatever the page does.
        const startUntil = () => {
            if (until !== null && seconds > 0) clock.start();
        };
        show();
        speak();
        startUntil();

        // A tab that slept keeps the device's clock, not the timer's: when it is visible again the moment is counted anew.
        const onVisible = () => {
            if (until === null || doc.visibilityState !== 'visible') return;
            read();
            clock.reset(seconds);
            hours = seconds >= 3600;
            startUntil();
        };
        doc.addEventListener('visibilitychange', onVisible);

        const stopWatching = watchOptions(
            el,
            [
                'data-kp-countdown',
                'data-kp-countdown-until',
                'data-kp-countdown-timezone',
                'data-kp-countdown-name',
                'data-kp-countdown-step',
                'data-kp-countdown-controls',
                'data-kp-countdown-days',
                'data-kp-countdown-disabled',
            ],
            (names) => {
                const before = step;
                read();
                if (step !== before && !bare && more) {
                    setStateWord(more.label, s.timerAddMinute(step));
                    more.button.title = s.timerAddMinuteTitle(step);
                }
                mountControls();
                if (names.includes('data-kp-countdown') || names.includes('data-kp-countdown-until') || names.includes('data-kp-countdown-timezone')) {
                    clock.reset(seconds);
                    hours = seconds >= 3600;
                    said.textContent = '';
                    startUntil();
                } else show();
            },
        );
        cleanups.push(() => {
            stopWatching();
            doc.removeEventListener('visibilitychange', onVisible);
            cancelAnimationFrame(frame);
            clock.stop();
            CLOCKS.delete(el);
            el.replaceChildren();
            el.removeAttribute('data-kp-countdown-bare');
            delete el.dataset.kpCountdownState;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
