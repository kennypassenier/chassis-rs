// A diff of several files: a header per file, folded context, the changed words [gap-diff-view; homelab's editui.js diffBlocks].
//
//   <div class="kp-diffview" data-kp-diffview aria-label="Changes to the media stack"></div>
//
//   setDiff(el, { files: [{ path: 'stacks/media/compose.yml', status: 'modified', hunks: [{ oldStart: 12, oldLen: 6, newStart: 12, newLen: 6, context: 'services:', lines: [{ kind: 'same', no: 12, text: '…' }, …] }] }] });
//   setDiff(el, { state: 'loading' });                    // the changes are being read
//   setDiff(el, { state: 'error', message: 'Loki did not answer' });
//
// The app brings the hunks (a git style diff, or its own); this module draws them and keeps no algorithm of its own beyond
// the split of two paired lines into words. It writes the markup `.kp-diff` already styles (`.kp-diff__line`, `__hunk`,
// `__hunk-context`), so every register that dresses the lines dresses this as well, and adds what was missing:
//
//   · a header per file: a chevron, a status word on a badge, the path (the folder quiet, the file name strong; a renamed
//     file shows `old → new`), exact `+N` and `-M` counts with five little blocks for their share, and Copy path. The
//     columns are as wide as the longest of the page, so the headers of several files line up.
//   · unchanged lines folded: a run of unchanged lines longer than the context on both sides of a change becomes one row,
//     "12 unchanged lines", that is a button; it opens in place and closes again. A file added or removed whole is not folded.
//   · the changed words: for a removed line paired with the added line that replaced it, the words that differ are marked
//     (`<mark class="kp-diff__word">`). The weight is the carrier as well as the tint (bold, struck through on the removed
//     side and underlined on the added side), so it survives without colour [DI4]. `jellyfin:10.11.11` becoming
//     `jellyfin:12.1.0` marks the version, not the line.
//   · loading, empty and failed states in the package's busy card and state plates, at the height the diff had.
//
// Options (attributes, each also live: change the attribute and the diff is drawn again):
//   data-kp-diff-open       `all` (default), `first`, `none` or `changed` (files with line changes); a file the reader opened
//                           or closed keeps its choice when the data is given again
//   data-kp-diff-context    unchanged lines kept on each side of a change (3); `0` or `off` folds nothing
//   data-kp-diff-words      `on` (default) or `off`
//   data-kp-diff-bar        `on` (default) or `off`: the five blocks in a header
//   data-kp-diff-copy       `on` (default) or `off`: Copy path
//   data-kp-diff-max-lines  lines drawn per file before "Show the other N lines" (400); `0` or `off` draws all
//   data-kp-diff-label      the region's accessible name
//   data-kp-diff-state      the state before `setDiff` has given any data: `loading` (draw the page with it, so the first frame is
//                           already the waiting one), `empty` or `error`; absent: nothing changed, until the data comes
//
// Events (bubbling, on the root): `kp-diff-toggle` `{ path, open }`, `kp-diff-expand` `{ path, lines, open }` (a fold),
// `kp-diff-copy` `{ path }`, `kp-diff-retry`. Every word is in js/strings.js; nothing runs on import.

export {
    DIFF,
    DIFF_TOGGLE_EVENT,
    DIFF_EXPAND_EVENT,
    DIFF_COPY_EVENT,
    DIFF_RETRY_EVENT,
    DIFF_CONTEXT,
    DIFF_FOLD_MIN,
    DIFF_MAX_LINES,
    DIFF_WORD_LIMIT,
    DIFF_WORD_SHARE,
    DIFF_STATUSES,
} from './diff/constants.js';
export { diffWords } from './diff/words.js';
export { foldContext } from './diff/fold.js';
export { setDiff } from './diff/actions.js';
export { attachDiffs } from './diff/attach.js';

/** @typedef {import('./diff/types.js').DiffLine} DiffLine */
/** @typedef {import('./diff/types.js').DiffHunk} DiffHunk */
/** @typedef {import('./diff/types.js').DiffFile} DiffFile */
/** @typedef {import('./diff/types.js').DiffSpec} DiffSpec */
/** @typedef {import('./diff/types.js').Segment} Segment */
/** @typedef {import('./diff/types.js').NormFile} NormFile */
/** @typedef {import('./diff/types.js').DiffState} DiffState */
/** @typedef {import('./diff/types.js').Part} Part */
