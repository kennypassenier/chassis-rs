// The words of the question card, the transfer list, markdown, jobs, the connection banner, refresh and the panes.

/**
 * @typedef {object} QuestionTransferConnStrings
 * @property {string} questionAllow  The default first answer (js/question-card.js) [kpadopt5-question-card]
 * @property {string} questionStop  The default second answer [kpadopt5-question-card]
 * @property {string} questionsLabel  The accessible name of the region that holds the open questions [kpadopt5-question-card]
 * @property {(duration: string) => string} questionLeft  How long a question still waits, "Waits 1 min 12 s more" [kpadopt5-question-card]
 * @property {string} questionTimeUp  The time line when the time ran out [kpadopt5-question-card]
 * @property {(label: string) => string} questionDefault  What happens at zero, "If nobody answers: Stop." [kpadopt5-question-card]
 * @property {(duration: string) => string} questionUrgent  Announced once when the time gets short [kpadopt5-question-card]
 * @property {string} questionNobody  The outcome of a question nobody answered, when there is no default answer [kpadopt5-question-card]
 * @property {(label: string) => string} questionNobodyDefault  The outcome when the default answer applied [kpadopt5-question-card]
 * @property {(label: string) => string} questionAnswered  The outcome of an answer that has no sentence of its own [kpadopt5-question-card]
 * @property {(why: string) => string} questionRefused  The note when the app could not send the answer, "Not sent: why. Nothing changed; answer again." [kpadopt5-question-card]
 * @property {string} questionDismiss  The button that takes a finished card away [kpadopt5-question-card]
 * @property {(count: number) => string} questionWaiting  The tab title's prefix while questions wait, "(1) waiting" [kpadopt5-question-card]
 * @property {(count: number) => string} questionBatch  The batch bar's button, "Answer 3 with their default" (js/question-card/batch.js) [homelab gap 22]
 * @property {(count: number) => string} questionBatchNote  The batch bar's line, "3 questions wait and each has a default answer." [homelab gap 22]
 * @property {(count: number) => string} questionBatchConfirm  The line while the bar asks to confirm, "Answer 3 questions with their default now?" [homelab gap 22]
 * @property {string} questionBatchYes  The button that confirms the batch [homelab gap 22]
 * @property {string} questionBatchCancel  The button that leaves the batch unanswered [homelab gap 22]
 * @property {string} transferBar  The accessible name of a transfer's bar when it has no file name (js/transfer.js) [kpadopt5-transfer]
 * @property {(done: string, total: string) => string} transferOf  The reading of a transfer with a known size, "1.2 GB of 4.1 GB" [kpadopt5-transfer]
 * @property {(done: string) => string} transferSoFar  The reading of a transfer of unknown size, "1.2 GB so far" [kpadopt5-transfer]
 * @property {string} transferSizeUnknown  The time column of a transfer whose total size is not known, beside "1.2 GB so far" [kpadopt5-r3]
 * @property {string} transferEstimating  The time left while the speed is not steady yet [kpadopt5-transfer]
 * @property {(duration: string) => string} transferLeft  The time left, "about 3 min left" [kpadopt5-transfer]
 * @property {(duration: string) => string} transferStalled  A transfer that moved no byte for a while, "stalled for 12 s" [kpadopt5-transfer]
 * @property {(rate: string) => string} transferAverage  A finished transfer's average speed, "avg 21 MB/s" [kpadopt5-transfer]
 * @property {(duration: string) => string} transferTook  A finished transfer's duration, "in 3 min 12 s" [kpadopt5-transfer]
 * @property {string} transferFailed  The first words of a failed transfer's note [kpadopt5-transfer]
 * @property {string} transferRetry  The Retry button of a failed transfer [kpadopt5-transfer]
 * @property {(name: string, percent: number) => string} transferAnnounce  What a screen reader hears at 25, 50, 75 and 100 % [kpadopt5-transfer]
 * @property {string} markdownNewTab  Said after a link in rendered notes that opens in a new tab (js/markdown.js) [wish-1120]
 * @property {string} markdownCut  The line after release notes that were cut for length [wish-1120]
 * @property {(step: number, steps: number) => string} jobLineStep  A job line's step position, "Step 3 of 35" (js/job-line.js) [wish-1120]
 * @property {(done: string, total: string) => string} jobLineBytes  A job line's bytes with the unit said once, done "1.2" and total "4 GB" make "1.2 of 4 GB" [wish-1120]
 * @property {string} jobLineSeparator  What joins the parts of a job line [wish-1120]
 * @property {string} jobLineIdle  A job line before anything was reported [wish-1120]
 * @property {string} connOffline  The banner's first line when the connection is gone (js/connection.js) [kpadopt5-connection]
 * @property {string} connOfflineWhy  What is true meanwhile and what happens next [kpadopt5-connection]
 * @property {string} connReconnecting  The first line while a try is under way [kpadopt5-connection]
 * @property {string} connReconnectingWhy  Its second line on the first try [kpadopt5-connection]
 * @property {(n: number) => string} connAttempt  Its second line from the second try, "Attempt 2" [kpadopt5-connection]
 * @property {(duration: string) => string} connNextTry  The time to the next automatic try, "next try in 8 s" [kpadopt5-connection]
 * @property {(n: number) => string} connPending  The exact count of changes waiting, "3 changes waiting" [kpadopt5-connection]
 * @property {string} connBack  The first line when the connection is back [kpadopt5-connection]
 * @property {string} connBackWhy  Its second line with nothing waiting [kpadopt5-connection]
 * @property {(n: number) => string} connBackSending  Its second line with changes waiting, "Sending 3 changes" [kpadopt5-connection]
 * @property {string} connRefused  The first line when the server refuses while the browser is online [kpadopt5-connection]
 * @property {string} connRefusedWhy  Its second line when the app gives none [kpadopt5-connection]
 * @property {string} connRetry  The Retry now button [kpadopt5-connection]
 * @property {(duration: string) => string} refreshEvery  A refresh choice, "Every 30 s" (js/auto-refresh.js) [kpadopt5-auto-refresh]
 * @property {string} refreshPaused  The choice that stops the refreshing [kpadopt5-auto-refresh]
 * @property {string} refreshOther  The entry that lets a person type any number of seconds [kpadopt5-auto-refresh]
 * @property {string} refreshLabel  The accessible name of the refresh chooser [kpadopt5-auto-refresh]
 * @property {string} refreshNow  The button that refreshes at once [kpadopt5-auto-refresh]
 * @property {string} refreshUpdating  The freshness line's words while the app reads [kpadopt5-auto-refresh]
 * @property {(next: string) => string} refreshFailed  The note after a failed refresh, "Last refresh failed, retrying in 30 s" [kpadopt5-auto-refresh]
 * @property {string} refreshFailedPaused  The note after a failed refresh while paused, when nothing retries by itself, "Last refresh failed." [live-options-1019]
 * @property {string} refreshRetryNow  The button that retries a failed refresh at once [kpadopt5-auto-refresh]
 * @property {string} refreshCustomLabel  The label of the field for any number of seconds [kpadopt5-auto-refresh]
 * @property {string} refreshApply  The button that sets that number [kpadopt5-auto-refresh]
 * @property {string} refreshInvalid  What a number that is not a whole number of seconds says [kpadopt5-auto-refresh]
 * @property {string} paneEmpty  The detail pane's plate while nothing is picked (js/master-detail.js) [kpadopt5-master-detail]
 * @property {string} paneBack  The Back button at the top of a folded detail pane [kpadopt5-master-detail]
 * @property {string} paneLoading  What the busy card over the detail pane says [kpadopt5-master-detail]
 * @property {string} paneErrorTitle  The errored detail's first line, when the page gives none [kpadopt5-master-detail]
 * @property {string} paneErrorText  Its sentence, when the page gives none [kpadopt5-master-detail]
 * @property {string} paneRetry  The Retry button of an errored detail [kpadopt5-master-detail]
 * @property {string} busy
 * @property {string} close
 * @property {string} menu          The accessible name of a collapsed navigation's toggle
 * @property {string} closeMenu     The same toggle once the navigation is open
 * @property {string} navDisclosure  The accessible name of a mega-menu button in the bar that holds no words of its own [scope-48]
 * @property {string} sidebar       The accessible name of a hidden side navigation's toggle
 * @property {string} closeSidebar  The same toggle once that side navigation is open
 * @property {string} collapseRail  The accessible name of an empty slim-rail toggle while the rail is expanded
 * @property {string} expandRail    The same toggle while the rail is collapsed to its icons
 * @property {string} resizeSidebar The name of the resize handle on a resizable side navigation
 * @property {string} backToTop    The control that returns the reader to the top of the page
 * @property {string} previous
 * @property {string} next
 * @property {string} finish
 * @property {string} back
 * @property {(name: string) => string} removeNamed
 * @property {string} noResults
 * @property {string} oneResult
 * @property {(n: number) => string} manyResults
 * @property {string} noCommands
 * @property {string} oneCommand
 * @property {(n: number) => string} manyCommands
 * @property {string} commandPlaceholder
 * @property {string} commandsLabel
 * @property {string} shortcutsLabel
 * @property {string} paletteTrigger  The visible word on the command palette's trigger in the bar [scope-48]
 * @property {(key: string, mac: boolean) => string} paletteHotkey  The hotkey as that trigger prints it: ⌘K on a Mac, Ctrl K elsewhere [scope-48]
 */

/** @type {QuestionTransferConnStrings} */
export const QUESTION_TRANSFER_CONN_STRINGS = {
    // kpadopt5-ops:notices:end
    // kpadopt5-ops:question-card:start
    // The question card (js/question-card.js) [kpadopt5-ops].
    questionAllow: 'Allow',
    questionStop: 'Stop',
    questionsLabel: 'Questions waiting for an answer',
    questionLeft: (duration) => `Waits ${duration} more`,
    questionTimeUp: 'Time is up',
    questionDefault: (label) => `If nobody answers: ${label}.`,
    questionUrgent: (duration) => `${duration} left to answer`,
    questionNobody: 'Nobody answered.',
    questionNobodyDefault: (label) => `Nobody answered, so the answer is ${label}.`,
    questionAnswered: (label) => `${label}.`,
    questionRefused: (why) => `Not sent: ${why}. Nothing changed; answer again.`,
    questionDismiss: 'Dismiss',
    questionWaiting: (count) => `(${count}) waiting`,
    questionBatch: (count) => `Answer ${count} with their default`,
    questionBatchNote: (count) => `${count} ${count === 1 ? 'question waits and has' : 'questions wait and each has'} a default answer.`,
    questionBatchConfirm: (count) => `Answer ${count} ${count === 1 ? 'question' : 'questions'} with their default now?`,
    questionBatchYes: 'Answer all',
    questionBatchCancel: 'Cancel',
    // kpadopt5-ops:question-card:end
    // kpadopt5-ops:transfer:start
    // A transfer with its speed and the time left (js/transfer.js) [kpadopt5-ops].
    transferBar: 'Transfer',
    transferOf: (done, total) => `${done} of ${total}`,
    transferSoFar: (done) => `${done} so far`,
    transferSizeUnknown: 'size unknown',
    transferEstimating: 'estimating…',
    transferLeft: (duration) => `about ${duration} left`,
    transferStalled: (duration) => `stalled for ${duration}`,
    transferAverage: (rate) => `avg ${rate}`,
    transferTook: (duration) => `in ${duration}`,
    transferFailed: 'The transfer failed',
    transferRetry: 'Retry',
    transferAnnounce: (name, percent) => `${name}: ${percent} %`,
    markdownNewTab: 'opens in a new tab',
    markdownCut: 'The notes are longer than this; the rest is at their source.',
    jobLineStep: (step, steps) => `Step ${step} of ${steps}`,
    jobLineBytes: (done, total) => `${done} of ${total}`,
    jobLineSeparator: ' · ',
    jobLineIdle: 'Waiting to start',
    // kpadopt5-ops:transfer:end
    // kpadopt5-ops:connection:start
    // The connection banner (js/connection.js) [kpadopt5-ops].
    connOffline: 'You are offline',
    connOfflineWhy: 'Changes are kept here and sent when the connection is back.',
    connReconnecting: 'Reconnecting…',
    connReconnectingWhy: 'Trying to reach the server now.',
    connAttempt: (n) => `Attempt ${n}`,
    connNextTry: (duration) => `next try in ${duration}`,
    connPending: (n) => `${n} ${n === 1 ? 'change' : 'changes'} waiting`,
    connBack: 'Connected again',
    connBackWhy: 'Everything is up to date.',
    connBackSending: (n) => `Sending ${n} ${n === 1 ? 'change' : 'changes'}.`,
    connRefused: 'The server did not accept this',
    connRefusedWhy: 'You are online, but the server refused the request. Nothing was lost; try again in a moment.',
    connRetry: 'Retry now',
    // kpadopt5-ops:connection:end
    // kpadopt5-ops:auto-refresh:start
    // The automatic refresh chooser (js/auto-refresh.js) [kpadopt5-ops].
    refreshEvery: (duration) => `Every ${duration}`,
    refreshPaused: 'Paused',
    refreshOther: 'Other…',
    refreshLabel: 'Refresh automatically',
    refreshNow: 'Refresh now',
    refreshUpdating: 'updating…',
    refreshFailed: (next) => `Last refresh failed, retrying in ${next}.`,
    refreshFailedPaused: 'Last refresh failed.',
    refreshRetryNow: 'Retry now',
    refreshCustomLabel: 'Seconds between refreshes',
    refreshApply: 'Apply',
    refreshInvalid: 'Type a whole number of seconds, 1 or more.',
    // kpadopt5-ops:auto-refresh:end
    // kpadopt5-ops:master-detail:start
    // A list and its detail (js/master-detail.js) [kpadopt5-ops].
    paneEmpty: 'Pick an item on the left',
    paneBack: 'Back to the list',
    paneLoading: 'Loading…',
    paneErrorTitle: 'This item could not be loaded',
    paneErrorText: 'Nothing was changed. Try again in a moment.',
    paneRetry: 'Retry',
    // kpadopt5-ops:master-detail:end
    busy: 'Working…',
    close: 'Close',
    // The nav toggle carries no glyph of its own — this package ships
    // type, not icons — so its accessible name is the whole of what a
    // screen reader gets, and the two words have to say which way the
    // press goes rather than what the control is.
    menu: 'Open the navigation',
    closeMenu: 'Close the navigation',
    // A mega menu's button whose content is only a glyph [scope-48]: its
    // `aria-expanded` already says open or closed, so the name says what
    // the panel holds rather than which way the press goes.
    navDisclosure: 'More places',
    // Distinct from the two above on purpose: a page can carry both, and
    // "Open the navigation" twice would leave a screen reader with two
    // controls whose names do not tell them apart.
    sidebar: 'Open the side navigation',
    closeSidebar: 'Close the side navigation',
    // The slim rail's own toggle [gap-12]: it narrows the panel rather
    // than hiding it, so it must not borrow the open and close names.
    collapseRail: 'Collapse the side navigation to its icons',
    expandRail: 'Expand the side navigation',
    // The resize handle's name [Kenny, 2026-10-13, minor options]: a separator
    // whose value is the panel's width, so it says what it changes.
    resizeSidebar: 'Resize the side navigation',
    // A control that appears part-way down a page and has no text of its
    // own beyond an arrow: the accessible name is the whole of what a
    // screen reader gets.
    backToTop: 'Back to top',
    previous: 'Previous',
    next: 'Next',
    finish: 'Finish',
    back: 'Back',
    // Named rather than a bare ×: a column of identical remove buttons is
    // useless to anyone who cannot see which row they are in.
    removeNamed: (name) => `Remove ${name}`,
    noResults: 'No results',
    oneResult: '1 result',
    manyResults: (n) => `${n} results`,
    noCommands: 'No commands',
    oneCommand: '1 command',
    manyCommands: (n) => `${n} commands`,
    commandPlaceholder: 'Type a command…',
    commandsLabel: 'Commands',
    shortcutsLabel: 'Keyboard shortcuts',
    // The trigger in the bar [scope-48]: a hotkey alone is a secret, so the
    // bar says the word and prints the key beside it, in the platform's
    // own spelling — ⌘ is a Mac's modifier, and nowhere else's.
    paletteTrigger: 'Search',
    paletteHotkey: (key, mac) => (mac ? `⌘${key.toUpperCase()}` : `Ctrl ${key.toUpperCase()}`),
};
