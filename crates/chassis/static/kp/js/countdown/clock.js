// The countdown clock: the time left is the end moment minus now, so nothing drifts, and a timer watches the end for a hidden tab.

import { END_SLACK_MS, SECOND_MS } from './constants.js';

/**
 * A countdown clock: the time left is the end moment minus now, so nothing drifts.
 * @param {{ seconds: number, now?: () => number, onEnd?: () => void, onChange?: (state: import('./constants.js').CountdownState) => void }} options
 * @returns {import('./constants.js').CountdownClock}
 */
export function countdownClock({ seconds, now = () => performance.now(), onEnd, onChange }) {
    let total = Math.max(0, seconds) * SECOND_MS;
    let left = total;
    /** @type {import('./constants.js').CountdownState} */
    let state = total > 0 ? 'idle' : 'ended';
    let endsAt = 0;
    let timer = 0;
    const arm = () => {
        clearTimeout(timer);
        // The end is watched by a timer as well as by the frames, so a hidden tab still ends on time.
        timer = window.setTimeout(check, Math.max(0, endsAt - now()) + END_SLACK_MS);
    };
    const check = () => {
        if (state !== 'running') return;
        if (endsAt - now() <= 0) {
            left = 0;
            state = 'ended';
            clearTimeout(timer);
            onChange?.(state);
            onEnd?.();
        } else arm();
    };
    return {
        state: () => {
            check();
            return state;
        },
        remaining: () => {
            check();
            return state === 'running' ? Math.max(0, endsAt - now()) : left;
        },
        total: () => total,
        start() {
            if (state !== 'idle' && state !== 'paused') return;
            endsAt = now() + left;
            state = 'running';
            arm();
            onChange?.(state);
        },
        pause() {
            if (state !== 'running') return;
            left = Math.max(0, endsAt - now());
            state = 'paused';
            clearTimeout(timer);
            onChange?.(state);
        },
        reset(next) {
            clearTimeout(timer);
            if (typeof next === 'number') total = Math.max(0, next) * SECOND_MS;
            left = total;
            state = total > 0 ? 'idle' : 'ended';
            onChange?.(state);
        },
        add(more) {
            const ms = Math.max(0, more) * SECOND_MS;
            total += ms;
            if (state === 'running') {
                endsAt += ms;
                arm();
            } else if (state === 'ended') {
                left = ms;
                endsAt = now() + left;
                state = 'running';
                arm();
            } else left += ms;
            onChange?.(state);
        },
        stop() {
            clearTimeout(timer);
        },
    };
}
