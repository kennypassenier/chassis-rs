// What a question's spec means: its times in ms, its answers (Allow and Stop by default), its countdown look and what happens at zero.

import { getStrings } from '../strings.js';
import { MS_PER_SECOND, QUESTION_URGENT_AT } from './values.js';

/** @typedef {import('../question-card.js').QuestionSpec} QuestionSpec */
/** @typedef {import('../question-card.js').QuestionAnswer} QuestionAnswer */

/** @param {number | string | undefined} value @returns {number | null} */
export const toMs = (value) => {
    if (value === undefined) return null;
    const ms = typeof value === 'number' ? value : /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
};

/**
 * @typedef {object} ResolvedQuestion
 * @property {number} deadline ms
 * @property {number} asked ms
 * @property {number} urgentAt ms before the end from which the card is urgent
 * @property {QuestionAnswer[]} answers
 * @property {'bar' | 'ring' | 'text'} countdown
 * @property {'keep' | 'remove'} expiredMode
 * @property {QuestionAnswer | undefined} fallback the answer that happens at zero
 */

/**
 * @param {QuestionSpec} spec
 * @param {() => number} now
 * @returns {ResolvedQuestion}
 */
export function resolveQuestion(spec, now) {
    const s = getStrings();
    const answers = spec.answers ?? [
        { value: 'allow', label: s.questionAllow },
        { value: 'stop', label: s.questionStop, tone: /** @type {const} */ ('destructive') },
    ];
    return {
        deadline: toMs(spec.deadline) ?? now(),
        asked: toMs(spec.asked) ?? now(),
        urgentAt: (spec.urgentAt ?? QUESTION_URGENT_AT) * MS_PER_SECOND,
        answers,
        countdown: spec.countdown ?? 'ring',
        expiredMode: spec.expired ?? 'keep',
        fallback: answers.find((a) => a.value === spec.defaultAnswer),
    };
}
