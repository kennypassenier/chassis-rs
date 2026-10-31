// What a press came to: the work's answer read as a success or a refusal with its word and its line, or the error it threw.

import { getStrings } from '../strings.js';
import { attr } from './read.js';

/**
 * Run the work and read its answer.
 * @param {HTMLElement} button
 * @param {() => Promise<import('../flash.js').FlashAnswer> | import('../flash.js').FlashAnswer} work
 * @returns {Promise<{ ok: boolean, word: string, line: string }>}
 */
export async function settle(button, work) {
    const s = getStrings();
    try {
        const answer = await work();
        if (answer && typeof answer === 'object' && 'error' in answer) {
            return {
                ok: false,
                word: answer.word ?? attr(button, 'data-kp-refused-word', s.flashRefused),
                line: [answer.error, answer.remedy].filter(Boolean).join(' '),
            };
        }
        if (answer && typeof answer === 'object') return { ok: true, word: answer.word ?? attr(button, 'data-kp-flash-word', s.flashDone), line: answer.line ?? '' };
        return { ok: true, word: typeof answer === 'string' && answer !== '' ? answer : attr(button, 'data-kp-flash-word', s.flashDone), line: '' };
    } catch (error) {
        return { ok: false, word: attr(button, 'data-kp-failed-word', s.flashFailed), line: error instanceof Error ? error.message : String(error) };
    }
}
