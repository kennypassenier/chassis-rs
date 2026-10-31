// Pure name matching: normalising, similarity and the nearest names.

/** A name as the guard compares it: case, accents and spacing ignored. Pure. @param {string} text */
export function normaliseName(text) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * How alike two names are, 0 to 1: one minus the edit distance over the longer length, after `normaliseName`. Pure.
 * @param {string} a @param {string} b
 */
export function similarity(a, b) {
    const x = normaliseName(a);
    const y = normaliseName(b);
    if (x === y) return 1;
    if (x === '' || y === '') return 0;
    /** @type {number[]} */
    let row = Array.from({ length: y.length + 1 }, (_, j) => j);
    for (let i = 1; i <= x.length; i += 1) {
        const next = [i];
        for (let j = 1; j <= y.length; j += 1) {
            next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1));
        }
        row = next;
    }
    return 1 - (row[y.length] ?? 0) / Math.max(x.length, y.length);
}

/**
 * The names closest to what was typed, nearest first: at least `threshold` alike, at most `max`, never an identical one. Pure.
 * @template {{ label: string }} T
 * @param {string} typed @param {readonly T[]} names @param {number} [threshold] @param {number} [max]
 * @returns {T[]}
 */
export function nearNames(typed, names, threshold = 0.8, max = 3) {
    return names
        .map((name) => ({ name, score: similarity(typed, name.label) }))
        .filter(({ score }) => score >= threshold && score < 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, max)
        .map(({ name }) => name);
}
