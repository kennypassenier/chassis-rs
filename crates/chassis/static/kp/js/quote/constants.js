// The selectors, events, states, fixed numbers, watched attributes and types of the quote card.

/** A quote card. */
export const QUOTE = '[data-kp-quote]';
/** A list of quote cards. */
export const QUOTE_LIST = '[data-kp-quote-list]';
/** Fired on the card when a hide is committed (the Undo window passed): `{ text, wait }`. */
export const QUOTE_HIDE_EVENT = 'kp-quote-hide';
/** Fired on the card when Retry is pressed on a failed card. */
export const QUOTE_RETRY_EVENT = 'kp-quote-retry';
/** Fired on the card when a long quote is opened or folded: `{ expanded }`. */
export const QUOTE_FOLD_EVENT = 'kp-quote-fold';
/** The states a quote card can be in. */
export const QUOTE_STATES = /** @type {const} */ (['ready', 'loading', 'empty', 'error']);
/** How many lines a quote shows before it folds. */
export const QUOTE_LINES = 4;
/** How many quotes a list shows before "Show all". */
export const QUOTE_LIST_MAX = 3;

/** The most quotes a list may be told to show before "Show all". */
export const LIST_MAX_CAP = 5;
/** The Undo window after Hide when the card says nothing [ms]. */
export const DEFAULT_UNDO_MS = 6000;
/** How long "Copied" (or the failure) stays on the Copy button [ms]. */
export const COPY_RESET_MS = 1500;
/** The pause before a live line is written, so a screen reader hears the change [ms]. */
export const ANNOUNCE_DELAY_MS = 30;
/** Milliseconds in a day. */
export const DAY_MS = 86_400_000;
/** A folded quote counts as overflowing when the whole is taller than the folded by more than this [px]. */
export const FOLD_SLACK_PX = 1;

/** The attributes a card reads again when they change. */
export const WATCHED_ATTRIBUTES = [
    'data-kp-quote-by',
    'data-kp-quote-date',
    'data-kp-quote-date-style',
    'data-kp-quote-now',
    'data-kp-quote-lines',
    'data-kp-quote-why',
    'data-kp-quote-source',
    'data-kp-quote-hide',
    'data-kp-quote-copy',
    'data-kp-quote-size',
    'data-kp-quote-lang',
];

/**
 * @typedef {object} QuoteOptions
 * @property {number} [lines] how many lines before it folds (default 4)
 * @property {boolean} [copy] show Copy (default false)
 */

/**
 * @typedef {object} QuoteSpec
 * @property {string} text the words, verbatim
 * @property {string} [by] @property {string} [date] ISO moment @property {'date' | 'relative' | 'both'} [dateStyle]
 * @property {string} [why] @property {string} [source] @property {string} [lang]
 * @property {number | 'all'} [lines] @property {boolean} [hide] @property {boolean} [copy] @property {'md' | 'lg'} [size]
 */

/**
 * @typedef {object} QuoteHandle
 * @property {HTMLElement} element
 * @property {() => string} text the words as written
 * @property {(spec: QuoteSpec) => void} set
 * @property {(state: 'ready' | 'loading' | 'empty' | 'error') => void} setState
 * @property {() => void} hide hide it as a press on Hide does
 */
