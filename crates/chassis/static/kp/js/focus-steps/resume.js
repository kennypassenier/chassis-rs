// The resume question and the helpers that read an answer.
import { getStrings } from '../strings.js';
import { el, stateOf } from './dom.js';
/** @typedef {import('./constants.js').FocusAnswer} FocusAnswer */

// ── Answer mode [kpadopt6] ─────────────────────────────────────────────────────────────────────

/** The question over a step when the person stopped here before: carry on or start again [gaps-time-1019: cook mode too]. */
export function buildResumeAsk() {
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
export const emptyAction = (root) => root.getAttribute('data-kp-focus-steps-empty-action')?.trim() || '';
/** @param {Element} root @param {string} name @param {string} [fallback] */
export const opt = (root, name, fallback) => root.getAttribute(`data-kp-${name}`) ?? fallback;
/** Whether this view is asking questions: its mode, or any step that carries an answer. @param {Element} root */
export function answering(root) {
    return root.getAttribute('data-kp-focus-mode') === 'answer' || stateOf(root).steps.some((step) => step.answer);
}
/** @param {Element} root */
export const summaryOn = (root) => answering(root) && opt(root, 'summary') === 'on';
/** The last index a person can stand on: the last step, or the summary after it. @param {Element} root */
export const lastIndex = (root) => stateOf(root).steps.length - 1 + (summaryOn(root) ? 1 : 0);
/** @param {Element} root */
export const onSummary = (root) => summaryOn(root) && stateOf(root).index === stateOf(root).steps.length;
/** The words of a value in a step's choices. @param {FocusAnswer} answer @param {string | string[] | null | undefined} value */
export function wordsOf(answer, value) {
    if (value === null || value === undefined) return '';
    const label = (/** @type {string} */ v) => answer.choices?.find((c) => c.value === v)?.label ?? v;
    return Array.isArray(value) ? value.map(label).join(', ') : label(value);
}
/** What has been answered on the step now, in the answer's own shape. @param {Element} root @param {FocusAnswer} answer */
export function currentValue(root, answer) {
    const state = stateOf(root);
    const draft = state.draft[answer.id];
    if (draft !== undefined) return draft;
    const given = state.answers[answer.id];
    if (given && given.source !== 'skip') return given.value;
    return answer.kind === 'multi' ? [] : '';
}
/** Whether Next may be pressed on a question: it is answered, or has something ready to be. @param {Element} root @param {FocusAnswer} answer */
export function answerReady(root, answer) {
    const state = stateOf(root);
    if (state.answers[answer.id]) return true;
    const draft = state.draft[answer.id];
    return Array.isArray(draft) ? draft.length > 0 : typeof draft === 'string' && draft.trim() !== '';
}
