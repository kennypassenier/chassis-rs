// Pure: the numbers in a version, how big a jump is, and a list of jumps counted for a heading.

import { getStrings } from '../strings.js';
import { SEMVER_NUMBERS, VERSION_LEVELS } from './values.js';

/** @typedef {import('../version-delta.js').VersionLevel} VersionLevel */
/** @typedef {import('../version-delta.js').LevelOptions} LevelOptions */

/**
 * The numbers in a version, in order: `v10.11.11` gives [10, 11, 11], linuxserver's `5.2.3_v2.0.14-ls474` gives
 * [5, 2, 3, 2, 0, 14, 474]. The same reading the host's pin check uses.
 * @param {string} version
 * @returns {number[]}
 */
export function versionNumbers(version) {
    return (String(version ?? '').match(/\d+/g) ?? []).map(Number);
}

/**
 * How big a jump is: `major` (the first number rose, or the second for an app that asks for it), `minor` (the second),
 * `patch` (any later number), `downgrade` (a number fell), `same`, `other` (something changed that has no numbers in
 * it, such as a digest) or `unknown` (a version is missing, or the scheme does not read numbers).
 *
 * @param {string | null | undefined} from
 * @param {string | null | undefined} to
 * @param {LevelOptions} [options]
 * @returns {VersionLevel}
 */
export function versionLevel(from, to, { scheme = 'numbers', bigAt = 'first', app = '', bigMinorApps = [], level = 'auto' } = {}) {
    if (level !== 'auto' && VERSION_LEVELS.includes(level)) return level;
    const a = String(from ?? '').trim();
    const b = String(to ?? '').trim();
    if (!a || !b) return 'unknown';
    if (a === b) return 'same';
    if (scheme === 'none' || /^sha\d+:/i.test(a) || /^sha\d+:/i.test(b)) return 'other';
    const cut = scheme === 'semver' ? SEMVER_NUMBERS : Infinity;
    const x = versionNumbers(a).slice(0, cut);
    const y = versionNumbers(b).slice(0, cut);
    if (x.length === 0 || y.length === 0) return 'other';
    const at = x.findIndex((n, i) => n !== (y[i] ?? -1));
    const index = at >= 0 ? at : x.length < y.length ? x.length : -1;
    if (index < 0) return 'same';
    const was = x[index] ?? 0;
    const now = y[index] ?? 0;
    if (now < was) return 'downgrade';
    if (scheme === 'calver') return index <= 1 ? 'minor' : 'patch';
    const big = bigAt === 'second' || (app !== '' && bigMinorApps.some((name) => name.toLowerCase() === app.toLowerCase())) ? 1 : 0;
    if (index <= big) return 'major';
    return index === 1 ? 'minor' : 'patch';
}

/**
 * The level of each jump of a list counted exactly, and the words for a heading ("2 major, 5 minor, 3 patch").
 * @param {readonly { from?: string | null, to?: string | null, app?: string, level?: VersionLevel | 'auto' }[]} list
 * @param {LevelOptions} [options]
 * @returns {{ total: number, counts: Record<VersionLevel, number>, text: string }}
 */
export function summarizeDeltas(list, options = {}) {
    const s = getStrings();
    /** @type {Record<VersionLevel, number>} */
    const counts = { same: 0, other: 0, patch: 0, minor: 0, major: 0, downgrade: 0, unknown: 0 };
    for (const item of list) counts[versionLevel(item.from, item.to, { ...options, app: item.app ?? '', level: item.level ?? 'auto' })] += 1;
    const words = { major: s.versionMajor, minor: s.versionMinor, patch: s.versionPatch, other: s.versionOther, downgrade: s.versionDowngrade };
    const parts = /** @type {(keyof typeof words)[]} */ (['major', 'minor', 'patch', 'other', 'downgrade'])
        .filter((level) => counts[level] > 0)
        .map((level) => `${counts[level]} ${words[level]}`);
    return { total: list.length, counts, text: parts.length > 0 ? parts.join(', ') : s.versionNoUpdates };
}
