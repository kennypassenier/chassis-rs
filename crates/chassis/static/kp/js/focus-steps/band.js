// The band above the step: alerts, the wait line and the suggestion.
import { getStrings } from '../strings.js';
import { setAttention } from '../attention.js';
import { blockersOf, clockOfTimer } from './blockers.js';
import { el, stateOf } from './dom.js';
import { opt } from './resume.js';
import { say } from './flow.js';
import { FOCUS_STEPS_TRACK_ATTENTION_EVENT } from './constants.js';
import { isOpen, timerIdOf, trackOfStep } from './tracks.js';
/** @typedef {import('./constants.js').FocusState} FocusState */
/** @typedef {import('./blockers.js').Lane} Lane */
/** @typedef {import('./constants.js').Track} Track */
/** @typedef {import('./constants.js').TrackAlert} TrackAlert */

/** The band above the step: the tracks asking for the person, worst first, each with the button that goes there. @param {HTMLElement} root */
export function renderBand(root) {
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
export function raiseAlert(root, track, alert) {
    const state = stateOf(root);
    state.alerts.set(track.key, alert);
    renderBand(root);
    say(root, `${alert.title}. ${alert.text}`);
    root.dispatchEvent(
        new CustomEvent(FOCUS_STEPS_TRACK_ATTENTION_EVENT, {
            bubbles: true,
            detail: { track: track.name, key: track.key, reason: alert.reason, index: alert.index },
        }),
    );
}
/** A track's alert is answered: the person went there, stepped on, or said got it. @param {HTMLElement} root @param {string} key */
export function clearAlert(root, key) {
    if (stateOf(root).alerts.delete(key)) renderBand(root);
}
/** The words of a waiting step: what it waits for, and for a timer how long. @param {FocusState} state @param {ReturnType<typeof blockersOf>} blocks @param {import('../timer.js').TimerState[]} timers @param {number} index the waiting step */
export function waitLine(state, blocks, timers, index) {
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
export const suggestion = (lanes) => lanes.find((l) => !l.active && l.status === 'ringing') ?? lanes.find((l) => !l.active && l.status === 'ready');
