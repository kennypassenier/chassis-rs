// The words of the diff and of ratings.

/**
 * @typedef {object} DiffRatingStrings
 * @property {string} diffLabel  The diff view's accessible name when it has none (js/diff.js) [gap-diff-view]
 * @property {(files: number) => string} diffSummary  The bar's count of files: "3 files changed" (js/diff.js) [gap-diff-view]
 * @property {string} diffExpandAll  The button that opens every file (js/diff.js) [gap-diff-view]
 * @property {string} diffCollapseAll  The button that closes every file (js/diff.js) [gap-diff-view]
 * @property {string} diffAllOpen  Why Expand all is off: every file is already open (js/diff.js) [gap-diff-view]
 * @property {string} diffAllClosed  Why Collapse all is off: every file is already closed (js/diff.js) [gap-diff-view]
 * @property {string} diffStatusAdded  The badge of a new file (js/diff.js) [gap-diff-view]
 * @property {string} diffStatusRemoved  The badge of a deleted file (js/diff.js) [gap-diff-view]
 * @property {string} diffStatusModified  The badge of a changed file (js/diff.js) [gap-diff-view]
 * @property {string} diffStatusRenamed  The badge of a moved file (js/diff.js) [gap-diff-view]
 * @property {string} diffStatusBinary  The badge of a file that is not text (js/diff.js) [gap-diff-view]
 * @property {(from: string) => string} diffRenamedFrom  A renamed file's path for a screen reader: "renamed from old/path" (js/diff.js) [gap-diff-view]
 * @property {(n: number) => string} diffAddedCount  The +N count for a screen reader: "3 lines added" (js/diff.js) [gap-diff-view]
 * @property {(n: number) => string} diffRemovedCount  The -M count for a screen reader: "1 line removed" (js/diff.js) [gap-diff-view]
 * @property {(n: number) => string} diffUnchanged  The folded context row: "12 unchanged lines" (js/diff.js) [gap-diff-view]
 * @property {(n: number) => string} diffUnchangedName  That row's accessible name: "Show 12 unchanged lines" (js/diff.js) [gap-diff-view]
 * @property {(n: number) => string} diffUnchangedHide  The same row once opened: "Hide 12 unchanged lines" (js/diff.js) [gap-diff-view]
 * @property {(n: number) => string} diffUnchangedShown  Said politely after a fold opened: "12 unchanged lines shown" (js/diff.js) [gap-diff-view]
 * @property {(n: number) => string} diffUnchangedHidden  Said politely after a fold closed: "12 unchanged lines hidden" (js/diff.js) [gap-diff-view]
 * @property {(n: number) => string} diffShowMore  The row that shows the lines past the file's limit: "Show the other 1240 lines" (js/diff.js) [gap-diff-view]
 * @property {string} diffBinaryTitle  The heading of a file that is not text (js/diff.js) [gap-diff-view]
 * @property {string} diffBinaryText  Its sentence (js/diff.js) [gap-diff-view]
 * @property {string} diffNoLines  A file with no line changes (a rename or a mode change) (js/diff.js) [gap-diff-view]
 * @property {(path: string) => string} diffChangesIn  A file's body name: "Changes in stacks/media/compose.yml" (js/diff.js) [gap-diff-view]
 * @property {string} diffCopyPath  The Copy path button (js/diff.js) [gap-diff-view]
 * @property {string} diffCopied  Its result word (js/diff.js) [gap-diff-view]
 * @property {string} diffCopyFailed  Its refusal word (js/diff.js) [gap-diff-view]
 * @property {string} diffLoading  The words under the busy card while the changes are read (js/diff.js) [gap-diff-view]
 * @property {(files: number, added: number, removed: number) => string} diffReady  Said politely when the changes are drawn (js/diff.js) [gap-diff-view]
 * @property {string} diffEmptyTitle  The empty plate's heading (js/diff.js) [gap-diff-view]
 * @property {string} diffEmptyText  Its sentence (js/diff.js) [gap-diff-view]
 * @property {(name: string) => string} diffEmptySame  Its sentence when one name was compared: "compose.yml is the same on both sides." (js/diff.js) [gap-diff-view]
 * @property {(from: string, to: string) => string} diffEmptyBetween  Its sentence when two names were compared (js/diff.js) [gap-diff-view]
 * @property {string} diffFailedTitle  The failed plate's heading (js/diff.js) [gap-diff-view]
 * @property {string} diffFailedText  Its sentence (js/diff.js) [gap-diff-view]
 * @property {string} diffRetry  The failed plate's button (js/diff.js) [gap-diff-view]
 * @property {(item: string) => string} ratingGroupName  The star row's name for a screen reader: "Rating for Lasagne" (js/rating.js) [kpadopt6]
 * @property {string} ratingGroupNameBare  The same when the row names no item [kpadopt6]
 * @property {(n: number, max: number) => string} ratingStarName  One star's name: "4 of 5" [kpadopt6]
 * @property {(n: number, max: number, label: string) => string} ratingStarNameLabel  The same with its word: "4 of 5, Good" [kpadopt6]
 * @property {(value: number, max: number) => string} ratingRated  A display row's name: "Rated 4 of 5" [kpadopt6]
 * @property {(value: number, max: number, count: number) => string} ratingRatedCount  The same with how many people rated: "Rated 4.5 of 5 by 12 people" [kpadopt6]
 * @property {string} ratingUnrated  The line, and the name, of a row nobody has rated: "Not rated yet" [kpadopt6]
 * @property {string} ratingTap  The caption of an input row with no rating: "Tap a star" [kpadopt6]
 * @property {string} ratingClear  The small button that removes the rating [kpadopt6]
 * @property {(item: string) => string} ratingClearName  That button's accessible name: "Clear the rating for Lasagne" [kpadopt6]
 * @property {(value: number, max: number) => string} ratingOutOf  The caption of a rated row without words per level: "4 of 5" [kpadopt6]
 * @property {(value: number, count: number) => string} ratingAverage  An aggregated score: "4.5 (12)" [kpadopt6]
 * @property {(item: string, value: number, max: number) => string} ratingAnnounce  What is said when the rating changes: "Lasagne: 4 of 5" [kpadopt6]
 * @property {(item: string) => string} ratingAnnounceCleared  What is said when the rating is removed: "Lasagne: rating removed" [kpadopt6]
 * @property {(item: string, value: number) => string} ratingToast  The undo toast's line: "Lasagne: 4 stars" [kpadopt6]
 * @property {(item: string) => string} ratingToastCleared  The undo toast's line after Clear [kpadopt6]
 * @property {string} ratingLoading  The row's name while the saved value is read [kpadopt6]
 * @property {string} ratingFailedRead  The words that replace the stars when the value could not be read [kpadopt6]
 * @property {string} ratingRetry  Its button [kpadopt6]
 * @property {(item: string) => string} ratingSaveFailed  The line under the row when a save was refused: "Could not save the rating for Lasagne" [kpadopt6]
 * @property {string} ratingSaving  The row's description while a save is on its way [kpadopt6]
 * @property {string} ratingConfirm  The button that saves a pending rating (commit confirm) [kpadopt6]
 * @property {string} ratingCancel  The button that drops a pending rating [kpadopt6]
 * @property {(value: number, max: number) => string} ratingPending  The line over those two buttons: "4 of 5, not saved yet" [kpadopt6]
 * @property {string} ratingReadonly  What a screen reader hears on a row that cannot be changed by this person [kpadopt6]
 */

/** @type {DiffRatingStrings} */
export const DIFF_RATING_STRINGS = {
    // The diff view (js/diff.js) [gap-diff-view].
    diffLabel: 'Changes',
    diffSummary: (files) => `${files} ${files === 1 ? 'file' : 'files'} changed`,
    diffExpandAll: 'Expand all',
    diffCollapseAll: 'Collapse all',
    diffAllOpen: 'Every file is already open.',
    diffAllClosed: 'Every file is already closed.',
    diffStatusAdded: 'Added',
    diffStatusRemoved: 'Removed',
    diffStatusModified: 'Modified',
    diffStatusRenamed: 'Renamed',
    diffStatusBinary: 'Binary',
    diffRenamedFrom: (from) => `renamed from ${from}`,
    diffAddedCount: (n) => `${n} ${n === 1 ? 'line' : 'lines'} added`,
    diffRemovedCount: (n) => `${n} ${n === 1 ? 'line' : 'lines'} removed`,
    diffUnchanged: (n) => `${n} unchanged ${n === 1 ? 'line' : 'lines'}`,
    diffUnchangedName: (n) => `Show ${n} unchanged ${n === 1 ? 'line' : 'lines'}`,
    diffUnchangedHide: (n) => `Hide ${n} unchanged ${n === 1 ? 'line' : 'lines'}`,
    diffUnchangedShown: (n) => `${n} unchanged ${n === 1 ? 'line' : 'lines'} shown`,
    diffUnchangedHidden: (n) => `${n} unchanged ${n === 1 ? 'line' : 'lines'} hidden`,
    diffShowMore: (n) => `Show the other ${n} ${n === 1 ? 'line' : 'lines'}`,
    diffBinaryTitle: 'Binary file, not shown',
    diffBinaryText: 'Its contents cannot be shown as text.',
    diffNoLines: 'No line changes in this file.',
    diffChangesIn: (path) => `Changes in ${path}`,
    diffCopyPath: 'Copy path',
    diffCopied: 'Copied',
    diffCopyFailed: 'Not copied',
    diffLoading: 'Reading the changes…',
    diffReady: (files, added, removed) => `${files} ${files === 1 ? 'file' : 'files'} changed, ${added} added, ${removed} removed`,
    diffEmptyTitle: 'No changes',
    diffEmptyText: 'Both sides are the same.',
    diffEmptySame: (name) => `${name} is the same on both sides.`,
    diffEmptyBetween: (from, to) => `${from} and ${to} are the same.`,
    diffFailedTitle: 'Could not read the changes',
    diffFailedText: 'The comparison did not finish. Nothing was changed.',
    diffRetry: 'Try again',
    // The star rating (js/rating.js) [kpadopt6].
    ratingGroupName: (item) => `Rating for ${item}`,
    ratingGroupNameBare: 'Rating',
    ratingStarName: (n, max) => `${n} of ${max}`,
    ratingStarNameLabel: (n, max, label) => `${n} of ${max}, ${label}`,
    ratingRated: (value, max) => `Rated ${value} of ${max}`,
    ratingRatedCount: (value, max, count) => `Rated ${value} of ${max} by ${count} ${count === 1 ? 'person' : 'people'}`,
    ratingUnrated: 'Not rated yet',
    ratingTap: 'Tap a star',
    ratingClear: 'Clear',
    ratingClearName: (item) => `Clear the rating for ${item}`,
    ratingOutOf: (value, max) => `${value} of ${max}`,
    ratingAverage: (value, count) => `${value} (${count})`,
    ratingAnnounce: (item, value, max) => `${item}: ${value} of ${max}`,
    ratingAnnounceCleared: (item) => `${item}: rating removed`,
    ratingToast: (item, value) => `${item}: ${value} ${value === 1 ? 'star' : 'stars'}`,
    ratingToastCleared: (item) => `${item}: rating removed`,
    ratingLoading: 'Reading the rating',
    ratingFailedRead: 'Could not read the rating',
    ratingRetry: 'Retry',
    ratingSaveFailed: (item) => `Could not save the rating for ${item}`,
    ratingSaving: 'Saving the rating',
    ratingConfirm: 'Save rating',
    ratingCancel: 'Cancel',
    ratingPending: (value, max) => `${value} of ${max}, not saved yet`,
    ratingReadonly: 'You can look at this rating but not change it',
};
