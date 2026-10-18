// Words in any order: the match the command palette uses by default [kpadopt6-ops; homelab's admin/web/js/intent.js].
//
// "update jellyfin", "jellyfin update" and "jellyfin upd" all find "Update jellyfin": every typed word has to start a
// word of the command, in whatever order, and a command that answers scores higher the more of its own label it uses.
// Before this a palette matched one contiguous run of letters and answered "No commands" to three of those four.
//
// Pure: strings and lists in, a verdict or a ranked list out; no DOM and nothing runs on import. js/palette.js draws
// the result into its markup (its `intent` matcher, now the default for every palette), and a consumer that draws its
// own list calls `rankCommands`:
//
//   const rows = rankCommands(commands, 'upd jelly', { context: 'media' });
//
// What a word is: lower case, split on anything that is not a letter, a digit, a dot or a hyphen; a hyphenated word is
// also found by its parts ("kp-soft" by "kp", "kp-s" and "soft"; `splitHyphen: false` turns that off), and letters
// are matched without their accents ("cafe" finds "Café", "herstart" finds "herstárt"; `foldDiacritics: false`).
// `typo: 1` also finds a word one letter off (never for a word under four letters, so "read" does not find "Report").
// The label's words weigh 4, a hint's or hidden synonym's 1; an exact word, and the first typed word starting the
// label's first word, add a little (homelab's tested weights).

import { getStrings } from './strings.js';

/** The most rows a list shows at once; the rest wait for more words (homelab's tested value). */
export const INTENT_MAX_SHOWN = 40;

/** @typedef {{ foldDiacritics?: boolean, splitHyphen?: boolean, typo?: 0 | 1 | boolean }} IntentOptions */

/** One letter without its accent. @param {string} ch */
const fold = (ch) => ch.normalize('NFD').replace(/\p{M}/gu, '');

/**
 * The words of a text, each with where it stands in the text as written (so a match can be marked).
 *
 * @param {string} text
 * @param {IntentOptions} [options]
 * @returns {{ w: string, start: number, end: number }[]}
 */
export function intentTokens(text, { foldDiacritics = true, splitHyphen = true } = {}) {
    /** The text folded and lower cased, with where each of its characters came from. */
    let folded = '';
    /** @type {number[]} */
    const from = [];
    /** @type {number[]} */
    const to = [];
    let at = 0;
    for (const ch of String(text)) {
        const piece = (foldDiacritics ? fold(ch) : ch).toLowerCase();
        for (const c of piece) {
            folded += c;
            from.push(at);
            to.push(at + ch.length);
        }
        at += ch.length;
    }
    /** @type {{ w: string, start: number, end: number }[]} */
    const out = [];
    const word = /[\p{L}\p{N}.-]+/gu;
    for (let m; (m = word.exec(folded));) {
        const w = m[0];
        const start = m.index;
        out.push({ w, start: from[start], end: to[start + w.length - 1] });
        if (splitHyphen && w.includes('-')) {
            let offset = 0;
            for (const part of w.split('-')) {
                if (part) out.push({ w: part, start: from[start + offset], end: to[start + offset + part.length - 1] });
                offset += part.length + 1;
            }
        }
    }
    return out;
}

/**
 * The searchable words of a text: lower case, accents folded, hyphenated words also split.
 * @param {string} text
 * @param {IntentOptions} [options]
 * @returns {string[]}
 */
export const intentWords = (text, options) => intentTokens(text, options).map((t) => t.w);

/**
 * The words a person typed.
 * @param {string} query
 * @param {IntentOptions} [options]
 * @returns {string[]}
 */
export function queryWords(query, { foldDiacritics = true } = {}) {
    return String(query)
        .split(/\s+/)
        .map((w) => (foldDiacritics ? w.normalize('NFD').replace(/\p{M}/gu, '') : w).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter(Boolean);
}

/**
 * Whether two strings are one edit apart (an insertion, a deletion, a substitution or a swap).
 * @param {string} a @param {string} b
 */
function oneEdit(a, b) {
    if (a === b) return true;
    const diff = a.length - b.length;
    if (Math.abs(diff) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (i === a.length || i === b.length) return true;
    if (diff === 0) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return diff > 0 ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * Whether a typed word starts a word of the text (or, with `typo`, almost does).
 * @param {string} have a word of the text
 * @param {string} want a typed word
 * @param {IntentOptions} [options]
 */
export function startsWord(have, want, { typo = 0 } = {}) {
    if (have.startsWith(want)) return true;
    if (!typo || want.length < 4) return false;
    return (
        oneEdit(have.slice(0, want.length), want) || oneEdit(have.slice(0, want.length - 1), want) || oneEdit(have.slice(0, want.length + 1), want)
    );
}

/**
 * Whether every typed word starts one of the text's words, in any order. An empty query matches everything.
 * @param {string} text
 * @param {string} query
 * @param {IntentOptions} [options]
 */
export function matchIntent(text, query, options = {}) {
    const want = queryWords(query, options);
    if (want.length === 0) return true;
    const have = intentWords(text, options);
    return want.every((w) => have.some((h) => startsWord(h, w, options)));
}

/**
 * @typedef {object} IntentItem
 * @property {string} label the words that are shown
 * @property {string} [hint] more words that are shown (a description); they weigh 1
 * @property {string} [words] words that are never shown (synonyms); they weigh 1
 */

/**
 * How well an item answers the typed words; -1 when it does not. A word found in the label counts 4 (one more when it
 * is the exact word, two more when it is the first typed word starting the label's first word); one found in the hint
 * or the hidden words counts 1.
 *
 * @param {IntentItem} item
 * @param {string[]} want the typed words (queryWords())
 * @param {IntentOptions} [options]
 */
export function intentScore(item, want, options = {}) {
    if (want.length === 0) return 0;
    const label = intentWords(item.label, options);
    const rest = intentWords(`${item.hint ?? ''} ${item.words ?? ''}`, options);
    let s = 0;
    for (const [i, w] of want.entries()) {
        const li = label.findIndex((h) => startsWord(h, w, options));
        if (li >= 0) {
            s += 4;
            if (label[li] === w) s += 1;
            if (i === 0 && li === 0) s += 2;
            continue;
        }
        if (rest.some((h) => startsWord(h, w, options))) {
            s += 1;
            continue;
        }
        return -1;
    }
    return s;
}

/**
 * Where the typed words start words of a text, as ranges of the text as written, merged and in order: what a list
 * marks so the reader sees why a row matched.
 *
 * @param {string} text
 * @param {string[]} want
 * @param {IntentOptions} [options]
 * @returns {[number, number][]}
 */
export function intentRanges(text, want, options = {}) {
    /** @type {[number, number][]} */
    const found = [];
    const tokens = intentTokens(text, options);
    for (const w of want) {
        const token = tokens.find((t) => t.w.startsWith(w)) ?? (options.typo ? tokens.find((t) => startsWord(t.w, w, options)) : undefined);
        if (!token) continue;
        const length = Math.min(w.length, token.end - token.start);
        found.push([token.start, token.start + length]);
    }
    found.sort((a, b) => a[0] - b[0]);
    /** @type {[number, number][]} */
    const merged = [];
    for (const r of found) {
        const last = merged[merged.length - 1];
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push([r[0], r[1]]);
    }
    return merged;
}

/**
 * @typedef {object} IntentCommand
 * @property {string} id
 * @property {string} [group] the section it is listed under
 * @property {string} label
 * @property {string} [hint]
 * @property {string} [words]
 * @property {string} [context] the subject it is about, so the open subject's commands come first
 * @property {boolean} [featured] shown before anything is typed
 */

/**
 * @typedef {object} RankOptions
 * @property {string | null} [context] the subject that is open now: its commands rank higher (+3) and show first
 * @property {number} [maxShown] the most rows shown (default 40)
 * @property {readonly string[]} [groupOrder] the sections in the order they are shown (default: the order they first appear)
 * @property {readonly string[]} [recent] the ids of the commands run last, newest first: shown first when nothing is typed
 * @property {boolean} [foldDiacritics]
 * @property {boolean} [splitHyphen]
 * @property {0 | 1 | boolean} [typo]
 */

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
    const hasStart = commands.some((c) => c.featured || (context != null && c.context === context) || recent.includes(c.id));
    const rank = (/** @type {string} */ g) => {
        const i = groupOrder.indexOf(g);
        return i < 0 ? groupOrder.length : i;
    };
    const scored = commands
        .map((c, i) => ({ c, i, s: intentScore(c, want, match) }))
        .filter(({ c, s }) => {
            if (s < 0) return false;
            if (want.length > 0 || !hasStart) return true;
            return Boolean(c.featured) || (context != null && c.context === context) || recent.includes(c.id);
        })
        .map((x) => ({
            ...x,
            s: x.s + (context != null && x.c.context === context ? 3 : 0) + (want.length === 0 && recent.includes(x.c.id) ? 2 : 0),
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
