// The exits of a leave, turned around: each plays from the timeline's end backwards, its iterations in the opposite order.

import { finiteMs } from './turns.js';

/**
 * @typedef {{ target: Element, keyframes: Keyframe[], pseudoElement: string | null | undefined, timing: EffectTiming, end: number }} TakenExit
 */

/**
 * Play each taken-over exit turned around, ending at the timeline's end.
 * @param {TakenExit[]} exits
 * @param {number} total the length of the whole leave
 * @returns {Animation[]}
 */
export function playTurnedExits(exits, total) {
    /** @type {Animation[]} */
    const plays = [];
    for (const exit of exits) {
        // In the leave this exit ran from its delay to its end; turned
        // around it ends at the timeline's end. Its iterations play in the
        // opposite order, each backwards: a normal or reverse exit swaps
        // direction, an alternating one keeps its own for an even count.
        const { iterations = 1, direction = 'normal', easing = 'linear', duration } = exit.timing;
        const even = Number(iterations) % 2 === 0;
        /** @type {Record<PlaybackDirection, PlaybackDirection>} */
        const turned = {
            normal: 'reverse',
            reverse: 'normal',
            alternate: even ? 'alternate' : 'alternate-reverse',
            'alternate-reverse': even ? 'alternate-reverse' : 'alternate',
        };
        const back = turned[direction] ?? 'reverse';
        try {
            plays.push(
                exit.target.animate(exit.keyframes, {
                    duration: Number(duration) || 0,
                    iterations: Number(iterations),
                    delay: finiteMs(total - exit.end),
                    easing: String(easing),
                    direction: back,
                    fill: 'both',
                    ...(exit.pseudoElement ? { pseudoElement: exit.pseudoElement } : {}),
                }),
            );
        } catch {
            /* an engine that cannot animate that pseudo-element skips it, as the leave does */
        }
    }
    return plays;
}
