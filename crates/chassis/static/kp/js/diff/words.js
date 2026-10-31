// Pure word diffing: tokens, segments and the pairs of words that changed.
import { DIFF_WORD_LIMIT, DIFF_WORD_SHARE } from './constants.js';
/** @typedef {import('./types.js').DiffLine} DiffLine */
/** @typedef {import('./types.js').Segment} Segment */

// --- The words ------------------------------------------------------------------------------------------------------

/** A word is a run of letters and digits, a version or a dotted name stays one piece. */
const TOKENS = /[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*|\s+|[^\sA-Za-z0-9_]/g;

/** @param {string} text */
const tokensOf = (text) => text.match(TOKENS) ?? [];

/**
 * Merge neighbouring pieces of the same kind, and let a gap of white space between two changed runs join them.
 * @param {string[]} tokens @param {boolean[]} changed @returns {Segment[]}
 */
function segmentsOf(tokens, changed) {
    const flags = [...changed];
    for (let i = 1; i < tokens.length - 1; i += 1) if (!flags[i] && /^\s+$/.test(tokens[i]) && flags[i - 1] && flags[i + 1]) flags[i] = true;
    /** @type {Segment[]} */
    const out = [];
    tokens.forEach((text, i) => {
        const last = out[out.length - 1];
        if (last && last.changed === flags[i]) last.text += text;
        else out.push({ text, changed: flags[i] });
    });
    return out;
}

/**
 * The words that differ between two lines: the longest run of pieces they share is kept, the rest is marked.
 * `changed` is false when there is nothing to mark, or when so much of the line differs that the line itself is the
 * change (more than `DIFF_WORD_SHARE` of the longer one), or when a line is too long to split.
 *
 * @param {string} oldText @param {string} newText
 * @returns {{ old: Segment[], new: Segment[], changed: boolean, share: number }}
 */
export function diffWords(oldText, newText) {
    const whole = (/** @type {string} */ text) => [{ text, changed: false }];
    const plain = { old: whole(oldText), new: whole(newText), changed: false, share: 0 };
    if (oldText === newText || oldText.length > DIFF_WORD_LIMIT || newText.length > DIFF_WORD_LIMIT) return plain;
    const a = tokensOf(oldText);
    const b = tokensOf(newText);
    const n = a.length;
    const m = b.length;
    // Longest common subsequence of pieces, table from the end so the walk below runs forwards.
    const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1)
        for (let j = m - 1; j >= 0; j -= 1) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    const goneA = new Array(n).fill(true);
    const goneB = new Array(m).fill(true);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            goneA[i] = false;
            goneB[j] = false;
            i += 1;
            j += 1;
        } else if (table[i + 1][j] >= table[i][j + 1]) i += 1;
        else j += 1;
    }
    const old = segmentsOf(a, goneA);
    const next = segmentsOf(b, goneB);
    const size = (/** @type {Segment[]} */ segments) => segments.reduce((sum, s) => sum + (s.changed ? s.text.length : 0), 0);
    const share = Math.max(size(old) / Math.max(1, oldText.length), size(next) / Math.max(1, newText.length));
    if (size(old) + size(next) === 0 || share > DIFF_WORD_SHARE) return { ...plain, share };
    return { old, new: next, changed: true, share };
}

/**
 * Pair the lines of each run "removed lines, then added lines" one to one and split every pair into words.
 * @param {DiffLine[]} lines @returns {Map<DiffLine, Segment[]>}
 */
export function wordPairs(lines) {
    /** @type {Map<DiffLine, Segment[]>} */
    const out = new Map();
    let i = 0;
    while (i < lines.length) {
        if (lines[i].kind !== 'removed') {
            i += 1;
            continue;
        }
        let j = i;
        while (j < lines.length && lines[j].kind === 'removed') j += 1;
        let k = j;
        while (k < lines.length && lines[k].kind === 'added') k += 1;
        for (let p = 0; p < Math.min(j - i, k - j); p += 1) {
            const words = diffWords(lines[i + p].text, lines[j + p].text);
            if (words.changed) {
                out.set(lines[i + p], words.old);
                out.set(lines[j + p], words.new);
            }
        }
        i = Math.max(k, i + 1);
    }
    return out;
}
