// How well an item answers the typed words, and which stretches of its text to mark.

import { EXACT_BONUS, FIRST_WORD_BONUS, HINT_WEIGHT, LABEL_WEIGHT } from './values.js';
import { intentTokens, intentWords } from './tokens.js';
import { startsWord } from './match.js';

/** @typedef {import('../intent.js').IntentOptions} IntentOptions */
/** @typedef {import('../intent.js').IntentItem} IntentItem */

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
            s += LABEL_WEIGHT;
            if (label[li] === w) s += EXACT_BONUS;
            if (i === 0 && li === 0) s += FIRST_WORD_BONUS;
            continue;
        }
        if (rest.some((h) => startsWord(h, w, options))) {
            s += HINT_WEIGHT;
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
