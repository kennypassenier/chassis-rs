// The functions a page calls to move, read and set the focus steps.
import { getStrings } from '../strings.js';
import { openBusyCard } from '../busy-card.js';
import { focusState } from './state.js';
import { stepKeyOf, tracksOn } from './tracks.js';
import { recompute, startTracks, trackGo } from './track-nav.js';
import { build, part, stateOf } from './dom.js';
import { answering, lastIndex } from './resume.js';
import { paint } from './paint.js';
import { say } from './flow.js';
import { remember, startResume } from './memory.js';
import { FOCUS_STEPS_EVENT } from './constants.js';
/** @typedef {import('./constants.js').FocusStep} FocusStep */

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
 * @typedef {object} StepsPassed
 * @property {number} count how many steps are passed
 * @property {number} total how many steps the flow has
 * @property {number[]} indexes the passed steps' places, in order
 * @property {string[]} ids their ids (`step-<n>` for a step without one)
 * @property {FocusStep[]} steps copies of the passed steps themselves
 */

/**
 * The steps the person has passed [wish-1028, Kitchen 4]: a page that mirrors the progress (a checklist beside the flow, "3 of 8
 * done") reads it here instead of from the remembered progress. In a flow with lines of work (tracks) a step is passed when Next
 * left it; in a single line it is every step before the one shown; a finished flow has passed them all. Read on the call: it is a
 * copy, so changing it changes nothing.
 * @param {Element} root
 * @returns {StepsPassed}
 */
export function getStepsPassed(root) {
    const state = stateOf(root);
    const total = state.steps.length;
    const indexes = state.finished
        ? state.steps.map((_, i) => i)
        : tracksOn(root)
          ? [...state.done].filter((i) => i >= 0 && i < total).sort((a, b) => a - b)
          : state.steps.map((_, i) => i).filter((i) => i < state.index);
    return {
        count: indexes.length,
        total,
        indexes,
        ids: indexes.map((i) => stepKeyOf(state, i)),
        steps: indexes.map((i) => /** @type {FocusStep} */ ({ ...state.steps[i] })),
    };
}
/**
 * The steps the flow was given by setFocusSteps, as copies, in order [wish-1028].
 * @param {Element} root
 * @returns {FocusStep[]}
 */
export const getSteps = (root) => stateOf(root).steps.map((step) => ({ ...step }));
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
        void import('../timer.js').then((m) => {
            focusState.timerModule = m;
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
export const typing = (target) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
