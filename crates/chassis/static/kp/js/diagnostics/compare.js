// Two dotted version numbers compared, pre-release tags included.

/** @param {string} v @returns {{ numbers: number[], pre: string[] | null } | null} */
function parseVersion(v) {
    const m = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
    return m ? { numbers: m[1].split('.').map(Number), pre: m[2] === undefined ? null : m[2].split('.') } : null;
}

/**
 * The pre-release identifiers compared: numerically where both are numbers, by text otherwise (the semver rule).
 * @param {string[]} left @param {string[]} right
 * @returns {number}
 */
function comparePre(left, right) {
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const l = left[i];
        const r = right[i];
        if (l === undefined) return -1;
        if (r === undefined) return 1;
        const both = /^\d+$/.test(l) && /^\d+$/.test(r);
        const diff = both ? Number(l) - Number(r) : l < r ? -1 : l > r ? 1 : 0;
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * Compare two dotted version numbers.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number | null} negative when a is older, 0 when equal, positive when a is newer; null when either is not a version
 */
export function compareVersions(a, b) {
    // `5.0.0-alpha.1` is older than `5.0.0` and newer than `4.0.0`: a
    // pre-release tag sorts below the release it precedes, and its own
    // identifiers compare numerically where both are numbers and by text
    // otherwise (the semver rule) [C6].
    const left = parseVersion(a);
    const right = parseVersion(b);
    if (left === null || right === null) return null;
    for (let i = 0; i < Math.max(left.numbers.length, right.numbers.length); i++) {
        const diff = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0);
        if (diff !== 0) return diff;
    }
    if (left.pre === null && right.pre === null) return 0;
    if (left.pre === null) return 1;
    if (right.pre === null) return -1;
    return comparePre(left.pre, right.pre);
}
