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

// The module is a pure library with no element to look after, so it is a facade over files split by responsibility
// [closure-pattern B, Kenny 2026-10-30]: js/intent/tokens.js (the words), match.js (the prefix and one-letter-off tests), score.js
// (score and marked ranges), rank.js (the ranked list and the no-match text) and values.js (the weights), listed in js/README.md.

export { INTENT_MAX_SHOWN } from './intent/values.js';
export { intentTokens, intentWords, queryWords } from './intent/tokens.js';
export { startsWord, matchIntent } from './intent/match.js';
export { intentScore, intentRanges } from './intent/score.js';
export { rankCommands, noMatchText } from './intent/rank.js';

/** @typedef {{ foldDiacritics?: boolean, splitHyphen?: boolean, typo?: 0 | 1 | boolean }} IntentOptions */

/**
 * @typedef {object} IntentItem
 * @property {string} label the words that are shown
 * @property {string} [hint] more words that are shown (a description); they weigh 1
 * @property {string} [words] words that are never shown (synonyms); they weigh 1
 */

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
