// What blocks a step: the blockers, their names and the lane summaries.
import { formatCountdown } from '../countdown.js';
import { getStrings } from '../strings.js';
import { stepDone, stepKeyOf, timerIdOf, timerStates, trackOfStep } from './tracks.js';
import { stateOf } from './dom.js';
/** @typedef {import('./constants.js').FocusState} FocusState */
/** @typedef {import('./constants.js').FocusStep} FocusStep */
/** @typedef {import('./constants.js').Track} Track */

/** @param {FocusStep} step */
const refsOf = (step) => [step.waitFor, step.after].flat().filter((ref) => typeof ref === 'string' && ref !== '');
/**
 * What a step waits for and has not got yet: for a step reference that step, for a track reference the first step of it
 * that is not done. A reference nobody carries waits for nothing.
 * @param {FocusState} state @param {number} i @param {import('../timer.js').TimerState[]} timers
 * @returns {{ index: number, whole: boolean, track: Track | undefined }[]}
 */
export function blockersOf(state, i, timers) {
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
export function stepLabel(state, i) {
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
export const blockerNames = (state, blocks) => joinNames(blocks.map((b) => (b.whole ? (b.track?.name ?? '') : stepLabel(state, b.index))));
/**
 * @typedef {object} Lane
 * @property {Track} track
 * @property {string} key
 * @property {string} name
 * @property {boolean} active
 * @property {'ready' | 'running' | 'paused' | 'waiting' | 'ringing' | 'finished'} status
 * @property {import('../timer.js').TimerState | null} timer the clock the lane shows
 * @property {ReturnType<typeof blockersOf>} blocks
 */

/**
 * Where each track stands, now.
 * @param {HTMLElement} root
 * @returns {Lane[]}
 */
export function laneSummaries(root) {
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
export function setText(node, selector, text) {
    const target = node.querySelector(selector);
    if (target && target.textContent !== text) target.textContent = text;
}
/** @param {import('../timer.js').TimerState} timer */
export const clockOfTimer = (timer) => formatCountdown(timer.remaining * 1000, timer.seconds >= 3600);
