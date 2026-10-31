// A list of commands for a query: grouped, best answer first, and what a list says when nothing answers.

import { getStrings } from '../strings.js';
import { CONTEXT_BONUS, INTENT_MAX_SHOWN, RECENT_BONUS } from './values.js';
import { intentWords, queryWords } from './tokens.js';
import { intentScore } from './score.js';

/** @typedef {import('../intent.js').IntentOptions} IntentOptions */
/** @typedef {import('../intent.js').IntentCommand} IntentCommand */
/** @typedef {import('../intent.js').RankOptions} RankOptions */

/**
 * The rows for a query: only the commands that answer it, grouped, the best answer first in each group (the open
 * subject's before every other's), at most `maxShown`. With nothing typed it shows what is featured, what is about
 * the open subject and what was run last; when a list has none of those it shows every command, in its own order.
 *
 * @template {IntentCommand} T
 * @param {readonly T[]} commands
 * @param {string} query
 * @param {RankOptions} [options]
 * @returns {{ group: string, commands: T[] }[]}
 */
export function rankCommands(commands, query, { context = null, maxShown = INTENT_MAX_SHOWN, groupOrder = [], recent = [], ...match } = {}) {
    const want = queryWords(query, match);
    const isStart = (/** @type {T} */ c) => Boolean(c.featured) || (context != null && c.context === context) || recent.includes(c.id);
    const hasStart = commands.some(isStart);
    const rank = (/** @type {string} */ g) => {
        const i = groupOrder.indexOf(g);
        return i < 0 ? groupOrder.length : i;
    };
    const scored = commands
        .map((c, i) => ({ c, i, s: intentScore(c, want, match) }))
        .filter(({ c, s }) => s >= 0 && (want.length > 0 || !hasStart || isStart(c)))
        .map((x) => ({
            ...x,
            s: x.s + (context != null && x.c.context === context ? CONTEXT_BONUS : 0) + (want.length === 0 && recent.includes(x.c.id) ? RECENT_BONUS : 0),
        }));
    scored.sort((a, b) => rank(a.c.group ?? '') - rank(b.c.group ?? '') || b.s - a.s || a.i - b.i);
    /** @type {Map<string, T[]>} */
    const groups = new Map();
    for (const { c } of scored.slice(0, maxShown)) {
        const g = c.group ?? '';
        groups.set(g, [...(groups.get(g) ?? []), c]);
    }
    return [...groups].map(([group, list]) => ({ group, commands: list }));
}

/**
 * What a list says when nothing answers: when the first word is a verb it knows, which subjects that verb works on
 * ("There is no stack called jellyfin. Update works on: admin, gateway."), otherwise what to try. The words are the
 * dictionary's (`intentNoSubject`, `intentNoMatch`).
 *
 * @param {string} query
 * @param {{ verbs?: readonly string[], subjects?: readonly string[], noun?: string, hint?: string }} [known]
 * @param {IntentOptions} [options]
 * @returns {string}
 */
export function noMatchText(query, { verbs = [], subjects = [], noun = '', hint = '' } = {}, options = {}) {
    const s = getStrings();
    const want = queryWords(query, options);
    const verb = verbs.find((v) => want.length > 1 && intentWords(v, options)[0]?.startsWith(want[0]));
    if (verb && subjects.length > 0) return s.intentNoSubject(want.slice(1).join(' '), verb, [...subjects], noun);
    return hint || s.intentNoMatch;
}
