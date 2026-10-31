// Whether typed words start the words of a text: the prefix test, the one-letter-off test and the yes/no match.

import { TYPO_MIN_LENGTH } from './values.js';
import { intentWords, queryWords } from './tokens.js';

/** @typedef {import('../intent.js').IntentOptions} IntentOptions */

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
    if (!typo || want.length < TYPO_MIN_LENGTH) return false;
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
