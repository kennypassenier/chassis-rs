// Kitchen timers: named countdowns that keep running [kpadopt4; the AuDHD recipe app].
//
// One or more countdowns, each with a name ("Rice", "Sauce"), side by side.
// The alarm (js/alarm.js) is a notice that counts down until it closes; a
// timer is a clock a person starts and that goes on until it is done.
//
//   <div class="kp-timers" data-kp-timers aria-label="Kitchen timers"></div>
//   <button class="kp-button" data-kp-timer-start="10m" data-kp-timer-name="Simmer the sauce">Simmer 10 min</button>
//
//   startTimer(list, { name: 'Rice', seconds: 12 * 60 });
//   list.addEventListener('kp-timer-done', (e) => …);
//
// A starter (`data-kp-timer-start`, a duration: "10m", "1h30m", "90s",
// "10:00" or seconds; `data-kp-timer-name`; `data-kp-timer-for` names the
// list, else the page's first) may stand anywhere in the page, in the text of
// a recipe step. Pressed again while its timer runs, it does not start a
// second one: the focus goes to the one that runs.
//
// What it does:
//   - Each timer is a card (`.kp-timer`): its name, a state word, the time
//     left large and in figures of one width, the theme's progress bar, and
//     Pause or Resume, +1 min and Remove. Nothing in a card changes size as
//     the clock runs or the state changes.
//   - It counts from the moment it ends, never by ticks: a page in the
//     background, a phone that locked, a laptop that slept all show the right
//     time again the moment they are back.
//   - When one ends: its card turns to the done plate with the name large
//     ("Rice is done") and one big Stop button; a soft two-note chime plays
//     every few seconds (`data-kp-timers-ring` seconds, 60; 0 is once;
//     `data-kp-timers-sound="off"` none), the phone buzzes where it can, and
//     the system shows a notification when the page has the permission
//     (askTimerNotifications() asks, from a press). +1 min on a done timer
//     starts it again for a minute.
//   - The sound is a choice: `data-kp-timers-sound="chime"` (default, the soft
//     two-note chime), `"bell"` (a wind-up kitchen timer's hammer on two
//     bells) or `"buzzer"` (a harsher electronic beep, four at a time), or
//     `"off"`. All are made with Web Audio, no file. playTimerSound() plays
//     one, for a picker's preview (call it from a press).
//   - It can also say it: `data-kp-timers-speak="on"` (default off) speaks the
//     timer's message with speechSynthesis once the sound has played, again at
//     every ring. The message is `data-kp-timer-say` on a starter or `say` in
//     startTimer, else "<name> is done" from the dictionary. Where
//     speechSynthesis is missing nothing is said and nothing fails: the card,
//     the sound and the alert still tell it.
//   - A screen reader hears a start, the last minute and the end (the end
//     at once, the rest politely), never every second.
//
// Nothing is stored: getTimers() gives the state (with each end time) for
// the page to keep, restoreTimers() puts it back after a reload.
//
// Events (bubbling, on the list):
//   kp-timer-start   { timer }
//   kp-timer-change  { timer, action: 'pause' | 'resume' | 'add' | 'stop-ring' }
//   kp-timer-done    { timer }
//   kp-timer-stop    { timer }            removed
//   kp-timers-retry  {}                   the Retry of the failed state (setTimersState(list, 'error'))
//
// States: `setTimersState(list, 'loading' | 'error' | 'ready', message)`: loading lays the data table's busy card over the
// box the timers fill, error says the message on the failed plate with a Retry, and a list without timers says
// `data-kp-timers-empty` (or the dictionary's sentence) on the empty plate; all three fill the box a row of timer cards fills
// (js/state-plate.js, js/footprint.js).
//
// Every word it adds is in js/strings.js. Nothing runs on import.

import { getStrings } from './strings.js';
import { buildProgressbar } from './progressbar.js';
import { formatCountdown, parseDuration } from './countdown.js';
import { openBusyCard } from './busy-card.js';
import { hostStatePlate } from './state-plate.js';

/** The lists this module looks after. */
export const TIMERS = '[data-kp-timers]';
/** A button anywhere in the page that starts a timer. */
export const TIMER_START = '[data-kp-timer-start]';
export const TIMER_START_EVENT = 'kp-timer-start';
export const TIMER_CHANGE_EVENT = 'kp-timer-change';
export const TIMER_DONE_EVENT = 'kp-timer-done';
export const TIMER_STOP_EVENT = 'kp-timer-stop';
/** Fired on the list, bubbling, when the Retry of its failed state is pressed [r6r8-1019]. */
export const TIMERS_RETRY_EVENT = 'kp-timers-retry';
/** How often the shown time is brought up to date [ms]; the time itself comes from the end, not from this. */
export const TIMER_TICK_MS = 250;

/**
 * @typedef {object} TimerState
 * @property {string} id
 * @property {string} name
 * @property {number} seconds  the length it was started with (plus what was added)
 * @property {number} remaining  seconds left, now
 * @property {number | null} endsAt  epoch ms it ends at while running, else null
 * @property {'running' | 'paused' | 'done'} state
 * @property {string} [say]  the sentence spoken when it ends, if the list speaks
 */

/**
 * @typedef {object} Timer
 * @property {string} id
 * @property {string} name
 * @property {number} total  ms
 * @property {number | null} endsAt  epoch ms, while running
 * @property {number} left  ms, while paused or done
 * @property {'running' | 'paused' | 'done'} state
 * @property {boolean} warned  the last minute was said
 * @property {string} say  the sentence spoken when it ends ('' = the dictionary's)
 * @property {ReturnType<typeof setInterval> | null} ring
 * @property {HTMLElement} card
 */

/** Per list: its timers, in the order they were started. @type {WeakMap<Element, Map<string, Timer>>} */
const LISTS = new WeakMap();
/** Per list: its ticker. @type {WeakMap<Element, ReturnType<typeof setInterval>>} */
const TICKERS = new WeakMap();
/** Lists already wired. @type {WeakSet<Element>} */
const WIRED = new WeakSet();
/** Starter presses already handled, when two attached roots hear the same one. @type {WeakSet<Event>} */
const HANDLED = new WeakSet();
/** @type {AudioContext | null} */
let audio = null;
let serial = 0;

// One duration reader and one clock face for the package: the countdown's [kpadopt4]. The kitchen timer re-exports
// the reader for its own subpath; a timer that holds an hour or more shows its hours from the start, so its digits never jump.
export { parseDuration };

/** @param {Timer} timer @param {number} ms */
const clockOf = (timer, ms) => formatCountdown(ms, timer.total >= 3_600_000);

/** @param {Timer} timer */
const leftOf = (timer) => (timer.state === 'running' && timer.endsAt !== null ? Math.max(0, timer.endsAt - Date.now()) : timer.left);

/** @param {Timer} timer @returns {TimerState} */
const stateOf = (timer) => ({
    id: timer.id,
    name: timer.name,
    seconds: Math.round(timer.total / 1000),
    remaining: Math.ceil(leftOf(timer) / 1000),
    endsAt: timer.state === 'running' ? timer.endsAt : null,
    state: timer.state,
    ...(timer.say ? { say: timer.say } : {}),
});

/** @param {Element} list @returns {TimerState[]} */
export function getTimers(list) {
    return [...(LISTS.get(list)?.values() ?? [])].map(stateOf);
}

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} list @param {string} name @returns {HTMLElement} */
function part(list, name) {
    let node = /** @type {HTMLElement | null} */ (list.querySelector(`:scope > .kp-timers__${name}`));
    if (node) return node;
    if (name === 'list') {
        node = el('kp-timers__list', 'ul');
        list.prepend(node);
    } else if (name === 'empty') {
        node = el('kp-timers__empty', 'div');
        part(list, 'list').after(node);
    } else {
        node = el(`kp-sr-only kp-timers__${name}`, 'span');
        node.setAttribute('role', name === 'alert' ? 'alert' : 'status');
        list.append(node);
    }
    return node;
}

/** @param {Element} list @param {string} message @param {'live' | 'alert'} [where] */
function say(list, message, where = 'live') {
    const region = part(list, where);
    region.textContent = '';
    setTimeout(() => (region.textContent = message), 60);
}

/** @param {Element} list */
const listOf = (list) => {
    let timers = LISTS.get(list);
    if (!timers) {
        timers = new Map();
        LISTS.set(list, timers);
    }
    return timers;
};

/**
 * A card for a timer, its parts in place.
 * @param {string} id
 * @returns {HTMLElement}
 */
function buildCard(id) {
    const strings = getStrings();
    const card = el('kp-timer', 'li');
    card.setAttribute('data-kp-timer-id', id);
    serial += 1;
    const head = el('kp-timer__head');
    const name = el('kp-timer__name', 'span');
    name.id = `kp-timer-${serial}-name`;
    const word = el('kp-timer__state', 'span');
    word.setAttribute('data-kp-words', [strings.timerRunning, strings.timerPaused, strings.timerDoneWord].join('\n'));
    head.append(name, word);
    const time = el('kp-timer__time');
    time.setAttribute('role', 'timer');
    time.setAttribute('aria-labelledby', name.id);
    const bar = el('kp-progressbar kp-timer__bar');
    bar.setAttribute('aria-hidden', 'true');
    buildProgressbar(bar);
    bar.removeAttribute('role');
    const actions = el('kp-timer__actions');
    const toggle = /** @type {HTMLButtonElement} */ (el('kp-button kp-timer__toggle', 'button'));
    toggle.type = 'button';
    const more = /** @type {HTMLButtonElement} */ (el('kp-button kp-timer__more', 'button'));
    more.type = 'button';
    const remove = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-timer__remove', 'button'));
    remove.type = 'button';
    const glyph = el('kp-timer__remove-glyph', 'span');
    glyph.setAttribute('aria-hidden', 'true');
    remove.append(glyph);
    // Holds the first button's column as wide as the widest of its words, in the button's own face, in every state.
    const sizer = el('kp-button kp-timer__sizer', 'span');
    sizer.setAttribute('aria-hidden', 'true');
    actions.append(sizer, toggle, more, remove);
    card.append(head, time, bar, actions);
    card.setAttribute('aria-labelledby', name.id);
    return card;
}

/** Bring a card in step with its timer. @param {Timer} timer */
function paint(timer) {
    const strings = getStrings();
    const { card } = timer;
    const left = leftOf(timer);
    card.setAttribute('data-kp-timer-state', timer.state);
    const name = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__name'));
    if (name.textContent !== timer.name) {
        name.textContent = timer.name;
        name.title = timer.name;
    }
    const word = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__state'));
    word.textContent = timer.state === 'running' ? strings.timerRunning : timer.state === 'paused' ? strings.timerPaused : strings.timerDoneWord;
    const time = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__time'));
    const shown = timer.state === 'done' ? strings.timerDone(timer.name) : clockOf(timer, left);
    if (time.textContent !== shown) time.textContent = shown;
    time.title = timer.state === 'done' ? shown : '';
    const bar = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__bar'));
    bar.style.setProperty('--kp-value', String(timer.total > 0 ? Math.min(1, 1 - left / timer.total) : 1));
    const toggle = /** @type {HTMLButtonElement} */ (card.querySelector('.kp-timer__toggle'));
    const label = timer.state === 'running' ? strings.timerPause : timer.state === 'paused' ? strings.timerResume : strings.timerStopRing;
    if (toggle.textContent !== label) toggle.textContent = label;
    toggle.classList.toggle('kp-button--primary', timer.state === 'done');
    toggle.setAttribute('data-kp-words', [strings.timerPause, strings.timerResume, strings.timerStopRing].join('\n'));
    const sizer = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__sizer'));
    const widest = [strings.timerPause, strings.timerResume, strings.timerStopRing].join('\n');
    if (sizer.textContent !== widest) sizer.textContent = widest;
    const more = /** @type {HTMLButtonElement} */ (card.querySelector('.kp-timer__more'));
    more.textContent = strings.timerAddMinute(60);
    more.setAttribute('aria-label', strings.timerAddMinuteTo(timer.name));
    const remove = /** @type {HTMLButtonElement} */ (card.querySelector('.kp-timer__remove'));
    remove.setAttribute('aria-label', strings.timerRemove(timer.name));
    remove.title = strings.timerRemove(timer.name);
}

/** Per list: the busy card while loading. @type {WeakMap<Element, import('./busy-card.js').BusyCard>} */
const BUSY = new WeakMap();
/** Per empty line: the plate drawn in it (its kind and words), so a draw that changes nothing leaves it alone. @type {WeakMap<Element, string>} */
const PLATE = new WeakMap();

/** Show or hide the state plate (empty or failed), start or stop the ticker. @param {HTMLElement} list */
function sync(list) {
    const timers = listOf(list);
    const empty = part(list, 'empty');
    const strings = getStrings();
    const error = list.getAttribute('data-kp-timers-error');
    const loading = list.hasAttribute('aria-busy');
    // A list without timers is the state `empty`, written like every other data component's, so the footprint
    // (js/footprint.js) holds the height the list had; `loading` and `error` are the page's to set [r6r8-1019].
    const shown = list.getAttribute('data-kp-state');
    if (shown === null || shown === 'ready' || shown === 'empty') {
        if (timers.size === 0) list.setAttribute('data-kp-state', 'empty');
        else if (shown === 'empty') list.setAttribute('data-kp-state', 'ready');
    }
    // Empty and failed are the package's state plate over the whole box a row of timers fills, a failure with its Retry
    // (`kp-timers-retry`); loading is the busy card over that box. The empty part is the plate itself (the themes dress it).
    const title = error ?? list.getAttribute('data-kp-timers-empty') ?? strings.timerEmpty;
    const plateKey = loading ? 'loading' : `${error !== null ? 'error' : 'empty'}|${title}`;
    if (PLATE.get(empty) !== plateKey) {
        PLATE.set(empty, plateKey);
        if (loading) {
            empty.replaceChildren();
            empty.classList.remove('kp-alert', 'kp-alert--destructive', 'kp-empty', 'kp-stateplate', 'kp-stateplate--error', 'kp-stateplate--empty');
        } else hostStatePlate(list, { kind: error !== null ? 'error' : 'empty', title, retryEvent: TIMERS_RETRY_EVENT, into: empty });
    }
    empty.hidden = !(error !== null || timers.size === 0);
    empty.toggleAttribute('data-kp-timers-failed', error !== null);
    list.toggleAttribute('data-kp-timers-covered', error !== null || timers.size === 0);
    const running = [...timers.values()].some((t) => t.state === 'running');
    const ticker = TICKERS.get(list);
    if (running && !ticker)
        TICKERS.set(
            list,
            setInterval(() => tick(list), TIMER_TICK_MS),
        );
    else if (!running && ticker) {
        clearInterval(ticker);
        TICKERS.delete(list);
    }
}

/**
 * The list's state: `loading` lays the busy card over the box the timers fill (and keeps it at its height), `error` says
 * `message` on the failed plate with a Retry where the timers were (they keep running underneath), `ready` is neither
 * [r6r8-1019; audhd-recepten gap 30].
 * @param {Element} list @param {'loading' | 'error' | 'ready'} state @param {string} [message]
 */
export function setTimersState(list, state, message) {
    if (!(list instanceof HTMLElement)) return;
    list.setAttribute('data-kp-state', state);
    if (state === 'error') list.setAttribute('data-kp-timers-error', message ?? getStrings().timersFailed);
    else list.removeAttribute('data-kp-timers-error');
    const card = BUSY.get(list);
    if (state === 'loading') {
        list.setAttribute('aria-busy', 'true');
        if (!card)
            BUSY.set(
                list,
                openBusyCard(list, { words: message ?? getStrings().timersLoading, area: () => [list], className: 'kp-timers__busy' }),
            );
    } else {
        list.removeAttribute('aria-busy');
        if (card) {
            BUSY.delete(list);
            void card.close();
        }
    }
    sync(list);
}

/** @param {HTMLElement} list */
function tick(list) {
    for (const timer of listOf(list).values()) {
        if (timer.state !== 'running') continue;
        const left = leftOf(timer);
        if (left <= 0) finish(list, timer);
        else {
            if (!timer.warned && left <= 60_000 && timer.total > 90_000) {
                timer.warned = true;
                say(list, getStrings().timerLastMinute(timer.name));
            }
            paint(timer);
        }
    }
    sync(list);
}

/** The sounds a list may choose. @type {readonly ['chime', 'bell', 'buzzer']} */
export const TIMER_SOUNDS = ['chime', 'bell', 'buzzer'];

/** The page's one audio context, or null where there is none or no press has woken it yet. @returns {AudioContext | null} */
function context() {
    const Context = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
    if (!Context) return null;
    // No press has woken the sound yet (a timer the page started or restored on its own): a context made now is
    // refused by the browser, with a warning in the console, so wait for one.
    if (audio === null && /** @type {any} */ (navigator).userActivation?.isActive === false) return null;
    audio ??= new Context();
    const ctx = /** @type {AudioContext} */ (audio);
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
}

/**
 * One note: partials with a quick attack and an exponential decay.
 * @param {AudioContext} ctx @param {AudioNode} out @param {number} at @param {number} hz
 * @param {{ type?: OscillatorType, peak: number, attack: number, decay: number }} shape
 */
function note(ctx, out, at, hz, { type = 'sine', peak, attack, decay }) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.05);
}

/** @param {AudioContext} ctx @param {number} cutoff @returns {BiquadFilterNode} a low-pass into the speakers, so nothing is shrill */
function soften(ctx, cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.connect(ctx.destination);
    return filter;
}

/**
 * The sounds, each given the context and its start; each returns how long it lasts [s].
 * @type {Record<string, (ctx: AudioContext, at: number) => number>}
 */
const SOUNDS = {
    // A soft two-note chime.
    chime(ctx, at) {
        [659.25, 880].forEach((hz, i) => note(ctx, ctx.destination, at + i * 0.32, hz, { peak: 0.16, attack: 0.03, decay: 0.9 }));
        return 1.25;
    },
    // A wind-up kitchen timer: a hammer striking two bells in turn, twice, ten strikes each, with the bell metal's
    // inharmonic overtones; softened above 4.5 kHz so it is loud without being shrill.
    bell(ctx, at) {
        const out = soften(ctx, 4500);
        for (let burst = 0; burst < 2; burst += 1)
            for (let hit = 0; hit < 10; hit += 1) {
                const start = at + burst * 0.95 + hit * 0.075;
                const base = hit % 2 === 0 ? 1180 : 1330;
                [
                    [1, 0.11],
                    [2.4, 0.06],
                    [4.1, 0.03],
                ].forEach(([ratio, peak]) => note(ctx, out, start, base * ratio, { peak, attack: 0.002, decay: 0.26 }));
            }
        return 1.9;
    },
    // An electronic beeper: four short, slightly detuned saw beeps, twice. Harsh on purpose, softened above 3 kHz.
    buzzer(ctx, at) {
        const out = soften(ctx, 3000);
        for (let group = 0; group < 2; group += 1)
            for (let beep = 0; beep < 4; beep += 1) {
                const start = at + group * 1.3 + beep * 0.26;
                for (const hz of [740, 749]) note(ctx, out, start, hz, { type: 'sawtooth', peak: 0.1, attack: 0.008, decay: 0.17 });
            }
        return 2.2;
    },
};

/**
 * Play one of the sounds, once. Call it from a press (a preview) or let a timer's end call it.
 * @param {string} [sound]  'chime' (default), 'bell' or 'buzzer'; anything else is the chime, 'off' is silence
 * @returns {number} how long it lasts in seconds (0 where nothing played)
 */
export function playTimerSound(sound = 'chime') {
    if (sound === 'off') return 0;
    try {
        const ctx = context();
        if (!ctx) return 0;
        return (SOUNDS[sound] ?? SOUNDS.chime)(ctx, ctx.currentTime + 0.02);
    } catch {
        // No sound where the page may not make one; the card and the alert still say it.
        return 0;
    }
}

/**
 * Say a sentence aloud with the browser's voice, in the page's language. Where there is no speech nothing happens.
 * @param {string} text
 * @returns {boolean} whether it was handed to the voice
 */
export function speakTimerMessage(text) {
    try {
        if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined' || !text) return false;
        const utterance = new SpeechSynthesisUtterance(text);
        const lang = document.documentElement.lang;
        if (lang) utterance.lang = lang;
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
        return true;
    } catch {
        // A voice that fails to start leaves the card and the sound to say it.
        return false;
    }
}

/** Wake the sound up from a press, so a sound may play later without one. */
function primeSound() {
    try {
        context();
    } catch {
        // As above.
    }
}

/** @param {Timer} timer */
function stopRing(timer) {
    if (timer.ring !== null) clearInterval(timer.ring);
    timer.ring = null;
    timer.card.removeAttribute('data-kp-timer-ringing');
    if (timer.state === 'done' && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/**
 * A timer has ended: the done plate, the chime, a buzz, a notification, the
 * alert and the event.
 * @param {HTMLElement} list @param {Timer} timer @param {{ quiet?: boolean }} [options]
 */
function finish(list, timer, { quiet = false } = {}) {
    timer.state = 'done';
    timer.endsAt = null;
    timer.left = 0;
    paint(timer);
    const strings = getStrings();
    say(list, strings.timerDone(timer.name), 'alert');
    if (!quiet) {
        const sound = list.getAttribute('data-kp-timers-sound') ?? 'chime';
        const speak = list.getAttribute('data-kp-timers-speak') === 'on';
        /** The sound, then (once it has played) the sentence. */
        const announce = () => {
            const length = playTimerSound(sound);
            if (speak) setTimeout(() => listOf(list).get(timer.id) === timer && timer.state === 'done' && speakTimerMessage(timer.say || strings.timerSpoken(timer.name)), length * 1000);
        };
        if (sound !== 'off' || speak) {
            announce();
            const ring = Number(list.getAttribute('data-kp-timers-ring') ?? 60);
            if (ring > 0) {
                const until = Date.now() + ring * 1000;
                timer.card.setAttribute('data-kp-timer-ringing', '');
                timer.ring = setInterval(() => {
                    if (Date.now() >= until || timer.state !== 'done') return stopRing(timer);
                    announce();
                }, 4000);
            }
        }
        navigator.vibrate?.([300, 150, 300]);
        if (list.getAttribute('data-kp-timers-notify') !== 'false' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
                new Notification(strings.timerDone(timer.name), { tag: `kp-timer-${timer.id}` });
            } catch {
                // A page that may not raise one from here (a phone's tab): the card says it.
            }
        }
    }
    list.dispatchEvent(new CustomEvent(TIMER_DONE_EVENT, { bubbles: true, detail: { timer: stateOf(timer) } }));
}

/**
 * Ask the browser for permission to show a system notification when a timer
 * ends. Call it from a press. Resolves with the answer.
 * @returns {Promise<NotificationPermission | 'unsupported'>}
 */
export async function askTimerNotifications() {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    return Notification.requestPermission();
}

/** @param {HTMLElement} list @param {Timer} timer @param {string} type @param {object} [extra] */
const emit = (list, timer, type, extra = {}) =>
    list.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { timer: stateOf(timer), ...extra } }));

/** @param {Element} list @param {string} id */
const find = (list, id) => LISTS.get(list)?.get(id) ?? null;

/**
 * Start a timer. With an `id` that already runs, nothing new starts and that
 * id is returned.
 * @param {Element} list
 * @param {{ name: string, seconds: number, id?: string, say?: string }} options  `say`: what is spoken when it ends
 * @returns {string | null} the timer's id
 */
export function startTimer(list, { name, seconds, id, say: message = '' }) {
    if (!(list instanceof HTMLElement) || !(seconds > 0)) return null;
    const timers = listOf(list);
    const key = id ?? `t${Date.now().toString(36)}${(serial += 1)}`;
    const existing = timers.get(key);
    if (existing && existing.state !== 'done') return key;
    if (existing) removeCard(list, existing, false);
    primeSound();
    const card = buildCard(key);
    /** @type {Timer} */
    const timer = {
        id: key,
        name,
        total: seconds * 1000,
        endsAt: Date.now() + seconds * 1000,
        left: seconds * 1000,
        state: 'running',
        warned: false,
        say: message,
        ring: null,
        card,
    };
    timers.set(key, timer);
    paint(timer);
    part(list, 'list').append(card);
    void import('./motion.js').then((m) => card.isConnected && m.arriveShown(card));
    sync(list);
    say(list, getStrings().timerStartedNamed(name, clockOf(timer, timer.total)));
    emit(list, timer, TIMER_START_EVENT);
    return key;
}

/** @param {Element} list @param {string} id */
export function pauseTimer(list, id) {
    const timer = find(list, id);
    if (!timer || timer.state !== 'running' || !(list instanceof HTMLElement)) return;
    timer.left = leftOf(timer);
    timer.endsAt = null;
    timer.state = 'paused';
    paint(timer);
    sync(list);
    emit(list, timer, TIMER_CHANGE_EVENT, { action: 'pause' });
}

/** @param {Element} list @param {string} id */
export function resumeTimer(list, id) {
    const timer = find(list, id);
    if (!timer || timer.state !== 'paused' || !(list instanceof HTMLElement)) return;
    primeSound();
    timer.endsAt = Date.now() + timer.left;
    timer.state = 'running';
    paint(timer);
    sync(list);
    emit(list, timer, TIMER_CHANGE_EVENT, { action: 'resume' });
}

/**
 * Add time to a timer; a done one starts again for that long.
 * @param {Element} list @param {string} id @param {number} [seconds]
 */
export function addTimerTime(list, id, seconds = 60) {
    const timer = find(list, id);
    if (!timer || !(list instanceof HTMLElement)) return;
    const ms = seconds * 1000;
    if (timer.state === 'done') {
        stopRing(timer);
        timer.total = ms;
        timer.endsAt = Date.now() + ms;
        timer.state = 'running';
        timer.warned = ms <= 60_000;
    } else if (timer.state === 'running' && timer.endsAt !== null) {
        timer.endsAt += ms;
        timer.total += ms;
        if (leftOf(timer) > 60_000) timer.warned = false;
    } else {
        timer.left += ms;
        timer.total += ms;
    }
    paint(timer);
    sync(list);
    emit(list, timer, TIMER_CHANGE_EVENT, { action: 'add' });
}

/** Stop a done timer's chime and let it rest on its done plate. @param {Element} list @param {string} id */
export function stopTimerRing(list, id) {
    const timer = find(list, id);
    if (!timer || !(list instanceof HTMLElement)) return;
    stopRing(timer);
    emit(list, timer, TIMER_CHANGE_EVENT, { action: 'stop-ring' });
}

/** @param {HTMLElement} list @param {Timer} timer @param {boolean} animate */
function removeCard(list, timer, animate) {
    stopRing(timer);
    listOf(list).delete(timer.id);
    const { card } = timer;
    if (animate) void import('./motion.js').then((m) => m.leave(card)).catch(() => card.remove());
    else card.remove();
}

/**
 * Remove a timer (Stop): its card leaves the theme's way.
 * @param {Element} list @param {string} id
 */
export function stopTimer(list, id) {
    const timer = find(list, id);
    if (!timer || !(list instanceof HTMLElement)) return;
    removeCard(list, timer, true);
    sync(list);
    for (const starter of document.querySelectorAll(`${TIMER_START}[data-kp-timer-running="${CSS.escape(id)}"]`))
        starter.removeAttribute('data-kp-timer-running');
    emit(list, timer, TIMER_STOP_EVENT);
}

/**
 * Put saved timers back (after a reload): a running one counts on from its
 * end time, one whose end has passed is shown done (and rings only when it
 * ended within the last minute).
 * @param {Element} list @param {TimerState[]} saved
 */
export function restoreTimers(list, saved) {
    if (!(list instanceof HTMLElement)) return;
    const timers = listOf(list);
    for (const s of saved) {
        if (timers.has(s.id)) continue;
        const card = buildCard(s.id);
        /** @type {Timer} */
        const timer = {
            id: s.id,
            name: s.name,
            total: s.seconds * 1000,
            endsAt: s.state === 'running' ? s.endsAt : null,
            left: s.remaining * 1000,
            state: s.state,
            warned: s.remaining <= 60,
            say: s.say ?? '',
            ring: null,
            card,
        };
        timers.set(s.id, timer);
        part(list, 'list').append(card);
        if (timer.state === 'running' && leftOf(timer) <= 0) finish(list, timer, { quiet: Date.now() - (s.endsAt ?? 0) > 60_000 });
        else paint(timer);
    }
    sync(list);
}

/** The list a starter speaks to. @param {Element} starter */
const targetOf = (starter) => {
    const named = starter.getAttribute('data-kp-timer-for');
    const found = named ? document.getElementById(named) : document.querySelector(TIMERS);
    return found instanceof HTMLElement ? found : null;
};

/**
 * Wire every timer list under `root` (its buttons) and every starter in the
 * page. Counting goes on from the end time when the page comes back.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTimers(root = document) {
    const lists = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(TIMERS) ? [root] : []),
        ...root.querySelectorAll(TIMERS),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const list of lists) {
        if (WIRED.has(list)) continue;
        WIRED.add(list);
        part(list, 'list');
        sync(list);
        /** @param {MouseEvent} event */
        const click = (event) => {
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            const card = button?.closest('.kp-timer');
            if (!button || !card || !list.contains(card)) return;
            const id = card.getAttribute('data-kp-timer-id') ?? '';
            const timer = find(list, id);
            if (!timer) return;
            if (button.classList.contains('kp-timer__toggle')) {
                if (timer.state === 'running') pauseTimer(list, id);
                else if (timer.state === 'paused') resumeTimer(list, id);
                else {
                    stopRing(timer);
                    stopTimer(list, id);
                }
            } else if (button.classList.contains('kp-timer__more')) addTimerTime(list, id, 60);
            else if (button.classList.contains('kp-timer__remove')) {
                // The focus goes to the next card's first button, else the previous one's, so it is never lost.
                const next = card.nextElementSibling ?? card.previousElementSibling;
                stopTimer(list, id);
                /** @type {HTMLElement | null} */ (next?.querySelector('.kp-timer__toggle') ?? null)?.focus();
            }
        };
        const back = () => {
            if (document.visibilityState === 'visible') tick(list);
        };
        list.addEventListener('click', click);
        document.addEventListener('visibilitychange', back);
        undo.push(() => {
            WIRED.delete(list);
            list.removeEventListener('click', click);
            document.removeEventListener('visibilitychange', back);
            const ticker = TICKERS.get(list);
            if (ticker) clearInterval(ticker);
            TICKERS.delete(list);
            for (const timer of listOf(list).values()) stopRing(timer);
        });
    }
    // Starters anywhere under `root`, one listener for all.
    /** @param {MouseEvent} event */
    const start = (event) => {
        const starter = event.target instanceof Element ? event.target.closest(TIMER_START) : null;
        if (!starter || starter.closest('[aria-disabled="true"]') || HANDLED.has(event)) return;
        HANDLED.add(event);
        const list = targetOf(starter);
        if (!list) return;
        const seconds = parseDuration(starter.getAttribute('data-kp-timer-start') ?? '');
        const name = starter.getAttribute('data-kp-timer-name') ?? starter.textContent?.trim() ?? '';
        const id = starter.getAttribute('data-kp-timer-id') ?? `start:${name}`;
        const running = find(list, id);
        if (running && running.state !== 'done') {
            /** @type {HTMLElement | null} */ (running.card.querySelector('.kp-timer__toggle'))?.focus();
            say(list, getStrings().timerAlready(name));
            return;
        }
        const message = starter.getAttribute('data-kp-timer-say') ?? '';
        if (startTimer(list, { name, seconds, id, say: message })) starter.setAttribute('data-kp-timer-running', id);
    };
    /** @param {Event} event */
    const ended = (event) => {
        const id = /** @type {CustomEvent} */ (event).detail?.timer?.id;
        if (id)
            for (const starter of document.querySelectorAll(`${TIMER_START}[data-kp-timer-running="${CSS.escape(id)}"]`))
                starter.removeAttribute('data-kp-timer-running');
    };
    root.addEventListener('click', /** @type {EventListener} */ (start));
    root.addEventListener(TIMER_DONE_EVENT, ended);
    undo.push(() => {
        root.removeEventListener('click', /** @type {EventListener} */ (start));
        root.removeEventListener(TIMER_DONE_EVENT, ended);
    });
    return () => undo.forEach((u) => u());
}
