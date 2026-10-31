// Folding the unchanged context of a hunk.
import { DIFF_CONTEXT, DIFF_FOLD_MIN } from './constants.js';
/** @typedef {import('./types.js').DiffLine} DiffLine */
/** @typedef {import('./types.js').Part} Part */

/**
 * Cut a hunk's lines into stretches that show and stretches that fold. A run of unchanged lines keeps `keep` lines next to
 * every change and folds the middle when that hides at least `min` lines; a run at the start or the end of the hunk keeps
 * its lines next to the change only. A hunk with no change, and `keep` of 0, fold nothing.
 *
 * @param {readonly DiffLine[]} lines @param {number} [keep] @param {number} [min]
 * @returns {Part[]}
 */
export function foldContext(lines, keep = DIFF_CONTEXT, min = DIFF_FOLD_MIN) {
    const n = lines.length;
    if (keep <= 0 || !lines.some((line) => line.kind !== 'same')) return [{ kind: 'lines', from: 0, lines: [...lines] }];
    /** @type {Part[]} */
    const out = [];
    let start = 0;
    let i = 0;
    while (i < n) {
        if (lines[i].kind !== 'same') {
            i += 1;
            continue;
        }
        let j = i;
        while (j < n && lines[j].kind === 'same') j += 1;
        const before = i === 0 ? 0 : keep;
        const after = j === n ? 0 : keep;
        if (j - i - before - after >= min) {
            const from = i + before;
            const to = j - after;
            if (from > start) out.push({ kind: 'lines', from: start, lines: lines.slice(start, from) });
            out.push({ kind: 'fold', from, lines: lines.slice(from, to) });
            start = to;
        }
        i = j;
    }
    if (start < n) out.push({ kind: 'lines', from: start, lines: lines.slice(start) });
    return out;
}
