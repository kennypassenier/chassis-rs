// Moving along a track: next, previous and go to a step.
import { getStrings } from '../strings.js';
import { stateOf } from './dom.js';
import { activeTrack, timerStates, trackOfStep } from './tracks.js';
import { renderBand } from './band.js';
import { paint } from './paint.js';
import { memoryOf, remember } from './memory.js';
import { say } from './flow.js';
import { FOCUS_STEPS_DONE_EVENT, FOCUS_STEPS_EVENT, FOCUS_STEPS_TRACK_EVENT } from './constants.js';
import { blockersOf } from './blockers.js';
import { recompute } from './track-nav.js';

/**
 * Next on the active track: the step is passed, the track goes on to its next, or is finished. A step that waits is not passed.
 * @param {HTMLElement} root
 */
export function trackNext(root) {
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
        root.dispatchEvent(
            new CustomEvent(FOCUS_STEPS_DONE_EVENT, {
                bubbles: true,
                detail: { total: state.steps.length, tracks: state.tracks.map((t) => t.name) },
            }),
        );
    } else remember(root);
}
/** Back on the active track: from the finished plate the last step again, else the step before, to be done again. @param {HTMLElement} root */
export function trackPrev(root) {
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
export function trackGo(root, index) {
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
        new CustomEvent(FOCUS_STEPS_EVENT, {
            bubbles: true,
            detail: { index: to, from: was, total: state.steps.length, step: state.steps[to] ?? null, track: track.name },
        }),
    );
    remember(root);
    recompute(root);
    return true;
}
