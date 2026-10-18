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
// no steps says `data-kp-focus-steps-empty` (or the dictionary's sentence).
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
// Every word it adds is in js/strings.js. Nothing runs on import.

import { getStrings } from './strings.js';
import { buildProgressbar } from './progressbar.js';
import { openBusyCard } from './busy-card.js';
import { registerShortcuts } from './shortcuts.js';
import { memoryFor } from './remember.js';
import { statePlate } from './state-plate.js';
import { agoMoment } from './freshness.js';

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
/** Fired on the root when Try again is pressed on the plate of answers that could not be saved. */
export const FOCUS_STEPS_SAVE_RETRY_EVENT = 'kp-focus-steps-save-retry';
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
 * @property {{ seconds: number, name?: string }} [timer]
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
 * @property {{ index: number, answers: FocusState['answers'], startedAt: number } | null} pendingResume
 * @property {{ total: number, answers: FocusState['answers'], startedAt: number, finishedAt: number } | null} finished
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
        };
        STATES.set(root, state);
    }
    return state;
};

/** @param {Element} root @param {string} name @returns {HTMLElement} */
const part = (root, name) => /** @type {HTMLElement} */ (root.querySelector(`.kp-focus-steps__${name}`));

/** Lay the parts once. @param {HTMLElement} root */
function build(root) {
    if (root.querySelector(':scope > .kp-focus-steps__head')) return;
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

// ── Answer mode [kpadopt6] ─────────────────────────────────────────────────────────────────────

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

/** Write where the person is, after every answer and every move. @param {Element} root */
function remember(root) {
    const memory = memoryOf(root);
    if (!memory || !answering(root)) return;
    const state = stateOf(root);
    memory.write('progress', { index: state.index, answers: state.answers, startedAt: state.startedAt, at: Date.now() });
}

/**
 * Stored progress that is still good: not past `data-kp-resume-until`, and made of this flow's own questions.
 * @param {Element} root
 */
function storedProgress(root) {
    const memory = memoryOf(root);
    if (!memory) return null;
    const stored = memory.read(/** @type {string} */ ('progress'), /** @type {any} */ (null));
    if (!stored || typeof stored.at !== 'number' || typeof stored.index !== 'number') return null;
    const until = opt(root, 'resume-until', 'midnight') ?? 'midnight';
    const now = Date.now();
    if (until === 'midnight' && agoMoment(stored.at).slice(0, 10) !== agoMoment(now).slice(0, 10)) return null;
    if (until.startsWith('hours:') && now - stored.at > Number(until.slice(6)) * 3_600_000) return null;
    const ids = new Set(
        stateOf(root)
            .steps.map((step) => step.answer?.id)
            .filter(Boolean),
    );
    const answers = Object.fromEntries(Object.entries(stored.answers ?? {}).filter(([id]) => ids.has(id)));
    return { index: Math.max(0, Math.min(lastIndex(root), stored.index)), answers, startedAt: Number(stored.startedAt) || stored.at };
}

/** Put the stored answers and place back. @param {HTMLElement} root @param {NonNullable<ReturnType<typeof storedProgress>>} stored */
function applyProgress(root, stored) {
    const state = stateOf(root);
    state.answers = /** @type {FocusState['answers']} */ (stored.answers);
    state.startedAt = stored.startedAt;
    state.index = stored.index;
    state.pendingResume = null;
    paint(root, false);
    say(root, getStrings().focusResumed(stored.index + 1));
    root.dispatchEvent(new CustomEvent(FOCUS_STEPS_RESUME_EVENT, { bubbles: true, detail: { index: stored.index, answers: { ...state.answers } } }));
}

/** @param {HTMLElement} root */
function startResume(root) {
    if (!answering(root) || opt(root, 'resume') === 'off' || !root.hasAttribute('data-kp-remember')) return;
    const stored = storedProgress(root);
    if (!stored || Object.keys(stored.answers).length === 0) return;
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
        memoryOf(root)?.forget('progress');
    }
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
    part(root, 'count').textContent = !total
        ? ''
        : onSum
          ? strings.focusSummaryTitle
          : asking
            ? strings.focusQuestionCount(index + 1, total)
            : strings.focusCount(index + 1, total);
    const bar = part(root, 'bar');
    const shownTotal = total + (summaryOn(root) ? 1 : 0);
    bar.style.setProperty('--kp-value', String(shownTotal ? (index + 1) / shownTotal : 0));
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
                }),
            );
            holder.setAttribute('data-kp-focus-steps-kind', 'empty');
        } else if (onSum) buildSummary(root, holder);
        else if (step) {
            const pending = state.pendingResume;
            if (pending) {
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
                holder.append(ask);
            }
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
        const alert = el('kp-alert kp-alert--destructive kp-focus-steps__message', 'p');
        alert.setAttribute('role', 'alert');
        alert.textContent = error;
        holder.append(alert);
        holder.setAttribute('data-kp-focus-steps-kind', 'error');
    } else if (!step) {
        if (!root.hasAttribute('aria-busy')) {
            const empty = el('kp-empty kp-focus-steps__message', 'p');
            empty.textContent = root.getAttribute('data-kp-focus-steps-empty') ?? strings.focusEmpty;
            holder.append(empty);
            holder.setAttribute('data-kp-focus-steps-kind', 'empty');
        }
    } else {
        const text = el('kp-focus-steps__text', 'p');
        text.textContent = step.text;
        holder.append(text);
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
    if (blocked || index === 0) prev.setAttribute('aria-disabled', 'true');
    else prev.removeAttribute('aria-disabled');
    prev.hidden = asking && opt(root, 'back') === 'off';
    if (blocked) next.setAttribute('aria-disabled', 'true');
    else next.removeAttribute('aria-disabled');
    const last = total > 0 && index === lastIndex(root);
    const nextText = /** @type {HTMLElement} */ (next.querySelector('.kp-button__text'));
    nextText.textContent = last ? strings.focusDone : asking && summaryOn(root) && index === total - 1 ? strings.focusReview : strings.focusNext;
    next.toggleAttribute('data-kp-focus-steps-last', last);
    if (asking && step?.answer && !blocked) paintAnswerState(root);
    part(root, 'body').scrollTop = 0;
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

/**
 * Go to a step (as a person did: the event fires when it moved).
 * @param {Element} root @param {number} index
 * @returns {boolean} whether it moved
 */
export function goToStep(root, index) {
    if (!(root instanceof HTMLElement)) return false;
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
    if (steps.some((step) => step.timer)) void import('./timer.js').then((m) => m.attachTimers(root));
    state.answers = {};
    state.draft = {};
    state.finished = null;
    state.pendingResume = null;
    paint(root, false);
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
        const prev = () => goToStep(root, state.index - 1);
        /** @param {MouseEvent} event */
        const click = (event) => {
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            if (!button || !root.contains(button) || button.getAttribute('aria-disabled') === 'true') return;
            if (pressAnswer(root, button)) return;
            if (button.hasAttribute('data-kp-focus-retry')) root.dispatchEvent(new CustomEvent(FOCUS_STEPS_RETRY_EVENT, { bubbles: true }));
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
            let act = null;
            if (event.key === 'PageDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) act = next;
            else if (event.key === 'PageUp' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) act = prev;
            else if (event.key === ' ' && !onButton) act = next;
            else if (event.key === 'Home') act = () => goToStep(root, 0);
            else if (event.key === 'End') act = () => goToStep(root, lastIndex(root));
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
        // An option changed at run time is drawn at once.
        const watch = new MutationObserver(() => paint(root, false));
        watch.observe(root, {
            attributes: true,
            attributeFilter: [
                'data-kp-progress',
                'data-kp-back',
                'data-kp-same',
                'data-kp-skip',
                'data-kp-choice-layout',
                'data-kp-summary',
                'data-kp-pinned-first',
                'data-kp-speak',
                'data-kp-focus-mode',
            ],
        });
        undo.push(() => {
            watch.disconnect();
            unkey();
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
