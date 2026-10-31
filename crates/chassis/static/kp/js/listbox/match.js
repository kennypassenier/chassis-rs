// Matching text against a query the way a command palette does: as a subsequence.

/**
 * Does `text` match `query` as a subsequence, the way a command palette
 * matches? "thm" finds "Theme".
 *
 * Deliberately not a fuzzy-score library: this returns whether it matches
 * and the caller keeps its own order. A ranking function that nobody can
 * explain is how a palette starts putting the wrong thing first.
 *
 * @param {string} text
 * @param {string} query
 * @returns {boolean}
 */
export function subsequence(text, query) {
    if (query === '') return true;
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
    let at = 0;
    for (const character of needle) {
        at = haystack.indexOf(character, at);
        if (at === -1) return false;
        at += 1;
    }
    return true;
}
