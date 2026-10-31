// The words of the usual picker and the log viewer.

/**
 * @typedef {object} UsualLogviewerStrings
 * @property {string} usualAll  The label over the full list under the band [kpadopt6]
 * @property {(usual: number, more: number) => string} usualStatus  The status line of a picker with a band: "5 usual, 33 more" [kpadopt6]
 * @property {(n: number) => string} usualShowAll  The row that unfolds the full list: "Show all 38", the exact number [kpadopt6]
 * @property {string} usualShowFewer  The same row once the list is open [kpadopt6]
 * @property {(label: string) => string} usualAdd  The row that adds what was typed: "Add 'hoofdpjn' as new" [kpadopt6]
 * @property {(name: string) => string} usualDidYouMean  A close name offered for what was typed: "Did you mean Hoofdpijn?" [kpadopt6]
 * @property {string} usualNoMatchTitle  The plate over a search that matches nothing [kpadopt6]
 * @property {string} usualNoMatchText  Its sentence when a name can be added [kpadopt6]
 * @property {string} usualNoMatchTextFixed  Its sentence when nothing can be added [kpadopt6]
 * @property {(label: string) => string} usualSelectedExisting  What is said when typed text named an item already in the list: "Hoofdpijn was already in the list, selected" [kpadopt6]
 * @property {(label: string) => string} usualAdded  What is said after an add: "Hoofdpijn added" [kpadopt6]
 * @property {(label: string) => string} usualAddedToast  The undo toast's line after an add: "Added 'Neksteun'" [kpadopt6]
 * @property {string} usualEmptyTitle  The plate of a picker with no items at all [kpadopt6]
 * @property {string} usualEmptyText  Its sentence when a name can be added [kpadopt6]
 * @property {string} usualEmptyTextFixed  Its sentence when nobody can add here [kpadopt6]
 * @property {string} usualAddButton  Its button [kpadopt6]
 * @property {string} usualFailedTitle  The plate of a list that could not be read [kpadopt6]
 * @property {string} usualFailedText  Its sentence [kpadopt6]
 * @property {string} usualRetry  Its button [kpadopt6]
 * @property {string} usualLoading  The words under the loading card of a picker [kpadopt6]
 * @property {string} usualNotToday  The check's button that says a usual choice did not happen today [kpadopt6]
 * @property {(label: string) => string} usualNotTodayName  Kept for consumers: a not-today button's accessible name, "Hoofdpijn: not today" [kpadopt6]
 * @property {(label: string) => string} usualNotTodayAnnounce  What is said when it is set: "Hoofdpijn: not today" [kpadopt6]
 * @property {string} usualNotTodayMark  The word a screen reader hears after a chip that is not today [kpadopt6]
 * @property {string} usualJump  The `?` sheet's words for Alt U: "Jump to the usual choices" [kpadopt6]
 * @property {(label: string) => string} usualAlreadyPicked  The list's line, and what is said, when a name typed is already picked: "Headache is already picked" [kpadopt6]
 * @property {(label: string) => string} usualPicked  What is said when the check's "Had it" picks a choice: "Headache: had it" [kpadopt6]
 * @property {(typed: string, label: string) => string} usualTookClosest  What is said when Enter took the closest name: "Fatigu: took Fatigue" [kpadopt6]
 * @property {(label: string) => string} usualAsk  What is said when Enter lit the first "Did you mean" row: "Did you mean Fatigue? Enter picks it" [kpadopt6]
 * @property {(label: string) => string} usualAddedNote  The line under the field after an add: "Added 'Neksteun' as new" [kpadopt6]
 * @property {string} usualUndo  Its button [kpadopt6]
 * @property {(label: string) => string} usualUndoName  That button's accessible name: "Undo adding Neksteun" [kpadopt6]
 * @property {(label: string) => string} usualAddUndone  What is said after that Undo: "Neksteun taken out again" [kpadopt6]
 * @property {string} usualCheckTitle  The heading over the check of the usual choices [kpadopt6]
 * @property {string} usualCheckWhat  The line under it in the rows look: what Not today means [kpadopt6]
 * @property {string} usualCheckWhatChips  The line under it in the chips look: what a press does and what Not today means [kpadopt6]
 * @property {string} usualHadIt  The check's button that says the choice happened today (it picks it) [kpadopt6]
 * @property {string} usualHadItWord  The word a screen reader hears after a chip that is had it [kpadopt6]
 * @property {(label: string) => string} usualUnanswered  What is said when an answer is taken back: "Headache: not answered" [kpadopt6]
 * @property {string} usualUnansweredWord  The word a screen reader hears after a chip with no answer [kpadopt6]
 * @property {string} logviewerUnit  The pill's word for a log line, singular and plural (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerLabel  The viewer's name for a screen reader when the page gives none (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerLogLabel  The scrolling list's name for a screen reader (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerSearch  The search box's label (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerSearchHint  The search box's placeholder (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerSearchNone  The count when nothing matches (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerSearchIdle  The count while the box is empty (js/logviewer.js) [gap-log-viewer]
 * @property {(n: number) => string} logviewerMatches  The count when there are matches and none is current (js/logviewer.js) [gap-log-viewer]
 * @property {(at: number, n: number) => string} logviewerMatchAt  The count with the current match (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerPrevious  The button that goes to the match before (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerNext  The button that goes to the next match (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerOnly  The toggle that hides lines without a match (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerWrap  The toggle that wraps long lines (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerTimeLabel  The time column control's name (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerTimeShort  Its first choice, the time of day (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerTimeFull  Its second choice, date and time (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerTimeOff  Its third choice, no time column (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerLevel  The level select's label (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerLevelAll  Its first entry, every level (js/logviewer.js) [gap-log-viewer]
 * @property {(level: 'info' | 'warning' | 'error') => string} logviewerLevelFrom  Its other entries: 'info', 'warning' or 'error' and above (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerCopy  The copy button (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerCopied  The copy button's result word (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerNotCopied  The copy button's refusal word (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerDownload  The download button (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerNothing  Why copy and download are off when no line is shown (js/logviewer.js) [gap-log-viewer]
 * @property {(shown: number, total: number) => string} logviewerCount  The foot's count of lines shown (js/logviewer.js) [gap-log-viewer]
 * @property {(n: number, max: number) => string} logviewerDropped  The foot's note about lines pushed out by the cap (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerLoading  The words under the busy card while the lines are read (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerEmptyTitle  The empty plate's heading (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerEmptyText  Its sentence (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerNoMatchTitle  The plate's heading when a search or level hides every line (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerNoMatchText  Its sentence (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerClear  Its button that takes the search and the level away (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerFailed  The failed plate's heading (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerFailedText  Its sentence (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerRetry  Its button (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerKeySearch  The shortcut sheet's line for the search key (js/logviewer.js) [gap-log-viewer]
 * @property {string} logviewerKeyGroup  The sheet's heading (js/logviewer.js) [gap-log-viewer]
 */

/** @type {UsualLogviewerStrings} */
export const USUAL_LOGVIEWER_STRINGS = {
    usualAll: 'All',
    usualStatus: (usual, more) => `${usual} usual, ${more} more`,
    usualShowAll: (n) => `Show all ${n}`,
    usualShowFewer: 'Show fewer',
    usualAdd: (label) => `Add '${label}' as new`,
    usualDidYouMean: (name) => `Did you mean ${name}?`,
    usualNoMatchTitle: 'No match',
    usualNoMatchText: 'Pick a close name, or add it as new',
    usualNoMatchTextFixed: 'Nothing in the list looks like that',
    usualSelectedExisting: (label) => `${label} was already in the list, selected`,
    usualAdded: (label) => `${label} added`,
    usualAddedToast: (label) => `Added '${label}'`,
    usualEmptyTitle: 'Nothing here yet',
    usualEmptyText: 'Type a name to add the first one',
    usualEmptyTextFixed: 'Whoever keeps this list adds the first one',
    usualAddButton: 'Add',
    usualFailedTitle: 'Could not read the list',
    usualFailedText: 'The list could not be reached just now.',
    usualRetry: 'Retry',
    usualLoading: 'Reading the list',
    usualNotToday: 'Not today',
    usualNotTodayName: (label) => `${label}: not today`,
    usualNotTodayAnnounce: (label) => `${label}: not today`,
    usualNotTodayMark: 'not today',
    usualJump: 'Jump to the usual choices',
    usualAlreadyPicked: (label) => `${label} is already picked`,
    usualPicked: (label) => `${label}: had it`,
    usualTookClosest: (typed, label) => `${typed}: took ${label}`,
    usualAsk: (label) => `Did you mean ${label}? Enter picks it`,
    usualAddedNote: (label) => `Added '${label}' as new`,
    usualUndo: 'Undo',
    usualUndoName: (label) => `Undo adding ${label}`,
    usualAddUndone: (label) => `${label} taken out again`,
    usualCheckTitle: 'Your usual today',
    usualCheckWhat: 'Not today says it did not happen today. A row left blank is not answered yet.',
    usualCheckWhatChips: 'Tap once: had it. Twice: not today, it did not happen. Three times: not answered.',
    usualHadIt: 'Had it',
    usualHadItWord: 'had it',
    usualUnanswered: (label) => `${label}: not answered`,
    usualUnansweredWord: 'not answered',
    // Log viewer (js/logviewer.js) [gap-log-viewer].
    logviewerUnit: 'line,lines',
    logviewerLabel: 'Log',
    logviewerLogLabel: 'Log lines',
    logviewerSearch: 'Find in the log',
    logviewerSearchHint: 'Find in the log',
    logviewerSearchNone: 'No matches',
    logviewerSearchIdle: 'Type to find',
    logviewerMatches: (n) => `${n} ${n === 1 ? 'match' : 'matches'}`,
    logviewerMatchAt: (at, n) => `${at} of ${n}`,
    logviewerPrevious: 'Previous match',
    logviewerNext: 'Next match',
    logviewerOnly: 'Only matching lines',
    logviewerWrap: 'Wrap lines',
    logviewerTimeLabel: 'Time column',
    logviewerTimeShort: 'Time',
    logviewerTimeFull: 'Date and time',
    logviewerTimeOff: 'Off',
    logviewerLevel: 'Level',
    logviewerLevelAll: 'All levels',
    logviewerLevelFrom: (level) => (level === 'info' ? 'Info and above' : level === 'warning' ? 'Warning and above' : 'Error and above'),
    logviewerCopy: 'Copy',
    logviewerCopied: 'Copied',
    logviewerNotCopied: 'Not copied',
    logviewerDownload: 'Download',
    logviewerNothing: 'There are no lines shown to copy.',
    logviewerCount: (shown, total) => (shown === total ? `${total} ${total === 1 ? 'line' : 'lines'}` : `${shown} of ${total} lines shown`),
    logviewerDropped: (n, max) => `${n} earlier ${n === 1 ? 'line' : 'lines'} dropped, the newest ${max} are kept`,
    logviewerLoading: 'Reading the log…',
    logviewerEmptyTitle: 'No log lines yet',
    logviewerEmptyText: 'New lines show up here as they arrive.',
    logviewerNoMatchTitle: 'No line matches',
    logviewerNoMatchText: 'The search or the level hides every line in the log.',
    logviewerClear: 'Clear search and level',
    logviewerFailed: 'Could not read the log',
    logviewerFailedText: 'The lines already read are kept and show again when the log answers.',
    logviewerRetry: 'Retry',
    logviewerKeySearch: 'Go to the log search',
    logviewerKeyGroup: 'Log viewer',
};
