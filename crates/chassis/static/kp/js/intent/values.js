// The weights, limits and word shapes of the words-in-any-order match.

/** The most rows a list shows at once; the rest wait for more words (homelab's tested value). */
export const INTENT_MAX_SHOWN = 40;

/** What a typed word found in the label adds to an item's score. */
export const LABEL_WEIGHT = 4;
/** What a typed word found only in the hint or the hidden words adds. */
export const HINT_WEIGHT = 1;
/** What an exact word adds on top of a label hit. */
export const EXACT_BONUS = 1;
/** What the first typed word starting the label's first word adds on top of a label hit. */
export const FIRST_WORD_BONUS = 2;
/** What a command about the open subject adds. */
export const CONTEXT_BONUS = 3;
/** What a command run last adds when nothing is typed. */
export const RECENT_BONUS = 2;
/** The shortest typed word that may be one letter off (so "read" does not find "Report"). */
export const TYPO_MIN_LENGTH = 4;

/** A word of a text: letters, digits, dots and hyphens. */
export const WORD = /[\p{L}\p{N}.-]+/gu;
