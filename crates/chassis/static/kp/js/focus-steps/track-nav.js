// Moving between tracks: switch, next, previous, go and start.
import { getStrings } from '../strings.js';
import { part, stateOf } from './dom.js';
import { activeTrack, layTracks, timerIdOf, timerStates, trackOfStep, tracksOn } from './tracks.js';
import { raiseAlert, renderBand, suggestion, waitLine } from './band.js';
import { paint } from './paint.js';
import { memoryOf, remember } from './memory.js';
import { say } from './flow.js';
import { FOCUS_STEPS_DONE_EVENT, FOCUS_STEPS_EVENT, FOCUS_STEPS_TRACK_EVENT } from './constants.js';
import { opt } from './resume.js';
import { blockerNames, blockersOf, clockOfTimer, laneSummaries, stepLabel } from './blockers.js';
import { paintLanes } from './lanes.js';

/**
 * Go to a track: its own place, its own step. The event tells the page.
 * @param {HTMLElement} root @param {string} key @param {'tap' | 'key' | 'script' | 'attention' | 'auto'} reason
 * @returns {boolean} whether it moved
 */
export function switchTrack(root, key, reason) {
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
export function stepTrack(root, by, reason = 'key') {
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
export function recompute(root) {
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
/** The step's timer button and the waiting plate follow the clock. @param {HTMLElement} root @param {import('../timer.js').TimerState[]} timers */
export function paintLive(root, timers) {
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
/**
 * A step timer ended: its track asks for the person.
 * @param {HTMLElement} root @param {number} i the step @param {import('../timer.js').TimerState} timer
 */
export function timerEnded(root, i, timer) {
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
export function startTracks(root, start) {
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
