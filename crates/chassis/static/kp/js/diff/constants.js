// The selector, event names and limits of the diff view.

/** The diffs this module looks after. */
export const DIFF = '[data-kp-diffview]';
/** Fired when a file is opened or closed: `{ path, open }`. */
export const DIFF_TOGGLE_EVENT = 'kp-diff-toggle';
/** Fired when a fold of unchanged lines opens or closes: `{ path, lines, open }`. */
export const DIFF_EXPAND_EVENT = 'kp-diff-expand';
/** Fired when a path was copied: `{ path }`. */
export const DIFF_COPY_EVENT = 'kp-diff-copy';
/** Fired by the Retry of a failed diff. */
export const DIFF_RETRY_EVENT = 'kp-diff-retry';
/** Unchanged lines kept on each side of a change. */
export const DIFF_CONTEXT = 3;
/** The least number of unchanged lines worth a fold: hiding one or two costs more than showing them. */
export const DIFF_FOLD_MIN = 3;
/** Lines drawn per file before the rest waits behind "Show the other N lines". */
export const DIFF_MAX_LINES = 400;
/** A line longer than this is not split into words: the split is for a line, not a minified file. */
export const DIFF_WORD_LIMIT = 500;
/** More than this share of a line changed and the whole line is the change: marking every word says nothing. */
export const DIFF_WORD_SHARE = 0.6;
/** The statuses of a file. */
export const DIFF_STATUSES = Object.freeze(['added', 'removed', 'modified', 'renamed', 'binary']);
