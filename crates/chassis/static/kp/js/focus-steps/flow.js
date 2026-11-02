// The step flow: taking an answer, advancing, and the answer state.
import { getStrings } from '../strings.js';
import { part, stateOf } from './dom.js';
import { FOCUS_STEPS_ANSWER_EVENT, FOCUS_STEPS_BEFORE_ANSWER_EVENT, FOCUS_STEPS_DONE_EVENT } from './constants.js';
import { memoryOf, remember } from './memory.js';
import { answerReady, answering, currentValue, lastIndex, opt, wordsOf } from './resume.js';
import { tracksOn } from './tracks.js';
import { trackNext } from './track-steps.js';
import { goToStep } from './api.js';
/** @typedef {import('./constants.js').FocusAnswer} FocusAnswer */
/** @typedef {import('./constants.js').FocusChoice} FocusChoice */
/** @typedef {import('./constants.js').FocusStep} FocusStep */

/**
 * Take an answer: the cancelable event first, then the record, the memory, the event and a sentence.
 * @param {HTMLElement} root @param {string | string[] | null} value @param {'tap' | 'same' | 'skip'} source @param {Record<string, unknown>} [extra]
 * @returns {boolean} whether it was taken
 */
export function takeAnswer(root, value, source, extra = {}) {
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
export function goNext(root) {
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
export function pressAnswer(root, button) {
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
export function paintAnswerState(root) {
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
/** @param {Element} root @param {string} message */
export function say(root, message) {
    const region = part(root, 'live');
    region.textContent = '';
    setTimeout(() => (region.textContent = message), 60);
}
