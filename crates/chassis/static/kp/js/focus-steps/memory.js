// Remembers progress and restores it.
import { agoMoment } from '../freshness.js';
import { getStrings } from '../strings.js';
import { memoryFor } from '../remember.js';
import { stateOf } from './dom.js';
import { trackOfStep, tracksOn } from './tracks.js';
import { lastIndex, opt } from './resume.js';
import { renderBand } from './band.js';
import { paint } from './paint.js';
import { recompute } from './track-nav.js';
import { say } from './flow.js';
import { FOCUS_STEPS_RESUME_EVENT } from './constants.js';
/** @typedef {import('./constants.js').FocusState} FocusState */
/** @typedef {import('./constants.js').Progress} Progress */

/** The key the progress is remembered under, or null. @param {Element} root */
export const memoryOf = (root) => (root.hasAttribute('data-kp-remember') ? memoryFor(root, 'focus-steps') : null);
/** What identifies these steps: a stored place is only good for the same recipe or questions. @param {Element} root */
function stepsKey(root) {
    return stateOf(root)
        .steps.map((step) => step.id ?? step.answer?.id ?? step.title ?? step.text.slice(0, 24))
        .join('|');
}
/** Write where the person is, after every answer and every move. @param {Element} root */
export function remember(root) {
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
    if (Array.isArray(stored.done))
        progress.done = stored.done.filter(
            (/** @type {unknown} */ i) => Number.isInteger(i) && /** @type {number} */ (i) >= 0 && /** @type {number} */ (i) < state.steps.length,
        );
    return progress;
}
/** Whether a stored place is further than the start: answers given, a step on, a track moved or a step passed. @param {Progress} stored */
const hasMoved = (stored) =>
    Object.keys(stored.answers).length > 0 ||
    stored.index > 0 ||
    (stored.done?.length ?? 0) > 0 ||
    Object.values(stored.positions ?? {}).some((pos) => pos > 0);
/** Put the stored answers and place back, every track included. @param {HTMLElement} root @param {Progress} stored */
export function applyProgress(root, stored) {
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
export function startResume(root) {
    if (opt(root, 'resume') === 'off' || !root.hasAttribute('data-kp-remember')) return;
    const stored = storedProgress(root);
    if (!stored || !hasMoved(stored)) return;
    if (opt(root, 'resume') === 'ask') {
        stateOf(root).pendingResume = stored;
        paint(root, false);
    } else applyProgress(root, stored);
}
