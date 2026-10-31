// The words of a text and of a query: lower case, accents folded, hyphenated words also split, each with its place in the text.

import { WORD } from './values.js';

/** @typedef {import('../intent.js').IntentOptions} IntentOptions */

/** One letter without its accent. @param {string} ch */
const fold = (ch) => ch.normalize('NFD').replace(/\p{M}/gu, '');

/**
 * The text folded and lower cased, with where each of its characters came from and ends.
 * @param {string} text
 * @param {boolean} foldDiacritics
 * @returns {{ folded: string, from: number[], to: number[] }}
 */
function foldedText(text, foldDiacritics) {
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
    return { folded, from, to };
}

/**
 * The words of a text, each with where it stands in the text as written (so a match can be marked).
 *
 * @param {string} text
 * @param {IntentOptions} [options]
 * @returns {{ w: string, start: number, end: number }[]}
 */
export function intentTokens(text, { foldDiacritics = true, splitHyphen = true } = {}) {
    const { folded, from, to } = foldedText(text, foldDiacritics);
    /** @type {{ w: string, start: number, end: number }[]} */
    const out = [];
    const word = new RegExp(WORD);
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
        .map((w) => (foldDiacritics ? fold(w) : w).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter(Boolean);
}
