// Tracks: which steps run in parallel and the timers they wait for.
import { getStrings } from '../strings.js';
import { focusState } from './state.js';
import { stateOf } from './dom.js';
import { opt } from './resume.js';
/** @typedef {import('./constants.js').FocusState} FocusState */
/** @typedef {import('./constants.js').Track} Track */

// ── Parallel tracks [focus-tracks-1019] ────────────────────────────────────────────────────────
/** Whether this view shows lanes: two or more tracks, and the option not off. @param {Element} root */
export const tracksOn = (root) => stateOf(root).tracks.length > 1 && opt(root, 'tracks', 'auto') !== 'off';
/** @param {FocusState} state @param {number} i */
export const stepKeyOf = (state, i) => state.steps[i]?.id ?? `step-${i + 1}`;
/** The id a step's timer has in the timer list. @param {FocusState} state @param {number} i */
export const timerIdOf = (state, i) => state.steps[i]?.timer?.id ?? stepKeyOf(state, i);
/** @param {FocusState} state @param {number} i */
export const trackOfStep = (state, i) => state.tracks.find((t) => t.order.includes(i));
/** @param {FocusState} state */
export const activeTrack = (state) => state.tracks.find((t) => t.key === state.track) ?? state.tracks[0];
/**
 * Lay the tracks out of the steps: one per distinct `track`, in the order the steps name them; a step with none is in the shared
 * lane. Where each track stood is kept when the steps are laid again.
 * @param {HTMLElement} root
 */
export function layTracks(root) {
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
/** The timers of the list, now. @param {Element} root @returns {import('../timer.js').TimerState[]} */
export function timerStates(root) {
    const list = timerList(root);
    return list && focusState.timerModule ? focusState.timerModule.getTimers(list) : [];
}
/** @param {import('../timer.js').TimerState | undefined} timer */
export const isOpen = (timer) => timer !== undefined && (timer.state === 'running' || timer.state === 'paused');
/** A step is done when it was passed and its timer, if one was started, has ended. @param {FocusState} state @param {number} i @param {import('../timer.js').TimerState[]} timers */
export const stepDone = (state, i, timers) => state.done.has(i) && !isOpen(timers.find((t) => t.id === timerIdOf(state, i)));
