// One step at a time, large, with the screen kept on [kpadopt4; the AuDHD recipe app's cook mode].
//
// A recipe on a phone or a tablet on the counter: one step on the screen, in
// large type, with what that step needs, and two big buttons to go back and
// on. It is for reading and following, where the wizard is a form filled in
// page by page and the step list shows a whole run at once.
//
//   <div class="kp-focus-steps" data-kp-focus-steps aria-label="Chicken curry"></div>
//
//   setFocusSteps(el, [{ text: 'Rinse the rice…', ingredients: [{ amount: '300 g', name: 'basmati rice' }],
//                        timer: { seconds: 600, name: 'Rice' }, note: 'Do not walk away: it catches fast.' }, …], { start: 2 });
//   el.addEventListener('kp-focus-steps-change', (e) => remember(e.detail.index));
//
// Parts, made by the module: a head (`__head`) with "Step 3 of 8"
// (`__count`), the theme's progress bar (`__bar`), Read aloud (`__speak`,
// when the browser can) and the screen line (`__wake`); a body (`__body`)
// holding the step (`__step`: `__text`, the ingredients for this step
// `__needs`, a timer button `__timer`, a note `__note`); the two buttons
// (`__nav`: `__prev`, `__next`, which says Done on the last step).
//
// What it does:
//   - The screen stays on while it is attached and the page is shown (the
//     Wake Lock API, where the browser has it), asked again when the page
//     comes back, let go on detach; the head says which it is ("Screen stays
//     on" / "Screen may dim"), `data-kp-focus-steps-screen="on|off|unsupported"`.
//     `data-kp-focus-steps-wake="false"` does not ask.
//   - ArrowRight, PageDown and Space go on; ArrowLeft and PageUp go back;
//     Home and End go to the first and last step. A swipe across the step
//     does the same on a touch screen.
//   - The step arrives the theme's way (js/motion.js, at once under reduced
//     motion); the buttons stand where they stand, whatever the step's
//     length; a long step scrolls inside the body.
//   - A screen reader hears "Step 3 of 8" and the step on every change.
//   - A step's timer button is a starter of js/timer.js
//     (`data-kp-focus-steps-timers` names the timer list).
//
// States: setFocusStepsState(el, 'loading' | 'error' | 'ready', message):
// loading lays the busy card over the body, error says the message there;
// no steps says `data-kp-focus-steps-empty` (or the dictionary's sentence). The empty plate takes an action like the failed
// one [gaps-time-1019]: `data-kp-focus-steps-empty-action="Add a recipe"` puts a normal-size button on it that fires
// `kp-focus-steps-empty-action` on the root. Both attributes are read again when they change (js/live-options.js).
//
// Resume [gaps-time-1019]: with `data-kp-remember="<name>"` the place is kept after every move, in cook mode as well as in
// answer mode, and put back after a reload (`data-kp-resume` auto, ask or off; `data-kp-resume-until`): the active step, the
// place on every track, the active track and the steps passed, so a recipe with two tracks comes back as it was left, not on one
// step with everything else undone. A stored place is used only for the same steps (a key made of their ids or titles); a
// changed recipe starts at the top. A timer is not part of it. It is forgotten when the flow is done.
//
// Events (bubbling, on the root):
//   kp-focus-steps-change  { index, from, total, step }
//   kp-focus-steps-done    { total }             Done pressed on the last step
//   kp-focus-steps-wake    { state }             the screen line changed
//
// Answer mode [kpadopt6; Life's daily check-in, "dezelfde weergave om te antwoorden"]: a step that carries `answer` is a question,
// one per screen, with big answer buttons (and a root with `data-kp-focus-mode="answer"` has its empty, failed and save-failed
// states drawn as centred plates). A step without `answer` stays a reading step, so one flow can mix them.
//
//   setFocusSteps(el, [{ text: 'How was your energy?',
//                        answer: { id: 'energy', kind: 'choice', previous: 'ok', usual: 'good',
//                                  choices: [{ value: 'low', label: 'Low' }, { value: 'ok', label: 'Matig' }, { value: 'good', label: 'Good' }] } }, …]);
//   el.addEventListener('kp-focus-steps-answer', (e) => save(e.detail));      // { index, id, value, source, same?, previous }
//   el.addEventListener('kp-focus-steps-done', (e) => post(e.detail.answers)); // { total, answers, startedAt, finishedAt }
//
// `kind` is `choice` (one tap picks and the flow moves on after `data-kp-advance-ms`, 350, the read-back of what you hit), `multi`
// (several taps, then Next) or `text` (a box; Next saves; Not today passes). A step may offer "Same as yesterday: Matig"
// (`answer.previous`) and "Same as usual: Good" (`answer.usual`), each with its value in the label, and "Not today" (a skip is
// an answer: `source: 'skip'`, never blocks, never nags). Options (markup attribute, default):
//   data-kp-focus-mode      read | answer                       read (a step with `answer` is a question by itself)
//   data-kp-advance         auto | button                       auto for `choice`, button for `multi` and `text`
//   data-kp-advance-ms      350
//   data-kp-same            both | yesterday | usual | off      both (Kenny, 2026-10-17: two buttons)
//   data-kp-skip            present | off                       present
//   data-kp-pinned-first    JSON [{ value, label }]             none ("Nothing to log", "Not sure" stand first)
//   data-kp-back            present | off                       present; going back keeps every answer
//   data-kp-choice-layout   auto | stack | row                  auto (a row for up to three short labels; always stacked on a phone)
//   data-kp-choice-height   md | lg                             lg (56 px at least)
//   data-kp-progress        count | off                         count ("Question 3 of 7" and the bar)
//   data-kp-resume          auto | ask | off                    auto, with data-kp-remember="<name>"
//   data-kp-resume-until    midnight | hours:N | never          midnight (Europe/Brussels)
//   data-kp-summary         on | off                            off (a summary costs one of the seven screens)
//   data-kp-wake, data-kp-speak   true | false                  false in answer mode (cook mode keeps true)
//   data-kp-text-optional   true | false                        true
// Events: `kp-focus-steps-before-answer` (cancelable, `{ index, id, value, source }`), `kp-focus-steps-answer`,
// `kp-focus-steps-resume` (`{ index, answers }`), `kp-focus-steps-retry` and `kp-focus-steps-save-retry` (the plates' buttons).
// Keys while the focus is in the view: ArrowUp and ArrowDown between answers, Enter picks, `s` takes the same as yesterday,
// `u` the usual, `n` skips: all on the `?` sheet, none a digit or an AltGr key. States: `setFocusStepsState(el, 'save-error')`
// keeps the answers and says "Could not save your answers" with Try again.
//
// Parallel tracks [focus-tracks-1019; Kenny's AuDHD recipes: "de pasta koken terwijl we met de saus bezig zijn"]: a step may carry a
// `track` ("Pasta", "Saus"). Cook mode then shows the active track's step large and every track as a lane beside it (above it on a
// phone) with its progress and live timer; one tap on a lane, or the T key, switches track. Back and Next walk the active track
// only; each track keeps its own place. The composition is a grid of two columns (the step 2fr, the lanes 1fr; one column on a
// narrow root, the lanes as short rows above the step).
//
//   setFocusSteps(el, [{ id: 'water', track: 'Pasta', title: 'Boil the water', text: 'Put the pot on…', timer: { seconds: 600, name: 'Water' } },
//                      { id: 'onion', track: 'Sauce', title: 'Soften the onion', text: 'Chop the onion…' },
//                      { track: 'Pasta', title: 'Add the spaghetti', text: 'When the water boils…', waitFor: 'water' },
//                      { track: 'Together', text: 'Toss…', waitFor: ['Pasta', 'Sauce'] }, …]);
//   el.addEventListener('kp-focus-steps-track', (e) => remember(e.detail.track));
//
//   - A step without `track` belongs to the shared lane (`data-kp-track-shared`, "Together"). One track only is a plain sequence.
//   - `waitFor` (alias `after`) names step ids, or a whole track by its name: the step cannot be started until each of them is
//     done. A step is done when it was passed with Next AND its timer, if one was started, has ended. A step that waits shows what
//     it waits for, with the time left, and a button to the track that can go on.
//   - A step timer has an id of its own (`timer.id`, else the step's `id`) and runs in the timer list (`data-kp-focus-steps-timers`),
//     so the lanes read it by that id. When it ends, or a track that waited can go on, js/attention.js puts the track on the band
//     above the step, with a button that goes there.
//   - Keys: T goes to the next track, Shift T to the previous one; the lanes are tabs (role tablist, aria-selected, one tab stop): ArrowUp, ArrowDown, Home and End move the focus between them while one has it.
//
//   Options (attribute, default):
//     data-kp-tracks         auto | off            auto (off reads every step as one sequence)
//     data-kp-lanes          auto | side | top     auto (side when the root is 44rem wide or more)
//     data-kp-lane-detail    full | compact        full (compact leaves out "Step 2 of 4" in the lane)
//     data-kp-track-follow   suggest | auto        suggest (auto switches to the track that needs you when this one waits or ends)
//     data-kp-track-attention on | off             on (the band above the step)
//     data-kp-track-shared   text                  the dictionary's "Together"
//   Events: `kp-focus-steps-track` { track, key, from, index, step, reason: 'tap' | 'key' | 'script' | 'attention' | 'auto' } on a switch,
//   `kp-focus-steps-track-attention` { track, key, reason: 'timer' | 'ready', index } when a track asks for you, and
//   `kp-focus-steps-change` also carries `track`. `kp-focus-steps-done` fires when every track is finished.
//
// Every word it adds is in js/strings.js. Nothing runs on import.

import { getStrings } from './strings.js';
import { buildProgressbar } from './progressbar.js';
import { openBusyCard } from './busy-card.js';
import { registerShortcuts } from './shortcuts.js';
import { memoryFor } from './remember.js';
import { statePlate } from './state-plate.js';
import { agoMoment } from './freshness.js';
import { formatCountdown } from './countdown.js';
import { setAttention } from './attention.js';
import { watchOptions } from './live-options.js';

export const FOCUS_STEPS = '[data-kp-focus-steps]';
export const FOCUS_STEPS_EVENT = 'kp-focus-steps-change';
export const FOCUS_STEPS_DONE_EVENT = 'kp-focus-steps-done';
export const FOCUS_STEPS_WAKE_EVENT = 'kp-focus-steps-wake';
/** Fired on the root, cancelable, before an answer is taken: `{ index, id, value, source }`. */
export const FOCUS_STEPS_BEFORE_ANSWER_EVENT = 'kp-focus-steps-before-answer';
/** Fired on the root when a question was answered: `{ index, id, value, source: 'tap' | 'same' | 'skip', same?, previous }`. */
export const FOCUS_STEPS_ANSWER_EVENT = 'kp-focus-steps-answer';
/** Fired on the root when answers were put back after a break: `{ index, answers }`. */
export const FOCUS_STEPS_RESUME_EVENT = 'kp-focus-steps-resume';
/** Fired on the root when Retry is pressed on the plate of questions that could not be read. */
export const FOCUS_STEPS_RETRY_EVENT = 'kp-focus-steps-retry';
/** Fired on the root when the action of the empty plate (`data-kp-focus-steps-empty-action`) is pressed [gaps-time-1019]. */
export const FOCUS_STEPS_EMPTY_ACTION_EVENT = 'kp-focus-steps-empty-action';
/** Fired on the root when Try again is pressed on the plate of answers that could not be saved. */
export const FOCUS_STEPS_SAVE_RETRY_EVENT = 'kp-focus-steps-save-retry';
/** Fired on the root when the active track changed: `{ track, key, from, index, step, reason }`. */
export const FOCUS_STEPS_TRACK_EVENT = 'kp-focus-steps-track';
/** Fired on the root when a track asks for the person: `{ track, key, reason: 'timer' | 'ready', index }`. */
export const FOCUS_STEPS_TRACK_ATTENTION_EVENT = 'kp-focus-steps-track-attention';
/** How far a finger has to travel across the step to turn it [px]. */
export const SWIPE_DISTANCE = 56;

/**
 * @typedef {object} FocusIngredient
 * @property {string} name
 * @property {string} [amount]
 */

/**
 * @typedef {object} FocusChoice
 * @property {string} value
 * @property {string} label
 * @property {boolean} [disabled]
 * @property {string} [reason] why it cannot be picked, shown under its label
 */

/**
 * @typedef {object} FocusAnswer
 * @property {string} id names the answer in the events and the done payload
 * @property {'choice' | 'multi' | 'text'} kind
 * @property {FocusChoice[]} [choices]
 * @property {string | string[]} [previous] yesterday's answer: offered as "Same as yesterday"
 * @property {string | string[]} [usual] the usual answer: offered as "Same as usual"
 * @property {string} [placeholder] a text box's hint
 */

/**
 * @typedef {object} FocusStep
 * @property {string} text
 * @property {FocusAnswer} [answer] makes the step a question
 * @property {(FocusIngredient | string)[]} [ingredients]
 * @property {{ seconds: number, name?: string, id?: string }} [timer] `id` names the timer in the timer list (default: the step's `id`)
 * @property {string} [id] names the step for `waitFor` and for its timer (default `step-<n>`)
 * @property {string} [track] the line of work it belongs to ("Pasta"); steps with none belong to the shared lane
 * @property {string} [title] a short name for the step, used in the lanes and where another step waits for it
 * @property {string | string[]} [waitFor] step ids, or track names, that must be done before this step can start
 * @property {string | string[]} [after] the same as `waitFor`
 * @property {string} [note]
 * @property {'info' | 'warning'} [noteTone]
 */

/**
 * @typedef {object} FocusState
 * @property {FocusStep[]} steps
 * @property {number} index
 * @property {WakeLockSentinel | null} wake
 * @property {string} wakeState
 * @property {import('./busy-card.js').BusyCard | null} busy
 * @property {Record<string, { value: string | string[] | null, source: string }>} answers
 * @property {Record<string, string | string[]>} draft the taps of a multi step and the words of a text step, before Next
 * @property {number} timer the pending advance after a tap
 * @property {number} startedAt
 * @property {Track[]} tracks the lines of work, in the order the steps name them (one only: no lanes)
 * @property {string} track the key of the active track
 * @property {Set<number>} done the steps passed with Next
 * @property {Map<string, TrackAlert>} alerts the tracks asking for the person, by track key
 * @property {Set<string>} waiting the tracks that waited when the lanes were last read
 * @property {string} lockKey the steps the shown step waits for, as a key
 * @property {number} ticker the interval that keeps the lanes' clocks, 0 when none
 * @property {Progress | null} pendingResume
 * @property {{ total: number, answers: FocusState['answers'], startedAt: number, finishedAt: number } | null} finished
 */

/**
 * @typedef {object} Progress where a person stopped
 * @property {number} index
 * @property {FocusState['answers']} answers
 * @property {number} startedAt
 * @property {string} [track] the key of the active track
 * @property {Record<string, number>} [positions] the place on every track, by track key
 * @property {number[]} [done] the steps passed
 */

/**
 * @typedef {object} Track
 * @property {string} key the name the steps give it ('' for the shared lane)
 * @property {string} name
 * @property {number[]} order the step indexes, in recipe order
 * @property {number} pos where on the track the person is
 */

/**
 * @typedef {object} TrackAlert
 * @property {'timer' | 'ready'} reason
 * @property {string} title
 * @property {string} text
 * @property {number} index the step the track is on
 * @property {string} [timerId]
 */

/** @type {WeakMap<Element, FocusState>} */
const STATES = new WeakMap();
/** @type {WeakSet<Element>} */
const WIRED = new WeakSet();
let serial = 0;

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @returns {FocusState} */
const stateOf = (root) => {
    let state = STATES.get(root);
    if (!state) {
        state = {
            steps: [],
            index: 0,
            wake: null,
            wakeState: 'off',
            busy: null,
            answers: {},
            draft: {},
            timer: 0,
            startedAt: 0,
            pendingResume: null,
            finished: null,
            tracks: [],
            track: '',
            done: new Set(),
            alerts: new Map(),
            waiting: new Set(),
            lockKey: '',
            ticker: 0,
        };
        STATES.set(root, state);
    }
    return state;
};

/** @param {Element} root @param {string} name @returns {HTMLElement} */
const part = (root, name) => /** @type {HTMLElement} */ (root.querySelector(`.kp-focus-steps__${name}`));

/** Lay the parts once. @param {HTMLElement} root */
function build(root) {
    if (root.querySelector('.kp-focus-steps__head')) return;
    const strings = getStrings();
    serial += 1;
    const head = el('kp-focus-steps__head');
    const count = el('kp-focus-steps__count');
    count.id = `kp-focus-steps-${serial}-count`;
    const bar = el('kp-progressbar kp-focus-steps__bar');
    bar.setAttribute('aria-hidden', 'true');
    buildProgressbar(bar);
    bar.removeAttribute('role');
    const tools = el('kp-focus-steps__tools');
    const wake = el('kp-focus-steps__wake', 'span');
    const speak = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-focus-steps__speak', 'button'));
    speak.type = 'button';
    const said = el('kp-focus-steps__speak-text', 'span');
    said.textContent = strings.focusReadAloud;
    said.setAttribute('data-kp-words', `${strings.focusReadAloud}\n${strings.focusStopReading}`);
    speak.append(said);
    speak.setAttribute('aria-pressed', 'false');
    speak.hidden = typeof speechSynthesis === 'undefined';
    tools.append(wake, speak);
    head.append(count, tools, bar);
    const body = el('kp-focus-steps__body');
    const step = el('kp-focus-steps__step', 'article');
    step.setAttribute('aria-labelledby', count.id);
    step.tabIndex = -1;
    body.append(step);
    const nav = el('kp-focus-steps__nav');
    const prev = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--lg kp-focus-steps__prev', 'button'));
    prev.type = 'button';
    const next = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--lg kp-button--primary kp-focus-steps__next', 'button'));
    next.type = 'button';
    for (const [button, word, glyph] of /** @type {const} */ ([
        [prev, strings.focusPrevious, 'prev'],
        [next, strings.focusNext, 'next'],
    ])) {
        const mark = el(`kp-focus-steps__glyph kp-focus-steps__glyph--${glyph}`, 'span');
        mark.setAttribute('aria-hidden', 'true');
        const text = el('kp-button__text', 'span');
        text.textContent = word;
        if (glyph === 'prev') button.append(mark, text);
        else button.append(text, mark);
    }
    nav.append(prev, next);
    const live = el('kp-sr-only kp-focus-steps__live', 'span');
    live.setAttribute('role', 'status');
    root.append(head, body, nav, live);
    if (!root.hasAttribute('role')) root.setAttribute('role', 'region');
    if (root.tabIndex < 0 && !root.hasAttribute('tabindex')) root.tabIndex = -1;
}

// ── Parallel tracks [focus-tracks-1019] ────────────────────────────────────────────────────────

/** The js/timer.js module once it has loaded: the lanes read the timer list through it. @type {typeof import('./timer.js') | null} */
let timerModule = null;

/** Whether this view shows lanes: two or more tracks, and the option not off. @param {Element} root */
const tracksOn = (root) => stateOf(root).tracks.length > 1 && opt(root, 'tracks', 'auto') !== 'off';

/** @param {FocusState} state @param {number} i */
const stepKeyOf = (state, i) => state.steps[i]?.id ?? `step-${i + 1}`;

/** The id a step's timer has in the timer list. @param {FocusState} state @param {number} i */
const timerIdOf = (state, i) => state.steps[i]?.timer?.id ?? stepKeyOf(state, i);

/** @param {FocusState} state @param {number} i */
const trackOfStep = (state, i) => state.tracks.find((t) => t.order.includes(i));

/** @param {FocusState} state */
const activeTrack = (state) => state.tracks.find((t) => t.key === state.track) ?? state.tracks[0];

/**
 * Lay the tracks out of the steps: one per distinct `track`, in the order the steps name them; a step with none is in the shared
 * lane. Where each track stood is kept when the steps are laid again.
 * @param {HTMLElement} root
 */
function layTracks(root) {
    const state = stateOf(root);
    const shared = opt(root, 'track-shared') || getStrings().focusTrackShared;
    /** @type {Map<string, Track>} */
    const found = new Map();
    state.steps.forEach((step, i) => {
        const key = step.track ?? '';
        let track = found.get(key);
        if (!track) {
            track = { key, name: key || shared, order: [], pos: 0 };
            found.set(key, track);
        }
        track.order.push(i);
    });
    const before = new Map(state.tracks.map((t) => [t.key, t.pos]));
    state.tracks = [...found.values()];
    for (const track of state.tracks) track.pos = Math.min(track.order.length - 1, before.get(track.key) ?? 0);
    if (!state.tracks.some((t) => t.key === state.track)) state.track = state.tracks[0]?.key ?? '';
}

/** The timer list the steps' timers run in. @param {Element} root */
function timerList(root) {
    const named = root.getAttribute('data-kp-focus-steps-timers');
    const found = named ? document.getElementById(named) : document.querySelector('[data-kp-timers]');
    return found instanceof HTMLElement ? found : null;
}

/** The timers of the list, now. @param {Element} root @returns {import('./timer.js').TimerState[]} */
function timerStates(root) {
    const list = timerList(root);
    return list && timerModule ? timerModule.getTimers(list) : [];
}

/** @param {import('./timer.js').TimerState | undefined} timer */
const isOpen = (timer) => timer !== undefined && (timer.state === 'running' || timer.state === 'paused');

/** A step is done when it was passed and its timer, if one was started, has ended. @param {FocusState} state @param {number} i @param {import('./timer.js').TimerState[]} timers */
const stepDone = (state, i, timers) => state.done.has(i) && !isOpen(timers.find((t) => t.id === timerIdOf(state, i)));

/** @param {FocusStep} step */
const refsOf = (step) => [step.waitFor, step.after].flat().filter((ref) => typeof ref === 'string' && ref !== '');

/**
 * What a step waits for and has not got yet: for a step reference that step, for a track reference the first step of it
 * that is not done. A reference nobody carries waits for nothing.
 * @param {FocusState} state @param {number} i @param {import('./timer.js').TimerState[]} timers
 * @returns {{ index: number, whole: boolean, track: Track | undefined }[]}
 */
function blockersOf(state, i, timers) {
    /** @type {{ index: number, whole: boolean, track: Track | undefined }[]} */
    const out = [];
    for (const ref of refsOf(state.steps[i] ?? /** @type {FocusStep} */ ({}))) {
        const at = state.steps.findIndex((_, k) => stepKeyOf(state, k) === ref);
        const whole = at < 0;
        const track = whole ? state.tracks.find((t) => t.key === ref || t.name === ref) : trackOfStep(state, at);
        const targets = whole ? (track?.order ?? []) : [at];
        const index = targets.find((k) => k !== i && !stepDone(state, k, timers));
        if (index !== undefined && !out.some((b) => b.index === index)) out.push({ index, whole, track });
    }
    return out;
}

/** The short name of a step: its title, else "Pasta, step 2". @param {FocusState} state @param {number} i */
function stepLabel(state, i) {
    const track = trackOfStep(state, i);
    return state.steps[i]?.title ?? getStrings().focusTrackStepName(track?.name ?? '', (track?.order.indexOf(i) ?? 0) + 1);
}

/** "Pasta and Sauce". @param {string[]} names */
function joinNames(names) {
    try {
        return new Intl.ListFormat(document.documentElement.lang || 'en', { type: 'conjunction' }).format(names);
    } catch {
        return names.join(', ');
    }
}

/** What the blockers are called: a step by its name, a whole track by the track's. @param {FocusState} state @param {ReturnType<typeof blockersOf>} blocks */
const blockerNames = (state, blocks) => joinNames(blocks.map((b) => (b.whole ? (b.track?.name ?? '') : stepLabel(state, b.index))));

/**
 * @typedef {object} Lane
 * @property {Track} track
 * @property {string} key
 * @property {string} name
 * @property {boolean} active
 * @property {'ready' | 'running' | 'paused' | 'waiting' | 'ringing' | 'finished'} status
 * @property {import('./timer.js').TimerState | null} timer the clock the lane shows
 * @property {ReturnType<typeof blockersOf>} blocks
 */

/**
 * Where each track stands, now.
 * @param {HTMLElement} root
 * @returns {Lane[]}
 */
function laneSummaries(root) {
    const state = stateOf(root);
    const timers = timerStates(root);
    return state.tracks.map((track) => {
        const cur = track.order[track.pos] ?? 0;
        const passed = track.order.every((i) => state.done.has(i));
        const timersOf = track.order.map((i) => timers.find((t) => t.id === timerIdOf(state, i))).filter((t) => t !== undefined);
        const running = timersOf.filter((t) => t.state === 'running').sort((a, b) => a.remaining - b.remaining);
        const paused = timersOf.filter((t) => t.state === 'paused').sort((a, b) => a.remaining - b.remaining);
        const alert = state.alerts.get(track.key);
        const blocks = passed ? [] : blockersOf(state, cur, timers);
        /** @type {Lane['status']} */
        const status =
            passed && running.length === 0 && paused.length === 0
                ? 'finished'
                : alert?.reason === 'timer'
                  ? 'ringing'
                  : blocks.length
                    ? 'waiting'
                    : running.length
                      ? 'running'
                      : paused.length
                        ? 'paused'
                        : 'ready';
        const ringer = alert?.timerId ? timers.find((t) => t.id === alert.timerId) : undefined;
        const timer = status === 'ringing' ? (ringer ?? null) : (running[0] ?? paused[0] ?? null);
        return { track, key: track.key, name: track.name, active: track.key === state.track, status, timer, blocks };
    });
}

/** Write text into a part only when it changed. @param {Element} node @param {string} selector @param {string} text */
function setText(node, selector, text) {
    const target = node.querySelector(selector);
    if (target && target.textContent !== text) target.textContent = text;
}

/** @param {import('./timer.js').TimerState} timer */
const clockOfTimer = (timer) => formatCountdown(timer.remaining * 1000, timer.seconds >= 3600);

/** The lanes and the band, made once, around the head. @param {HTMLElement} root */
function ensureLanes(root) {
    const found = root.querySelector('.kp-focus-steps__lanes');
    if (found) return found;
    const strings = getStrings();
    serial += 1;
    const lanes = el('kp-focus-steps__lanes', 'section');
    const title = el('kp-focus-steps__lanes-title', 'h3');
    title.id = `kp-focus-steps-${serial}-lanes`;
    title.textContent = strings.focusTracksTitle;
    const done = el('kp-focus-steps__lanes-done', 'span');
    const list = el('kp-focus-steps__lane-list');
    // The lanes pick which track is shown, which is what tabs do: a tablist, the step area its tabpanel.
    list.id = `kp-focus-steps-${serial}-tablist`;
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-orientation', 'vertical');
    list.setAttribute('aria-labelledby', title.id);
    const hint = el('kp-focus-steps__lanes-hint', 'p');
    hint.textContent = strings.focusTracksHint;
    lanes.setAttribute('aria-labelledby', title.id);
    lanes.append(title, done, list, hint);
    const band = el('kp-attention kp-focus-steps__band');
    band.setAttribute('aria-label', strings.focusTrackBand);
    const head = part(root, 'head');
    head.before(band);
    head.after(lanes);
    return lanes;
}

/** Take the lanes and the band away again (the steps no longer name two tracks). @param {HTMLElement} root */
function dropLanes(root) {
    root.querySelector('.kp-focus-steps__lanes')?.remove();
    root.querySelector('.kp-focus-steps__band')?.remove();
    root.removeAttribute('data-kp-focus-tracked');
    root.removeAttribute('data-kp-lanes-at');
    const panel = root.querySelector('.kp-focus-steps__body');
    for (const name of ['role', 'aria-labelledby']) panel?.removeAttribute(name);
}

/** One lane: a button of the package, its words in four places and the theme's progress bar. @param {Lane} lane @param {number} at */
function buildLane(lane, at) {
    const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-focus-steps__lane', 'button'));
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('data-kp-track-at', String(at));
    button.setAttribute('data-kp-track-key', lane.key);
    for (const name of ['name', 'time', 'step', 'state', 'count']) button.append(el(`kp-focus-steps__lane-${name}`, 'span'));
    const bar = el('kp-progressbar kp-focus-steps__lane-bar', 'span');
    bar.setAttribute('aria-hidden', 'true');
    buildProgressbar(bar);
    bar.removeAttribute('role');
    button.append(bar);
    return button;
}

/**
 * Draw the lanes in place: only a word that changed is written, so a focused lane keeps its focus and the clocks cost nothing.
 * @param {HTMLElement} root @param {Lane[]} [lanes]
 */
function paintLanes(root, lanes = laneSummaries(root)) {
    const section = root.querySelector('.kp-focus-steps__lanes');
    if (!section) return;
    const strings = getStrings();
    const state = stateOf(root);
    const list = /** @type {HTMLElement} */ (section.querySelector('.kp-focus-steps__lane-list'));
    if (list.children.length !== lanes.length || lanes.some((l, i) => list.children[i]?.getAttribute('data-kp-track-key') !== l.key))
        list.replaceChildren(...lanes.map(buildLane));
    list.style.setProperty('--kp-focus-lanes', String(lanes.length));
    lanes.forEach((lane, i) => {
        const button = /** @type {HTMLElement} */ (list.children[i]);
        const total = lane.track.order.length;
        const words =
            lane.status === 'running' && lane.timer
                ? strings.focusLaneRunning(lane.timer.name)
                : lane.status === 'paused' && lane.timer
                  ? strings.focusLanePaused(lane.timer.name)
                  : lane.status === 'waiting'
                    ? strings.focusLaneWaiting(blockerNames(state, lane.blocks))
                    : lane.status === 'ringing'
                      ? strings.focusLaneRinging
                      : lane.status === 'finished'
                        ? strings.focusLaneFinished
                        : lane.active
                          ? strings.focusLaneHere
                          : strings.focusLaneReady;
        setText(button, '.kp-focus-steps__lane-name', lane.name);
        setText(button, '.kp-focus-steps__lane-time', lane.timer ? (lane.status === 'ringing' ? clockOfTimer({ ...lane.timer, remaining: 0 }) : clockOfTimer(lane.timer)) : '');
        setText(button, '.kp-focus-steps__lane-step', stepLabel(state, lane.track.order[lane.track.pos] ?? 0));
        setText(button, '.kp-focus-steps__lane-state', words);
        setText(button, '.kp-focus-steps__lane-count', strings.focusLaneStep(lane.track.pos + 1, total));
        if (button.getAttribute('data-kp-lane-status') !== lane.status) button.setAttribute('data-kp-lane-status', lane.status);
        // Tabs pattern: one tab stop (the selected lane), the arrows move between lanes, the step area is the tabpanel.
        const selected = String(lane.active);
        if (button.getAttribute('aria-selected') !== selected) button.setAttribute('aria-selected', selected);
        const stop = lane.active ? '0' : '-1';
        if (button.getAttribute('tabindex') !== stop) button.setAttribute('tabindex', stop);
        if (!button.id) button.id = `${list.id}-${i}`;
        if (lane.active) {
            const panel = root.querySelector('.kp-focus-steps__body');
            if (panel) {
                if (!panel.id) panel.id = `${list.id}-panel`;
                if (panel.getAttribute('role') !== 'tabpanel') panel.setAttribute('role', 'tabpanel');
                if (panel.getAttribute('aria-labelledby') !== button.id) panel.setAttribute('aria-labelledby', button.id);
                if (button.getAttribute('aria-controls') !== panel.id) button.setAttribute('aria-controls', panel.id);
            }
        } else button.removeAttribute('aria-controls');
        const share = String(lane.status === 'finished' ? 1 : (lane.track.pos + 1) / total);
        const bar = /** @type {HTMLElement} */ (button.querySelector('.kp-focus-steps__lane-bar'));
        if (bar.style.getPropertyValue('--kp-value') !== share) bar.style.setProperty('--kp-value', share);
    });
    setText(section, '.kp-focus-steps__lanes-done', strings.focusTracksDone(state.done.size, state.steps.length));
}

/** Which side the lanes stand on: beside the step on a wide root, above it on a narrow one. @param {HTMLElement} root */
function layoutLanes(root) {
    const asked = opt(root, 'lanes', 'auto');
    const rem = Number.parseFloat(getComputedStyle(root).fontSize) || 16;
    const at = asked === 'side' || asked === 'top' ? asked : root.clientWidth >= 44 * rem ? 'side' : 'top';
    if (root.getAttribute('data-kp-lanes-at') !== at) root.setAttribute('data-kp-lanes-at', at);
}

/** The band above the step: the tracks asking for the person, worst first, each with the button that goes there. @param {HTMLElement} root */
function renderBand(root) {
    const band = root.querySelector('.kp-focus-steps__band');
    if (!(band instanceof HTMLElement)) return;
    const state = stateOf(root);
    const strings = getStrings();
    const off = opt(root, 'track-attention', 'on') === 'off';
    const items = off
        ? []
        : [...state.alerts].map(([key, alert]) => {
              const at = state.tracks.findIndex((t) => t.key === key);
              const track = state.tracks[at];
              const action = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
              action.type = 'button';
              if (key !== state.track) {
                  action.textContent = strings.focusTrackGo(track?.name ?? '');
                  action.setAttribute('data-kp-focus-go', String(at));
              } else {
                  action.textContent = strings.focusTrackGotIt;
                  action.setAttribute('data-kp-focus-dismiss', String(at));
              }
              return { key: `track-${at}`, severity: /** @type {const} */ ('warning'), title: alert.title, text: alert.text, action };
          });
    setAttention(band, items);
}

/**
 * A track asks for the person: it goes on the band and the page hears it.
 * @param {HTMLElement} root @param {Track} track @param {TrackAlert} alert
 */
function raiseAlert(root, track, alert) {
    const state = stateOf(root);
    state.alerts.set(track.key, alert);
    renderBand(root);
    say(root, `${alert.title}. ${alert.text}`);
    root.dispatchEvent(
        new CustomEvent(FOCUS_STEPS_TRACK_ATTENTION_EVENT, { bubbles: true, detail: { track: track.name, key: track.key, reason: alert.reason, index: alert.index } }),
    );
}

/** A track's alert is answered: the person went there, stepped on, or said got it. @param {HTMLElement} root @param {string} key */
function clearAlert(root, key) {
    if (stateOf(root).alerts.delete(key)) renderBand(root);
}

/** The words of a waiting step: what it waits for, and for a timer how long. @param {FocusState} state @param {ReturnType<typeof blockersOf>} blocks @param {import('./timer.js').TimerState[]} timers @param {number} index the waiting step */
function waitLine(state, blocks, timers, index) {
    const strings = getStrings();
    return blocks
        .map((b) => {
            const timer = timers.find((t) => t.id === timerIdOf(state, b.index));
            // The track is named when it is another one; a step that waits for its own track's step needs no name.
            const where = b.track && b.track !== trackOfStep(state, index) ? b.track.name : '';
            const words = isOpen(timer) && timer ? strings.focusTrackWaitLeft(clockOfTimer(timer)) : strings.focusTrackWaitOpen;
            return where ? `${where}, ${words}` : words;
        })
        .join(' · ');
}

/** The lane that could use the person next: one whose timer ended, else one that is ready. @param {Lane[]} lanes */
const suggestion = (lanes) => lanes.find((l) => !l.active && l.status === 'ringing') ?? lanes.find((l) => !l.active && l.status === 'ready');

/**
 * Go to a track: its own place, its own step. The event tells the page.
 * @param {HTMLElement} root @param {string} key @param {'tap' | 'key' | 'script' | 'attention' | 'auto'} reason
 * @returns {boolean} whether it moved
 */
function switchTrack(root, key, reason) {
    const state = stateOf(root);
    const to = state.tracks.find((t) => t.key === key);
    if (!to || key === state.track || root.hasAttribute('aria-busy')) return false;
    const from = activeTrack(state);
    state.track = key;
    state.index = to.order[to.pos] ?? 0;
    state.alerts.delete(key);
    renderBand(root);
    paint(root, true);
    remember(root);
    const strings = getStrings();
    say(root, strings.focusTrackSwitched(to.name, strings.focusLaneStep(to.pos + 1, to.order.length), state.steps[state.index]?.text ?? ''));
    root.dispatchEvent(
        new CustomEvent(FOCUS_STEPS_TRACK_EVENT, {
            bubbles: true,
            detail: { track: to.name, key: to.key, from: from?.name ?? '', index: state.index, step: state.steps[state.index] ?? null, reason },
        }),
    );
    return true;
}

/** Go to the next or previous track. @param {HTMLElement} root @param {1 | -1} by @param {'key' | 'tap'} [reason] */
function stepTrack(root, by, reason = 'key') {
    const state = stateOf(root);
    const at = state.tracks.findIndex((t) => t.key === state.track);
    const to = state.tracks[(at + by + state.tracks.length) % state.tracks.length];
    return to ? switchTrack(root, to.key, reason) : false;
}

/** With `data-kp-track-follow="auto"`, a track that waits or has ended hands the person to the one that needs them. @param {HTMLElement} root */
function follow(root) {
    if (opt(root, 'track-follow', 'suggest') !== 'auto') return;
    const lanes = laneSummaries(root);
    const here = lanes.find((l) => l.active);
    if (!here || (here.status !== 'waiting' && here.status !== 'finished')) return;
    const next = suggestion(lanes);
    if (next) switchTrack(root, next.key, 'auto');
}

/** The steps the shown step waits for, as a key ('' when it waits for none or its track is passed). @param {HTMLElement} root */
function lockKeyOf(root) {
    const state = stateOf(root);
    const here = activeTrack(state);
    if (!here || here.order.every((i) => state.done.has(i))) return '';
    return blockersOf(state, here.order[here.pos] ?? 0, timerStates(root))
        .map((b) => b.index)
        .join(',');
}

/**
 * The tracks changed under the lanes (a timer, a step passed): read them again, ask for the person where a track can go on, draw
 * the lanes, and draw the step again when its lock lifted or fell.
 * @param {HTMLElement} root
 */
function recompute(root) {
    if (!tracksOn(root)) return;
    const state = stateOf(root);
    const lanes = laneSummaries(root);
    const strings = getStrings();
    for (const lane of lanes) {
        if (lane.status === 'waiting' || !state.waiting.has(lane.key) || lane.status === 'finished') continue;
        const cur = lane.track.order[lane.track.pos] ?? 0;
        if (lane.active) {
            // The person is looking at it: the step takes the plate's place, and the sentence is for a screen reader.
            say(root, strings.focusTrackUnlocked(stepLabel(state, cur)));
        } else if (!state.alerts.has(lane.key)) {
            raiseAlert(root, lane.track, {
                reason: 'ready',
                title: strings.focusTrackReadyTitle(lane.name),
                text: strings.focusTrackNextUp(stepLabel(state, cur)),
                index: cur,
            });
        }
    }
    state.waiting = new Set(lanes.filter((l) => l.status === 'waiting').map((l) => l.key));
    if (lockKeyOf(root) !== state.lockKey) paint(root, false);
    else {
        paintLanes(root, laneSummaries(root));
        paintLive(root, timerStates(root));
    }
    follow(root);
}

/** The step's timer button and the waiting plate follow the clock. @param {HTMLElement} root @param {import('./timer.js').TimerState[]} timers */
function paintLive(root, timers) {
    const state = stateOf(root);
    const strings = getStrings();
    const holder = part(root, 'step');
    const button = holder.querySelector('.kp-focus-steps__timer');
    const step = state.steps[state.index];
    if (button && step?.timer) {
        const timer = timers.find((t) => t.id === timerIdOf(state, state.index));
        const minutes = Math.round(step.timer.seconds / 60);
        const base = strings.focusTimer(step.timer.seconds < 60 ? `${step.timer.seconds} s` : `${minutes} min`);
        const words = !timer
            ? base
            : timer.state === 'running'
              ? strings.focusTimerRunning(clockOfTimer(timer))
              : timer.state === 'paused'
                ? strings.focusTimerPaused(clockOfTimer(timer))
                : strings.focusTimerDone;
        if (button.textContent !== words) button.textContent = words;
    }
    const line = holder.querySelector('.kp-focus-steps__wait-line');
    if (line) {
        const here = activeTrack(state);
        const text = waitLine(state, blockersOf(state, state.index, timers), timers, state.index);
        if (here && line.textContent !== text) line.textContent = text;
    }
}

/**
 * Next on the active track: the step is passed, the track goes on to its next, or is finished. A step that waits is not passed.
 * @param {HTMLElement} root
 */
function trackNext(root) {
    const state = stateOf(root);
    const track = activeTrack(state);
    if (!track || !state.steps.length || root.hasAttribute('aria-busy')) return;
    const from = track.order[track.pos] ?? 0;
    if (blockersOf(state, from, timerStates(root)).length) return;
    state.alerts.delete(track.key);
    state.done.add(from);
    if (track.pos < track.order.length - 1) {
        track.pos += 1;
        state.index = track.order[track.pos] ?? from;
    }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    renderBand(root);
    paint(root, true);
    const strings = getStrings();
    const finished = track.order.every((i) => state.done.has(i));
    say(
        root,
        finished
            ? strings.focusTrackFinishedTitle(track.name)
            : `${strings.focusTrackCount(track.name, track.pos + 1, track.order.length)}. ${state.steps[state.index]?.text ?? ''}`,
    );
    root.dispatchEvent(
        new CustomEvent(FOCUS_STEPS_EVENT, {
            bubbles: true,
            detail: { index: state.index, from, total: state.steps.length, step: state.steps[state.index] ?? null, track: track.name },
        }),
    );
    recompute(root);
    if (state.tracks.every((t) => t.order.every((i) => state.done.has(i)))) {
        // Done: nothing is left to come back to.
        memoryOf(root)?.forget('progress');
        root.dispatchEvent(new CustomEvent(FOCUS_STEPS_DONE_EVENT, { bubbles: true, detail: { total: state.steps.length, tracks: state.tracks.map((t) => t.name) } }));
    } else remember(root);
}

/** Back on the active track: from the finished plate the last step again, else the step before, to be done again. @param {HTMLElement} root */
function trackPrev(root) {
    const state = stateOf(root);
    const track = activeTrack(state);
    if (!track || root.hasAttribute('aria-busy')) return false;
    const from = track.order[track.pos] ?? 0;
    if (state.done.has(from)) state.done.delete(from);
    else if (track.pos > 0) {
        track.pos -= 1;
        state.index = track.order[track.pos] ?? from;
        state.done.delete(state.index);
    } else return false;
    state.alerts.delete(track.key);
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    renderBand(root);
    paint(root, true);
    const strings = getStrings();
    say(root, `${strings.focusTrackCount(track.name, track.pos + 1, track.order.length)}. ${state.steps[state.index]?.text ?? ''}`);
    root.dispatchEvent(
        new CustomEvent(FOCUS_STEPS_EVENT, {
            bubbles: true,
            detail: { index: state.index, from, total: state.steps.length, step: state.steps[state.index] ?? null, track: track.name },
        }),
    );
    recompute(root);
    remember(root);
    return true;
}

/**
 * A script goes to a step: its track becomes the active one, at that step.
 * @param {HTMLElement} root @param {number} index
 * @returns {boolean} whether it moved
 */
function trackGo(root, index) {
    const state = stateOf(root);
    const to = Math.max(0, Math.min(state.steps.length - 1, index));
    const track = trackOfStep(state, to);
    if (!track || root.hasAttribute('aria-busy')) return false;
    const was = state.index;
    if (track.key === state.track && to === was) return false;
    track.pos = track.order.indexOf(to);
    if (track.key !== state.track) {
        state.track = track.key;
        state.index = to;
        state.alerts.delete(track.key);
        renderBand(root);
        paint(root, true);
        root.dispatchEvent(
            new CustomEvent(FOCUS_STEPS_TRACK_EVENT, {
                bubbles: true,
                detail: { track: track.name, key: track.key, from: '', index: to, step: state.steps[to] ?? null, reason: 'script' },
            }),
        );
    } else {
        state.index = to;
        paint(root, true);
    }
    root.dispatchEvent(
        new CustomEvent(FOCUS_STEPS_EVENT, { bubbles: true, detail: { index: to, from: was, total: state.steps.length, step: state.steps[to] ?? null, track: track.name } }),
    );
    remember(root);
    recompute(root);
    return true;
}

/**
 * A step timer ended: its track asks for the person.
 * @param {HTMLElement} root @param {number} i the step @param {import('./timer.js').TimerState} timer
 */
function timerEnded(root, i, timer) {
    const state = stateOf(root);
    const track = trackOfStep(state, i);
    if (!track) return;
    const strings = getStrings();
    const lane = laneSummaries(root).find((l) => l.key === track.key);
    const cur = track.order[track.pos] ?? i;
    const text =
        !lane || lane.status === 'finished'
            ? strings.focusTrackNothingLeft(track.name)
            : lane.status === 'waiting'
              ? strings.focusLaneWaiting(blockerNames(state, lane.blocks))
              : strings.focusTrackNextUp(stepLabel(state, cur));
    raiseAlert(root, track, { reason: 'timer', title: strings.focusTrackTimerDone(timer.name, track.name), text, index: cur, timerId: timer.id });
}

/** Lay the tracks, find where the person is, and bring in the timer list the lanes read. @param {HTMLElement} root @param {number} start */
function startTracks(root, start) {
    const state = stateOf(root);
    state.done = new Set();
    state.alerts = new Map();
    state.waiting = new Set();
    state.lockKey = '';
    state.tracks = [];
    layTracks(root);
    const at = state.tracks.find((t) => t.order.includes(start)) ?? state.tracks[0];
    if (at) {
        state.track = at.key;
        at.pos = Math.max(0, at.order.indexOf(start));
        state.index = at.order[at.pos] ?? 0;
    }
}

// ── Answer mode [kpadopt6] ─────────────────────────────────────────────────────────────────────

/** The question over a step when the person stopped here before: carry on or start again [gaps-time-1019: cook mode too]. */
function buildResumeAsk() {
    const strings = getStrings();
    const ask = el('kp-focus-steps__resume');
    const line = el('kp-focus-steps__resume-text', 'span');
    line.textContent = strings.focusResumeAsk;
    const go = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--primary kp-focus-steps__resume-go', 'button'));
    go.type = 'button';
    go.textContent = strings.focusResumeContinue;
    const again = /** @type {HTMLButtonElement} */ (el('kp-button kp-focus-steps__resume-restart', 'button'));
    again.type = 'button';
    again.textContent = strings.focusResumeRestart;
    ask.append(line, go, again);
    return ask;
}

/** The words of the empty plate's action, or none: `data-kp-focus-steps-empty-action` [gaps-time-1019]. @param {Element} root */
const emptyAction = (root) => root.getAttribute('data-kp-focus-steps-empty-action')?.trim() || '';

/** @param {Element} root @param {string} name @param {string} [fallback] */
const opt = (root, name, fallback) => root.getAttribute(`data-kp-${name}`) ?? fallback;

/** Whether this view is asking questions: its mode, or any step that carries an answer. @param {Element} root */
function answering(root) {
    return root.getAttribute('data-kp-focus-mode') === 'answer' || stateOf(root).steps.some((step) => step.answer);
}

/** @param {Element} root */
const summaryOn = (root) => answering(root) && opt(root, 'summary') === 'on';

/** The last index a person can stand on: the last step, or the summary after it. @param {Element} root */
const lastIndex = (root) => stateOf(root).steps.length - 1 + (summaryOn(root) ? 1 : 0);

/** @param {Element} root */
const onSummary = (root) => summaryOn(root) && stateOf(root).index === stateOf(root).steps.length;

/** The words of a value in a step's choices. @param {FocusAnswer} answer @param {string | string[] | null | undefined} value */
function wordsOf(answer, value) {
    if (value === null || value === undefined) return '';
    const label = (/** @type {string} */ v) => answer.choices?.find((c) => c.value === v)?.label ?? v;
    return Array.isArray(value) ? value.map(label).join(', ') : label(value);
}

/** What has been answered on the step now, in the answer's own shape. @param {Element} root @param {FocusAnswer} answer */
function currentValue(root, answer) {
    const state = stateOf(root);
    const draft = state.draft[answer.id];
    if (draft !== undefined) return draft;
    const given = state.answers[answer.id];
    if (given && given.source !== 'skip') return given.value;
    return answer.kind === 'multi' ? [] : '';
}

/** Whether Next may be pressed on a question: it is answered, or has something ready to be. @param {Element} root @param {FocusAnswer} answer */
function answerReady(root, answer) {
    const state = stateOf(root);
    if (state.answers[answer.id]) return true;
    const draft = state.draft[answer.id];
    return Array.isArray(draft) ? draft.length > 0 : typeof draft === 'string' && draft.trim() !== '';
}

/** The key the progress is remembered under, or null. @param {Element} root */
const memoryOf = (root) => (root.hasAttribute('data-kp-remember') ? memoryFor(root, 'focus-steps') : null);

/** What identifies these steps: a stored place is only good for the same recipe or questions. @param {Element} root */
function stepsKey(root) {
    return stateOf(root)
        .steps.map((step) => step.id ?? step.answer?.id ?? step.title ?? step.text.slice(0, 24))
        .join('|');
}

/** Write where the person is, after every answer and every move. @param {Element} root */
function remember(root) {
    const memory = memoryOf(root);
    if (!memory) return;
    const state = stateOf(root);
    if (!state.steps.length) return;
    memory.write('progress', {
        index: state.index,
        answers: state.answers,
        startedAt: state.startedAt,
        at: Date.now(),
        key: stepsKey(root),
        ...(tracksOn(root)
            ? { track: state.track, positions: Object.fromEntries(state.tracks.map((t) => [t.key, t.pos])), done: [...state.done] }
            : {}),
    });
}

/**
 * Stored progress that is still good: not past `data-kp-resume-until`, and made of this flow's own steps.
 * @param {Element} root
 * @returns {Progress | null}
 */
function storedProgress(root) {
    const memory = memoryOf(root);
    if (!memory) return null;
    const stored = memory.read(/** @type {string} */ ('progress'), /** @type {any} */ (null));
    if (!stored || typeof stored.at !== 'number' || typeof stored.index !== 'number') return null;
    // A place stored for other steps (or before steps were part of it) is not this flow's.
    if (typeof stored.key === 'string' && stored.key !== stepsKey(root)) return null;
    const until = opt(root, 'resume-until', 'midnight') ?? 'midnight';
    const now = Date.now();
    if (until === 'midnight' && agoMoment(stored.at).slice(0, 10) !== agoMoment(now).slice(0, 10)) return null;
    if (until.startsWith('hours:') && now - stored.at > Number(until.slice(6)) * 3_600_000) return null;
    const state = stateOf(root);
    const ids = new Set(state.steps.map((step) => step.answer?.id).filter(Boolean));
    const answers = Object.fromEntries(Object.entries(stored.answers ?? {}).filter(([id]) => ids.has(id)));
    /** @type {Progress} */
    const progress = { index: Math.max(0, Math.min(lastIndex(root), stored.index)), answers, startedAt: Number(stored.startedAt) || stored.at };
    if (typeof stored.track === 'string') progress.track = stored.track;
    if (stored.positions && typeof stored.positions === 'object') progress.positions = stored.positions;
    if (Array.isArray(stored.done)) progress.done = stored.done.filter((/** @type {unknown} */ i) => Number.isInteger(i) && /** @type {number} */ (i) >= 0 && /** @type {number} */ (i) < state.steps.length);
    return progress;
}

/** Whether a stored place is further than the start: answers given, a step on, a track moved or a step passed. @param {Progress} stored */
const hasMoved = (stored) =>
    Object.keys(stored.answers).length > 0 ||
    stored.index > 0 ||
    (stored.done?.length ?? 0) > 0 ||
    Object.values(stored.positions ?? {}).some((pos) => pos > 0);

/** Put the stored answers and place back, every track included. @param {HTMLElement} root @param {Progress} stored */
function applyProgress(root, stored) {
    const state = stateOf(root);
    state.answers = /** @type {FocusState['answers']} */ (stored.answers);
    state.startedAt = stored.startedAt;
    state.index = stored.index;
    state.pendingResume = null;
    if (tracksOn(root)) {
        for (const track of state.tracks) {
            const pos = stored.positions?.[track.key];
            if (typeof pos === 'number') track.pos = Math.max(0, Math.min(track.order.length - 1, pos));
        }
        state.done = new Set(stored.done ?? []);
        const active = state.tracks.find((t) => t.key === stored.track) ?? trackOfStep(state, stored.index) ?? state.tracks[0];
        if (active) {
            state.track = active.key;
            if (typeof stored.positions?.[active.key] !== 'number') active.pos = Math.max(0, active.order.indexOf(stored.index));
            state.index = active.order[active.pos] ?? stored.index;
        }
        renderBand(root);
    }
    paint(root, false);
    recompute(root);
    say(root, getStrings().focusResumed(state.index + 1));
    root.dispatchEvent(
        new CustomEvent(FOCUS_STEPS_RESUME_EVENT, {
            bubbles: true,
            detail: { index: state.index, answers: { ...state.answers }, track: state.track, done: [...state.done] },
        }),
    );
}

/** @param {HTMLElement} root */
function startResume(root) {
    if (opt(root, 'resume') === 'off' || !root.hasAttribute('data-kp-remember')) return;
    const stored = storedProgress(root);
    if (!stored || !hasMoved(stored)) return;
    if (opt(root, 'resume') === 'ask') {
        stateOf(root).pendingResume = stored;
        paint(root, false);
    } else applyProgress(root, stored);
}

/**
 * Take an answer: the cancelable event first, then the record, the memory, the event and a sentence.
 * @param {HTMLElement} root @param {string | string[] | null} value @param {'tap' | 'same' | 'skip'} source @param {Record<string, unknown>} [extra]
 * @returns {boolean} whether it was taken
 */
function takeAnswer(root, value, source, extra = {}) {
    const state = stateOf(root);
    const step = state.steps[state.index];
    const answer = step?.answer;
    if (!answer) return false;
    const before = new CustomEvent(FOCUS_STEPS_BEFORE_ANSWER_EVENT, {
        bubbles: true,
        cancelable: true,
        detail: { index: state.index, id: answer.id, value, source },
    });
    if (!root.dispatchEvent(before)) return false;
    if (!state.startedAt) state.startedAt = Date.now();
    state.answers[answer.id] = { value, source };
    delete state.draft[answer.id];
    remember(root);
    root.dispatchEvent(
        new CustomEvent(FOCUS_STEPS_ANSWER_EVENT, {
            bubbles: true,
            detail: { index: state.index, id: answer.id, value, source, previous: answer.previous ?? null, ...extra },
        }),
    );
    const strings = getStrings();
    const said = source === 'skip' ? strings.focusSkipped : wordsOf(answer, value);
    say(root, strings.focusAnswered(said, state.index + 1, state.steps.length));
    return true;
}

/** The pause that lets a person see which answer they hit before the flow moves on. @param {HTMLElement} root */
function scheduleAdvance(root) {
    const state = stateOf(root);
    window.clearTimeout(state.timer);
    const ms = Number(opt(root, 'advance-ms', '350'));
    state.timer = window.setTimeout(() => goNext(root), Number.isFinite(ms) && ms >= 0 ? ms : 350);
}

/**
 * The next button's work, also what an automatic advance does: the next step, the summary, or Done.
 * @param {HTMLElement} root
 */
function goNext(root) {
    if (tracksOn(root)) return trackNext(root);
    const state = stateOf(root);
    window.clearTimeout(state.timer);
    if (!state.steps.length || root.hasAttribute('aria-busy')) return;
    const atLast = state.index === lastIndex(root);
    if (!atLast) {
        goToStep(root, state.index + 1);
        return;
    }
    const finishedAt = Date.now();
    /** @type {Record<string, unknown>} */
    const detail = { total: state.steps.length };
    if (answering(root)) {
        state.finished = { total: state.steps.length, answers: { ...state.answers }, startedAt: state.startedAt || finishedAt, finishedAt };
        Object.assign(detail, state.finished);
    }
    memoryOf(root)?.forget('progress');
    root.dispatchEvent(new CustomEvent(FOCUS_STEPS_DONE_EVENT, { bubbles: true, detail }));
}

/**
 * A press on an answer button, a "same" button or Not today.
 * @param {HTMLElement} root @param {HTMLElement} button
 * @returns {boolean} whether it was one of them
 */
function pressAnswer(root, button) {
    const state = stateOf(root);
    const answer = state.steps[state.index]?.answer;
    if (!answer) return false;
    if (button.classList.contains('kp-focus-steps__choice')) {
        if (button.getAttribute('aria-disabled') === 'true') return true;
        const value = button.dataset.kpValue ?? '';
        if (answer.kind === 'multi') {
            const held = /** @type {string[]} */ ([.../** @type {string[]} */ (currentValue(root, answer) ?? [])]);
            const at = held.indexOf(value);
            if (at >= 0) held.splice(at, 1);
            else held.push(value);
            state.draft[answer.id] = held;
            delete state.answers[answer.id];
            paintAnswerState(root);
        } else if (takeAnswer(root, value, 'tap')) {
            paintAnswerState(root);
            if ((opt(root, 'advance', 'auto') ?? 'auto') === 'auto') scheduleAdvance(root);
        }
        return true;
    }
    if (button.classList.contains('kp-focus-steps__same')) {
        const which = button.dataset.kpSame === 'usual' ? 'usual' : 'yesterday';
        const value = which === 'usual' ? answer.usual : answer.previous;
        if (value === undefined) return true;
        if (takeAnswer(root, value, 'same', { same: which })) {
            paintAnswerState(root);
            if (answer.kind === 'choice' && (opt(root, 'advance', 'auto') ?? 'auto') === 'auto') scheduleAdvance(root);
        }
        return true;
    }
    if (button.classList.contains('kp-focus-steps__skip')) {
        if (takeAnswer(root, null, 'skip')) {
            paintAnswerState(root);
            scheduleAdvance(root);
        }
        return true;
    }
    return false;
}

/** The marks and the Next button of the question shown, without redrawing it (the focus stays where it is). @param {HTMLElement} root */
function paintAnswerState(root) {
    const state = stateOf(root);
    const answer = state.steps[state.index]?.answer;
    if (!answer) return;
    const value = currentValue(root, answer);
    const given = state.answers[answer.id];
    for (const button of /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.kp-focus-steps__choice')])) {
        const v = button.dataset.kpValue ?? '';
        const on = !(given?.source === 'skip') && (Array.isArray(value) ? value.includes(v) : value === v);
        button.setAttribute('aria-pressed', String(on));
        button.toggleAttribute('data-kp-chosen', on);
    }
    for (const button of root.querySelectorAll('.kp-focus-steps__skip')) button.setAttribute('aria-pressed', String(given?.source === 'skip'));
    const next = /** @type {HTMLElement} */ (part(root, 'next'));
    if (answerReady(root, answer)) next.removeAttribute('aria-disabled');
    else next.setAttribute('aria-disabled', 'true');
}

/**
 * Draw one question's answers under its text.
 * @param {HTMLElement} root @param {HTMLElement} holder @param {FocusStep} step @param {HTMLElement} text
 */
function buildAnswer(root, holder, step, text) {
    const strings = getStrings();
    const answer = /** @type {FocusAnswer} */ (step.answer);
    const state = stateOf(root);
    const wrap = el('kp-focus-steps__answer');
    serial += 1;
    text.id = `kp-focus-steps-${serial}-question`;
    if (answer.kind === 'text') {
        const label = el('kp-sr-only', 'label');
        label.textContent = strings.focusTextLabel;
        const box = /** @type {HTMLTextAreaElement} */ (el('kp-field__input kp-focus-steps__input', 'textarea'));
        box.rows = 4;
        box.id = `kp-focus-steps-${serial}-input`;
        label.setAttribute('for', box.id);
        box.setAttribute('aria-labelledby', text.id);
        box.setAttribute('autocomplete', 'off');
        box.setAttribute('inputmode', 'text');
        if (answer.placeholder) box.placeholder = answer.placeholder;
        box.value = String(currentValue(root, answer) ?? '');
        box.addEventListener('input', () => {
            state.draft[answer.id] = box.value;
            if (state.answers[answer.id]) delete state.answers[answer.id];
            paintAnswerState(root);
        });
        wrap.append(label, box);
    } else {
        const pinned = (() => {
            try {
                const raw = JSON.parse(opt(root, 'pinned-first', '[]') ?? '[]');
                return Array.isArray(raw) ? /** @type {FocusChoice[]} */ (raw) : [];
            } catch {
                return /** @type {FocusChoice[]} */ ([]);
            }
        })();
        const choices = [...pinned.map((c) => ({ ...c, pinned: true })), ...(answer.choices ?? [])];
        const group = el('kp-focus-steps__choices');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', text.id);
        const wanted = opt(root, 'choice-layout', 'auto');
        const short = choices.length <= 3 && choices.every((c) => c.label.length <= 14);
        group.setAttribute('data-kp-layout', wanted === 'row' || wanted === 'stack' ? wanted : short ? 'row' : 'stack');
        if (answer.kind === 'multi') {
            const hint = el('kp-focus-steps__hint', 'p');
            hint.textContent = strings.focusMultiHint;
            wrap.append(hint);
        }
        for (const choice of choices) {
            const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--lg kp-focus-steps__choice', 'button'));
            button.type = 'button';
            button.dataset.kpValue = choice.value;
            button.setAttribute('aria-pressed', 'false');
            if ('pinned' in choice) button.setAttribute('data-kp-pinned', '');
            const mark = el('kp-focus-steps__mark', 'span');
            mark.setAttribute('aria-hidden', 'true');
            const label = el('kp-focus-steps__choice-label', 'span');
            label.textContent = choice.label;
            const said = el('kp-sr-only', 'span');
            said.textContent = `, ${strings.focusPickedMark}`;
            said.hidden = true;
            button.append(mark, label);
            if (choice.disabled) {
                button.setAttribute('aria-disabled', 'true');
                if (choice.reason) {
                    const reason = el('kp-focus-steps__reason', 'span');
                    reason.id = `kp-focus-steps-${serial}-${group.childElementCount}-why`;
                    reason.textContent = choice.reason;
                    button.setAttribute('aria-describedby', reason.id);
                    button.append(reason);
                }
            }
            group.append(button);
        }
        wrap.append(group);
        const sameMode = opt(root, 'same', 'both');
        if (sameMode !== 'off') {
            const same = el('kp-focus-steps__sames');
            /** @type {['yesterday' | 'usual', string | string[] | undefined][]} */
            const kinds = [
                ['yesterday', sameMode === 'usual' ? undefined : answer.previous],
                ['usual', sameMode === 'yesterday' ? undefined : answer.usual],
            ];
            for (const [which, value] of kinds) {
                if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
                const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-focus-steps__same', 'button'));
                button.type = 'button';
                button.dataset.kpSame = which;
                const words = wordsOf(answer, value);
                button.textContent = which === 'usual' ? strings.focusSameUsual(words) : strings.focusSameYesterday(words);
                same.append(button);
            }
            if (same.childElementCount > 0) wrap.append(same);
        }
    }
    if (opt(root, 'skip') !== 'off') {
        const skip = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-focus-steps__skip', 'button'));
        skip.type = 'button';
        skip.setAttribute('aria-pressed', 'false');
        skip.textContent = strings.focusSkip;
        wrap.append(skip);
    }
    holder.append(wrap);
}

/** The summary after the last question: each question and what was answered. @param {HTMLElement} root @param {HTMLElement} holder */
function buildSummary(root, holder) {
    const strings = getStrings();
    const state = stateOf(root);
    const title = el('kp-focus-steps__text', 'p');
    title.textContent = strings.focusSummaryTitle;
    const list = el('kp-focus-steps__summary', 'dl');
    for (const step of state.steps) {
        if (!step.answer) continue;
        const given = state.answers[step.answer.id];
        const term = el('kp-focus-steps__summary-q', 'dt');
        term.textContent = step.text;
        const value = el('kp-focus-steps__summary-a', 'dd');
        value.textContent = !given ? '–' : given.source === 'skip' ? strings.focusSkipped : wordsOf(step.answer, given.value);
        list.append(term, value);
    }
    holder.append(title, list);
}

/** @param {Element} root @param {string} message */
function say(root, message) {
    const region = part(root, 'live');
    region.textContent = '';
    setTimeout(() => (region.textContent = message), 60);
}

/** Write the step shown, its count and bar, and the buttons. @param {HTMLElement} root @param {boolean} arrive */
function paint(root, arrive) {
    const strings = getStrings();
    const state = stateOf(root);
    const { steps, index } = state;
    const total = steps.length;
    const step = steps[index];
    const asking = answering(root);
    const onSum = onSummary(root);
    // Parallel tracks: the lanes and the band stand around the head; the count and the bar are the active track's own.
    const tracked = tracksOn(root);
    const track = tracked ? activeTrack(state) : undefined;
    // Loading, empty and failed take the whole box: no lanes stand beside a plate.
    const showLanes = tracked && root.getAttribute('data-kp-focus-steps-error') === null && !root.hasAttribute('aria-busy');
    if (showLanes) {
        root.setAttribute('data-kp-focus-tracked', '');
        ensureLanes(root);
        layoutLanes(root);
    } else if (root.hasAttribute('data-kp-focus-tracked')) dropLanes(root);
    const passed = track !== undefined && track.order.every((i) => state.done.has(i));
    const timers = tracked ? timerStates(root) : [];
    const blocks = tracked && step && !passed ? blockersOf(state, index, timers) : [];
    state.lockKey = blocks.map((b) => b.index).join(',');
    part(root, 'count').textContent = !total
        ? ''
        : onSum
          ? strings.focusSummaryTitle
          : track
            ? strings.focusTrackCount(track.name, track.pos + 1, track.order.length)
            : asking
              ? strings.focusQuestionCount(index + 1, total)
              : strings.focusCount(index + 1, total);
    const bar = part(root, 'bar');
    const shownTotal = total + (summaryOn(root) ? 1 : 0);
    bar.style.setProperty('--kp-value', String(track ? (track.pos + 1) / track.order.length : shownTotal ? (index + 1) / shownTotal : 0));
    // Progress: the count and the bar (default) or nothing; never a timer, never a streak.
    const progress = asking ? (opt(root, 'progress', 'count') ?? 'count') : 'count';
    bar.hidden = progress !== 'count';
    part(root, 'count').hidden = progress === 'off';
    // The screen line is for cook mode; a short check-in does not talk about the screen unless asked to keep it on.
    const wakeLine = /** @type {HTMLElement | null} */ (root.querySelector('.kp-focus-steps__wake'));
    if (wakeLine) wakeLine.hidden = asking && (root.getAttribute('data-kp-wake') ?? root.getAttribute('data-kp-focus-steps-wake')) !== 'true';
    // Read aloud stays a tool: off by default for questions, on with `data-kp-speak="true"`.
    const speakButton = /** @type {HTMLElement | null} */ (root.querySelector('.kp-focus-steps__speak'));
    if (speakButton) speakButton.hidden = typeof speechSynthesis === 'undefined' || (asking && opt(root, 'speak') !== 'true');
    const holder = part(root, 'step');
    const error = root.getAttribute('data-kp-focus-steps-error');
    holder.replaceChildren();
    holder.removeAttribute('data-kp-focus-steps-kind');
    holder.removeAttribute('data-kp-focus-steps-locked');
    const saveError = root.getAttribute('data-kp-state') === 'save-error';
    if (asking || root.getAttribute('data-kp-focus-mode') === 'answer') {
        // Answer mode: empty, failed and save-failed are one plate that fills the step area, centred, with a normal-size action.
        if (saveError) {
            holder.append(
                statePlate(document, {
                    kind: 'error',
                    title: strings.focusSaveFailedTitle,
                    text: error ?? strings.focusSaveFailedText,
                    actionLabel: strings.focusSaveRetry,
                    actionAttribute: 'data-kp-focus-save-retry',
                }),
            );
            holder.setAttribute('data-kp-focus-steps-kind', 'error');
        } else if (error !== null) {
            holder.append(
                statePlate(document, {
                    kind: 'error',
                    title: strings.focusAnswerFailedTitle,
                    text: error === strings.focusFailed ? strings.focusAnswerFailedText : error,
                    actionLabel: strings.focusRetry,
                    actionAttribute: 'data-kp-focus-retry',
                }),
            );
            holder.setAttribute('data-kp-focus-steps-kind', 'error');
        } else if (!step && !onSum && !root.hasAttribute('aria-busy')) {
            holder.append(
                statePlate(document, {
                    kind: 'empty',
                    title: strings.focusAnswerEmptyTitle,
                    text: root.getAttribute('data-kp-focus-steps-empty') ?? strings.focusAnswerEmptyText,
                    ...(emptyAction(root) ? { actionLabel: emptyAction(root), actionAttribute: 'data-kp-focus-empty-action' } : {}),
                }),
            );
            holder.setAttribute('data-kp-focus-steps-kind', 'empty');
        } else if (onSum) buildSummary(root, holder);
        else if (step) {
            if (state.pendingResume) holder.append(buildResumeAsk());
            const text = el('kp-focus-steps__text', 'p');
            text.textContent = step.text;
            holder.append(text);
            if (step.answer) buildAnswer(root, holder, step, text);
            if (step.note) {
                const note = el(`kp-alert kp-alert--${step.noteTone === 'warning' ? 'warning' : 'info'} kp-focus-steps__note`, 'p');
                note.textContent = step.note;
                holder.append(note);
            }
        }
    } else if (error !== null) {
        // Failed and empty are one plate that fills the step area, centred, with a normal-size action [focus-tracks-1019].
        holder.append(
            statePlate(document, {
                kind: 'error',
                title: strings.focusReadFailedTitle,
                text: error === strings.focusFailed ? strings.focusReadFailedText : error,
                actionLabel: strings.focusRetry,
                actionAttribute: 'data-kp-focus-retry',
            }),
        );
        holder.setAttribute('data-kp-focus-steps-kind', 'error');
    } else if (!step) {
        if (!root.hasAttribute('aria-busy')) {
            holder.append(
                statePlate(document, {
                    kind: 'empty',
                    title: strings.focusReadEmptyTitle,
                    text: root.getAttribute('data-kp-focus-steps-empty') ?? strings.focusEmpty,
                    ...(emptyAction(root) ? { actionLabel: emptyAction(root), actionAttribute: 'data-kp-focus-empty-action' } : {}),
                }),
            );
            holder.setAttribute('data-kp-focus-steps-kind', 'empty');
        }
    } else if (track && passed) {
        // The active track has no step left: say so on the plate, and offer the track that can use the person.
        const next = suggestion(laneSummaries(root));
        const plate = statePlate(document, {
            kind: 'empty',
            title: strings.focusTrackFinishedTitle(track.name),
            text: next ? strings.focusTrackFinishedNext(next.name) : strings.focusTrackFinishedText,
            ...(next ? { actionLabel: strings.focusTrackGo(next.name) } : {}),
        });
        if (next) plate.querySelector('.kp-stateplate__action')?.setAttribute('data-kp-focus-go', String(state.tracks.indexOf(next.track)));
        holder.append(plate);
        holder.setAttribute('data-kp-focus-steps-kind', 'finished');
    } else {
        if (state.pendingResume) holder.append(buildResumeAsk());
        const text = el('kp-focus-steps__text', 'p');
        text.textContent = step.text;
        holder.append(text);
        if (blocks.length) {
            // The step waits: what for, how long, and the button to the track that can go on.
            holder.setAttribute('data-kp-focus-steps-locked', '');
            const wait = el('kp-alert kp-alert--info kp-focus-steps__wait', 'div');
            wait.setAttribute('role', 'status');
            const what = el('kp-focus-steps__wait-text');
            const title = el('kp-focus-steps__wait-title', 'strong');
            title.textContent = strings.focusTrackWaitTitle(blockerNames(state, blocks));
            const line = el('kp-focus-steps__wait-line', 'span');
            line.textContent = waitLine(state, blocks, timers, index);
            what.append(title, line);
            wait.append(what);
            const next = suggestion(laneSummaries(root));
            if (next) {
                const go = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--primary kp-focus-steps__wait-go', 'button'));
                go.type = 'button';
                go.setAttribute('data-kp-focus-go', String(state.tracks.indexOf(next.track)));
                go.textContent = strings.focusTrackGo(next.name);
                wait.append(go);
            }
            holder.append(wait);
        }
        if (step.ingredients?.length) {
            const needs = el('kp-focus-steps__needs', 'section');
            const title = el('kp-focus-steps__needs-title', 'h3');
            serial += 1;
            title.id = `kp-focus-steps-${serial}-needs`;
            title.textContent = strings.focusNeeds;
            needs.setAttribute('aria-labelledby', title.id);
            const list = el('kp-focus-steps__needs-list', 'ul');
            for (const item of step.ingredients) {
                const row = el('kp-focus-steps__need', 'li');
                const { name, amount } = typeof item === 'string' ? { name: item, amount: '' } : item;
                const a = el('kp-focus-steps__amount', 'span');
                a.textContent = amount ?? '';
                const n = el('kp-focus-steps__name', 'span');
                n.textContent = name;
                row.append(a, n);
                list.append(row);
            }
            needs.append(title, list);
            holder.append(needs);
        }
        if (step.timer && step.timer.seconds > 0) {
            const minutes = Math.round(step.timer.seconds / 60);
            const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-focus-steps__timer', 'button'));
            button.type = 'button';
            button.setAttribute('data-kp-timer-start', String(step.timer.seconds));
            button.setAttribute('data-kp-timer-name', step.timer.name ?? strings.focusCount(index + 1, total));
            // The timer has an id of its own, so the timer list, the lanes and a page that watches it name the same one.
            button.setAttribute('data-kp-timer-id', timerIdOf(state, index));
            if (blocks.length) button.setAttribute('aria-disabled', 'true');
            const list = root.getAttribute('data-kp-focus-steps-timers');
            if (list) button.setAttribute('data-kp-timer-for', list);
            button.textContent = strings.focusTimer(step.timer.seconds < 60 ? `${step.timer.seconds} s` : `${minutes} min`);
            holder.append(button);
        }
        if (step.note) {
            const note = el(`kp-alert kp-alert--${step.noteTone === 'warning' ? 'warning' : 'info'} kp-focus-steps__note`, 'p');
            note.textContent = step.note;
            holder.append(note);
        }
    }
    const prev = /** @type {HTMLButtonElement} */ (part(root, 'prev'));
    const next = /** @type {HTMLButtonElement} */ (part(root, 'next'));
    const busy = root.hasAttribute('aria-busy');
    const blocked = (!step && !onSum) || error !== null || busy || saveError;
    // On a track the first step has no Back, a finished track has no Next, and a step that waits cannot be passed.
    const atStart = track ? track.pos === 0 && !passed : index === 0;
    if (blocked || atStart) prev.setAttribute('aria-disabled', 'true');
    else prev.removeAttribute('aria-disabled');
    prev.hidden = asking && opt(root, 'back') === 'off';
    if (blocked || passed || blocks.length > 0) next.setAttribute('aria-disabled', 'true');
    else next.removeAttribute('aria-disabled');
    const last = track ? passed || track.pos === track.order.length - 1 : total > 0 && index === lastIndex(root);
    const nextText = /** @type {HTMLElement} */ (next.querySelector('.kp-button__text'));
    nextText.textContent = track
        ? last
            ? passed
                ? strings.focusDone
                : strings.focusTrackFinish(track.name)
            : strings.focusNext
        : last
          ? strings.focusDone
          : asking && summaryOn(root) && index === total - 1
            ? strings.focusReview
            : strings.focusNext;
    next.toggleAttribute('data-kp-focus-steps-last', last);
    if (asking && step?.answer && !blocked) paintAnswerState(root);
    part(root, 'body').scrollTop = 0;
    if (showLanes) {
        paintLanes(root);
        paintLive(root, timers);
    }
    if (arrive) void import('./motion.js').then((m) => holder.isConnected && m.arriveShown(holder));
}

/** The screen line. @param {HTMLElement} root @param {string} wakeState */
function paintWake(root, wakeState) {
    const state = stateOf(root);
    const changed = state.wakeState !== wakeState;
    state.wakeState = wakeState;
    root.setAttribute('data-kp-focus-steps-screen', wakeState);
    const strings = getStrings();
    const line = part(root, 'wake');
    if (line)
        line.textContent =
            wakeState === 'on' ? strings.focusWakeOn : wakeState === 'unsupported' ? strings.focusWakeUnsupported : strings.focusWakeOff;
    if (changed) root.dispatchEvent(new CustomEvent(FOCUS_STEPS_WAKE_EVENT, { bubbles: true, detail: { state: wakeState } }));
}

/** Ask for the screen to stay on. @param {HTMLElement} root */
async function holdScreen(root) {
    // Answer mode does not force the screen on (a two-minute flow); `data-kp-wake="true"` asks for it, cook mode keeps its default.
    const wake = root.getAttribute('data-kp-wake') ?? root.getAttribute('data-kp-focus-steps-wake');
    if (wake === 'false' || (wake === null && answering(root))) return paintWake(root, 'off');
    const lock = /** @type {any} */ (navigator).wakeLock;
    if (!lock?.request) return paintWake(root, 'unsupported');
    if (document.visibilityState !== 'visible') return;
    const state = stateOf(root);
    if (state.wake && !state.wake.released) return paintWake(root, 'on');
    try {
        const sentinel = /** @type {WakeLockSentinel} */ (await lock.request('screen'));
        if (!WIRED.has(root)) {
            void sentinel.release();
            return;
        }
        state.wake = sentinel;
        sentinel.addEventListener('release', () => {
            if (stateOf(root).wake === sentinel) paintWake(root, 'off');
        });
        paintWake(root, 'on');
    } catch {
        paintWake(root, 'off');
    }
}

/** @param {HTMLElement} root */
function letScreenGo(root) {
    const state = stateOf(root);
    const sentinel = state.wake;
    state.wake = null;
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
}

/** The screen option changed at run time: ask for the screen again, or let it go. @param {HTMLElement} root */
function applyWake(root) {
    const wake = root.getAttribute('data-kp-wake') ?? root.getAttribute('data-kp-focus-steps-wake');
    if (wake === 'false' || (wake === null && answering(root))) {
        letScreenGo(root);
        paintWake(root, 'off');
    } else void holdScreen(root);
}

/**
 * Go to a step (as a person did: the event fires when it moved).
 * @param {Element} root @param {number} index
 * @returns {boolean} whether it moved
 */
export function goToStep(root, index) {
    if (!(root instanceof HTMLElement)) return false;
    if (tracksOn(root)) return trackGo(root, index);
    const state = stateOf(root);
    const to = Math.max(0, Math.min(lastIndex(root), index));
    if (!state.steps.length || to === state.index || root.hasAttribute('aria-busy')) return false;
    window.clearTimeout(state.timer);
    const from = state.index;
    state.index = to;
    const hadFocus = root.contains(root.ownerDocument.activeElement);
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    paint(root, true);
    const strings = getStrings();
    const asking = answering(root);
    // A new question takes the focus along when the old one had it, so the keys keep working after a tap.
    if (asking && hadFocus) part(root, 'step').focus({ preventScroll: true });
    const step = state.steps[to];
    say(
        root,
        asking
            ? `${strings.focusQuestionCount(to + 1, state.steps.length)}. ${step?.text ?? strings.focusSummaryTitle}`
            : `${strings.focusCount(to + 1, state.steps.length)}. ${step?.text ?? ''}`,
    );
    remember(root);
    root.dispatchEvent(
        new CustomEvent(FOCUS_STEPS_EVENT, { bubbles: true, detail: { index: to, from, total: state.steps.length, step: step ?? null } }),
    );
    return true;
}

/** @param {Element} root */
export const getStepIndex = (root) => stateOf(root).index;

/**
 * Give the steps, and where to begin (to come back where a person stopped).
 * No event: the page knows.
 * @param {Element} root @param {FocusStep[]} steps @param {{ start?: number }} [options]
 */
export function setFocusSteps(root, steps, { start = 0 } = {}) {
    if (!(root instanceof HTMLElement)) return;
    build(root);
    const state = stateOf(root);
    state.steps = steps.map((step) => ({ ...step }));
    state.index = Math.max(0, Math.min(steps.length - 1, start));
    startTracks(root, state.index);
    if (steps.some((step) => step.timer))
        void import('./timer.js').then((m) => {
            timerModule = m;
            m.attachTimers(root);
            recompute(root);
        });
    state.answers = {};
    state.draft = {};
    state.finished = null;
    state.pendingResume = null;
    paint(root, false);
    recompute(root);
    // Where a person stopped (`data-kp-remember`, `data-kp-resume`), unless the page said where to begin.
    if (start === 0) startResume(root);
}

/**
 * The state: `loading` lays the busy card over the body, `error` says the
 * message where the step was, `ready` is neither.
 * @param {Element} root @param {'loading' | 'error' | 'save-error' | 'ready'} kind @param {string} [message]
 */
export function setFocusStepsState(root, kind, message) {
    if (!(root instanceof HTMLElement)) return;
    build(root);
    const state = stateOf(root);
    root.setAttribute('data-kp-state', kind);
    if (kind === 'error' || kind === 'save-error')
        root.setAttribute('data-kp-focus-steps-error', message ?? (kind === 'error' ? getStrings().focusFailed : getStrings().focusSaveFailedText));
    else root.removeAttribute('data-kp-focus-steps-error');
    if (kind === 'loading') {
        root.setAttribute('aria-busy', 'true');
        const body = part(root, 'body');
        state.busy ??= openBusyCard(body, {
            words: message ?? (answering(root) ? getStrings().focusAnswerLoading : getStrings().focusLoading),
            area: () => [body],
            className: 'kp-focus-steps__busy',
        });
    } else {
        root.removeAttribute('aria-busy');
        const card = state.busy;
        state.busy = null;
        void card?.close();
    }
    paint(root, false);
}

/** @param {EventTarget | null} target */
const typing = (target) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Wire every focus-steps view under `root`: its buttons, keys, swipe, Read
 * aloud, and the screen kept on until the detach.
 * @param {ParentNode} [scope]
 * @returns {() => void} detach
 */
export function attachFocusSteps(scope = document) {
    const roots = /** @type {HTMLElement[]} */ ([
        ...(scope instanceof HTMLElement && scope.matches(FOCUS_STEPS) ? [scope] : []),
        ...scope.querySelectorAll(FOCUS_STEPS),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const root of roots) {
        if (WIRED.has(root)) continue;
        WIRED.add(root);
        build(root);
        paint(root, false);
        void holdScreen(root);
        const state = stateOf(root);
        const next = () => {
            // A question is answered before the flow moves on: a multi pick or a written line is taken now.
            const answer = state.steps[state.index]?.answer;
            if (answering(root) && answer && !state.answers[answer.id]) {
                if (!answerReady(root, answer)) return;
                const held = state.draft[answer.id];
                if (!takeAnswer(root, typeof held === 'string' ? held.trim() : (held ?? ''), 'tap')) return;
            }
            goNext(root);
        };
        const prev = () => (tracksOn(root) ? trackPrev(root) : goToStep(root, state.index - 1));
        /** @param {MouseEvent} event */
        const click = (event) => {
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            if (!button || !root.contains(button) || button.getAttribute('aria-disabled') === 'true') return;
            if (pressAnswer(root, button)) return;
            // Parallel tracks: a lane, the button that goes to a track, and "Got it" on the band.
            const go = button.getAttribute('data-kp-focus-go');
            if (button.classList.contains('kp-focus-steps__lane')) {
                switchTrack(root, button.getAttribute('data-kp-track-key') ?? '', 'tap');
                return;
            }
            if (go !== null) {
                const to = state.tracks[Number(go)];
                if (to) switchTrack(root, to.key, button.closest('.kp-focus-steps__band') ? 'attention' : 'tap');
                return;
            }
            const dismiss = button.getAttribute('data-kp-focus-dismiss');
            if (dismiss !== null) {
                const gone = state.tracks[Number(dismiss)];
                if (gone) clearAlert(root, gone.key);
                return;
            }
            if (button.hasAttribute('data-kp-focus-retry')) root.dispatchEvent(new CustomEvent(FOCUS_STEPS_RETRY_EVENT, { bubbles: true }));
            else if (button.hasAttribute('data-kp-focus-empty-action')) root.dispatchEvent(new CustomEvent(FOCUS_STEPS_EMPTY_ACTION_EVENT, { bubbles: true }));
            else if (button.hasAttribute('data-kp-focus-save-retry')) {
                root.dispatchEvent(new CustomEvent(FOCUS_STEPS_SAVE_RETRY_EVENT, { bubbles: true }));
                if (state.finished) root.dispatchEvent(new CustomEvent(FOCUS_STEPS_DONE_EVENT, { bubbles: true, detail: { ...state.finished } }));
            } else if (button.classList.contains('kp-focus-steps__resume-go') && state.pendingResume) applyProgress(root, state.pendingResume);
            else if (button.classList.contains('kp-focus-steps__resume-restart')) {
                memoryOf(root)?.forget('progress');
                state.pendingResume = null;
                paint(root, false);
            } else if (button.classList.contains('kp-focus-steps__next')) next();
            else if (button.classList.contains('kp-focus-steps__prev')) prev();
            else if (button.classList.contains('kp-focus-steps__speak')) {
                const strings = getStrings();
                if (speechSynthesis.speaking) {
                    speechSynthesis.cancel();
                    return;
                }
                const step = state.steps[state.index];
                if (!step) return;
                const utterance = new SpeechSynthesisUtterance([step.text, step.note ?? ''].filter(Boolean).join('. '));
                utterance.lang = root.closest('[lang]')?.getAttribute('lang') ?? '';
                const word = /** @type {HTMLElement} */ (button.querySelector('.kp-focus-steps__speak-text'));
                word.textContent = strings.focusStopReading;
                button.setAttribute('aria-pressed', 'true');
                utterance.onend = utterance.onerror = () => {
                    word.textContent = strings.focusReadAloud;
                    button.setAttribute('aria-pressed', 'false');
                };
                speechSynthesis.speak(utterance);
            }
        };
        /** @param {KeyboardEvent} event */
        const key = (event) => {
            if (event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return;
            const onButton = event.target instanceof Element && event.target.closest('button, a, [role="button"]');
            const rtl = getComputedStyle(root).direction === 'rtl';
            // ArrowUp and ArrowDown walk the answers of a question.
            if (
                (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
                onButton instanceof HTMLElement &&
                onButton.closest('.kp-focus-steps__answer')
            ) {
                const all = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.kp-focus-steps__answer button')]);
                const at = all.indexOf(onButton);
                const to = all[Math.max(0, Math.min(all.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
                if (at >= 0 && to) {
                    event.preventDefault();
                    to.focus();
                }
                return;
            }
            // The tabs pattern on the lanes: ArrowUp and ArrowDown (Home, End) move the focus between them.
            if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && onButton instanceof HTMLElement && onButton.classList.contains('kp-focus-steps__lane')) {
                const all = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.kp-focus-steps__lane')]);
                const at = all.indexOf(onButton);
                const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
                const to = event.key === 'Home' ? all[0] : event.key === 'End' ? all[all.length - 1] : all[(at + step + all.length) % all.length];
                if (at >= 0 && to) {
                    event.preventDefault();
                    to.focus();
                }
                return;
            }
            let act = null;
            if (event.key === 'PageDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) act = next;
            else if (event.key === 'PageUp' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) act = prev;
            else if (event.key === ' ' && !onButton) act = next;
            else if (event.key === 'Home') act = () => goToStep(root, tracksOn(root) ? (activeTrack(state)?.order[0] ?? 0) : 0);
            else if (event.key === 'End') act = () => goToStep(root, tracksOn(root) ? (activeTrack(state)?.order.at(-1) ?? 0) : lastIndex(root));
            if (!act) return;
            event.preventDefault();
            act();
        };
        /** @type {{ x: number, y: number, id: number } | null} */
        let touch = null;
        /** @param {PointerEvent} event */
        const down = (event) => {
            if (event.pointerType === 'mouse' || !(event.target instanceof Element) || !part(root, 'body').contains(event.target)) return;
            touch = { x: event.clientX, y: event.clientY, id: event.pointerId };
        };
        /** @param {PointerEvent} event */
        const up = (event) => {
            if (!touch || touch.id !== event.pointerId) return;
            const dx = event.clientX - touch.x;
            const dy = event.clientY - touch.y;
            touch = null;
            if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            const rtl = getComputedStyle(root).direction === 'rtl';
            if (dx < 0 !== rtl) next();
            else prev();
        };
        const cancel = () => (touch = null);
        const back = () => {
            if (document.visibilityState === 'visible') void holdScreen(root);
        };
        root.addEventListener('click', click);
        root.addEventListener('keydown', key);
        root.addEventListener('pointerdown', down);
        root.addEventListener('pointerup', up);
        root.addEventListener('pointercancel', cancel);
        document.addEventListener('visibilitychange', back);
        // s, u and n take the same as yesterday, the usual answer and Not today while the focus is in the view.
        const tap = (/** @type {string} */ selector) => () => {
            const button = /** @type {HTMLElement | null} */ (root.querySelector(selector));
            if (button && button.getAttribute('aria-disabled') !== 'true') pressAnswer(root, button);
        };
        const inView = () => answering(root) && root.contains(document.activeElement) && state.steps[state.index]?.answer !== undefined;
        const unkey = registerShortcuts(root, [
            {
                keys: 's',
                what: getStrings().focusSameYesterday('…'),
                group: 'Question',
                when: () => inView() && root.querySelector('[data-kp-same="yesterday"]') !== null,
                run: tap('[data-kp-same="yesterday"]'),
            },
            {
                keys: 'u',
                what: getStrings().focusSameUsual('…'),
                group: 'Question',
                when: () => inView() && root.querySelector('[data-kp-same="usual"]') !== null,
                run: tap('[data-kp-same="usual"]'),
            },
            {
                keys: 'n',
                what: getStrings().focusSkip,
                group: 'Question',
                when: () => inView() && root.querySelector('.kp-focus-steps__skip') !== null,
                run: tap('.kp-focus-steps__skip'),
            },
        ]);
        // T and Shift T walk the tracks while the focus is in the view (or on no control at all).
        const tracking = () => tracksOn(root) && (root.contains(document.activeElement) || document.activeElement === document.body);
        const unkeyTracks = registerShortcuts(root, [
            { keys: 't', what: getStrings().focusTrackKeyNext, group: 'Tracks', when: tracking, run: () => stepTrack(root, 1) },
            { keys: 'Shift T', what: getStrings().focusTrackKeyPrevious, group: 'Tracks', when: tracking, run: () => stepTrack(root, -1) },
        ]);
        // An option changed at run time is drawn at once [live-options-1019].
        const stopWatch = watchOptions(
            root,
            [
                'data-kp-progress',
                'data-kp-back',
                'data-kp-same',
                'data-kp-skip',
                'data-kp-choice-layout',
                'data-kp-summary',
                'data-kp-pinned-first',
                'data-kp-speak',
                'data-kp-focus-mode',
                'data-kp-wake',
                'data-kp-focus-steps-wake',
                'data-kp-tracks',
                'data-kp-lanes',
                'data-kp-lane-detail',
                'data-kp-track-follow',
                'data-kp-track-attention',
                'data-kp-track-shared',
            ],
            (names) => {
                if (names.some((n) => n === 'data-kp-wake' || n === 'data-kp-focus-steps-wake')) applyWake(root);
                if (names.includes('data-kp-track-shared')) layTracks(root);
                paint(root, false);
                if (names.includes('data-kp-track-attention') || names.includes('data-kp-tracks')) renderBand(root);
                recompute(root);
            },
        );
        // The timers of the steps: the lanes read them by their ids, an end asks for the person, and the lanes follow the clock.
        /** @param {Event} event */
        const timerEvent = (event) => {
            const timer = /** @type {CustomEvent} */ (event).detail?.timer;
            if (!timer || !tracksOn(root)) return;
            const at = state.steps.findIndex((_, i) => timerIdOf(state, i) === timer.id);
            if (at < 0) return;
            if (event.type === 'kp-timer-done') timerEnded(root, at, timer);
            else if (event.type === 'kp-timer-stop')
                for (const [key, alert] of state.alerts) if (alert.timerId === timer.id) clearAlert(root, key);
            recompute(root);
        };
        const timerEvents = ['kp-timer-start', 'kp-timer-change', 'kp-timer-done', 'kp-timer-stop'];
        for (const type of timerEvents) document.addEventListener(type, timerEvent);
        state.ticker = window.setInterval(() => {
            if (!document.hidden) recompute(root);
        }, 1000);
        const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => tracksOn(root) && layoutLanes(root)) : null;
        resize?.observe(root);
        // The empty plate's words and action are read again when the attributes change.
        const stopOptions = watchOptions(root, ['data-kp-focus-steps-empty', 'data-kp-focus-steps-empty-action'], () => paint(root, false));
        undo.push(() => {
            stopOptions();
            stopWatch();
            unkey();
            unkeyTracks();
            for (const type of timerEvents) document.removeEventListener(type, timerEvent);
            window.clearInterval(state.ticker);
            state.ticker = 0;
            resize?.disconnect();
            window.clearTimeout(state.timer);
            WIRED.delete(root);
            root.removeEventListener('click', click);
            root.removeEventListener('keydown', key);
            root.removeEventListener('pointerdown', down);
            root.removeEventListener('pointerup', up);
            root.removeEventListener('pointercancel', cancel);
            document.removeEventListener('visibilitychange', back);
            if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
            letScreenGo(root);
            paintWake(root, 'off');
        });
    }
    return () => undo.forEach((u) => u());
}
