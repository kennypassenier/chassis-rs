// The words of quotes, the status list and calm status.

/**
 * @typedef {object} QuoteStatusCalmStrings
 * @property {string} quoteBy  Who wrote a quote when the card does not say: "You" (js/quote.js) [kpadopt6]
 * @property {(by: string, when: string) => string} quoteCaption  The line under a quote: "You, Tuesday 14/10/2026" [kpadopt6]
 * @property {(weekday: string, date: string) => string} quoteDay  A date with its weekday: "Tuesday 14/10/2026" [kpadopt6]
 * @property {(days: number) => string} quoteRelative  How long ago, in words: "3 days ago", "today" [kpadopt6]
 * @property {(date: string, relative: string) => string} quoteBoth  The date and how long ago together: "Tuesday 14/10/2026 (3 days ago)" [kpadopt6]
 * @property {string} quoteHide  The button that stops a quote from coming back [kpadopt6]
 * @property {string} quoteHideDone  The undo toast's line after a hide: "Hidden" [kpadopt6]
 * @property {string} quoteHiding  What a hide that is being saved says on its button [kpadopt6]
 * @property {string} quoteCopy  The button that copies the words [kpadopt6]
 * @property {string} quoteCopied  The same button for a moment after the copy [kpadopt6]
 * @property {string} quoteCopyFailed  What is said when the clipboard refused [kpadopt6]
 * @property {string} quoteShowAll  The button that unfolds a long quote [kpadopt6]
 * @property {string} quoteShowLess  The same button once it is open [kpadopt6]
 * @property {(n: number) => string} quoteShowAllN  A list's button that shows every quote: "Show all 7" [kpadopt6]
 * @property {string} quoteShowFewer  The same button once the list is open [kpadopt6]
 * @property {string} quoteOpen  The link to the day the words were written [kpadopt6]
 * @property {string} quoteLoading  The words under the loading card [kpadopt6]
 * @property {string} quoteEmptyTitle  The empty card's title [kpadopt6]
 * @property {string} quoteEmptyText  The empty card's sentence [kpadopt6]
 * @property {string} quoteFailedTitle  The failed card's title [kpadopt6]
 * @property {string} quoteFailedText  The failed card's sentence [kpadopt6]
 * @property {string} quoteRetry  The failed card's button [kpadopt6]
 * @property {string} quoteListName  A list of quotes' name for a screen reader [kpadopt6]
 * @property {string} quoteAnnounceHidden  What is said when a quote is hidden [kpadopt6]
 * @property {string} statusOpen  A row in the calm vocabulary that is still open (js/statusrow.js, `data-kp-status-vocab="calm"`) [kpadopt6]
 * @property {string} statusDone  A calm row that is done [kpadopt6]
 * @property {string} statusPaused  A calm row that is paused [kpadopt6]
 * @property {string} statusUnknown  A calm row nothing is known about: never shown as done [kpadopt6]
 * @property {(date: string) => string} statusSinceDate  A paused row's line: "Paused since 03/10/2026" [kpadopt6]
 * @property {(duration: string) => string} statusSinceFor  The same as a length: "Paused for 3 weeks" [kpadopt6]
 * @property {(date: string, duration: string) => string} statusSinceBoth  The same with both: "Paused since 03/10/2026 (2 weeks)" [kpadopt6]
 * @property {(days: number) => string} statusDuration  A length of days in words: "5 days", "3 weeks", "4 months" [kpadopt6]
 * @property {string} statusResume  The button that takes a paused row up again [kpadopt6]
 * @property {(label: string) => string} statusResumeLabel  That button's accessible name: "Resume Beweging" [kpadopt6]
 * @property {string} statusPause  The optional button that pauses a row [kpadopt6]
 * @property {(label: string) => string} statusPauseLabel  That button's accessible name [kpadopt6]
 * @property {(label: string) => string} statusResumed  What is said and toasted after a resume: "Beweging resumed" [kpadopt6]
 * @property {(label: string) => string} statusPausedNow  What is said and toasted after a pause: "Beweging paused" [kpadopt6]
 * @property {(n: number, days: number) => string} statusFoldLine  The line that gathers long-paused rows: "3 paused for more than 30 days" [kpadopt6]
 * @property {string} statusTodayEmptyTitle  The empty today card's title [kpadopt6]
 * @property {string} statusTodayEmptyText  Its second sentence: nothing is waiting [kpadopt6]
 * @property {string} statusTodayFailedTitle  The failed today card's title [kpadopt6]
 * @property {string} statusTodayFailedText  Its sentence: the fault is the system's [kpadopt6]
 * @property {string} statusTodayLoading  The words under the loading card [kpadopt6]
 * @property {string} statusTodayRetry  The failed card's button [kpadopt6]
 * @property {string} calmLogged  A day with something logged, in words: "logged" (js/calm-tones.js, `data-kp-tones="calm"`) [kpadopt6]
 * @property {string} calmQuiet  A day with nothing logged, in words: "nothing logged", never "missed" [kpadopt6]
 * @property {string} calmPaused  A day inside a pause: "paused" [kpadopt6]
 * @property {string} calmLegendLogged  The legend's word for a logged day [kpadopt6]
 * @property {string} calmLegendQuiet  The legend's word for a quiet day [kpadopt6]
 * @property {string} calmLegendPaused  The legend's word for a paused day [kpadopt6]
 * @property {string} calmEmptyTitle  The plate over a month with nothing logged: "Nothing logged this month" [kpadopt6]
 * @property {string} calmEmptyText  Its second sentence [kpadopt6]
 * @property {string} calmFailedTitle  The plate over a calendar that could not be read [kpadopt6]
 * @property {string} calmFailedText  Its sentence: the fault is the system's [kpadopt6]
 * @property {string} calmRetry  Its button [kpadopt6]
 * @property {string} calmTrendCaption  The words of the optional caption slot under the grid: trends over the days that were logged [kpadopt6]
 * @property {(logged: number, total: number) => string} calmSummary  A calm uptime strip's summary: "21 of 30 days logged", with no incident count and no share down [kpadopt6]
 */

/** @type {QuoteStatusCalmStrings} */
export const QUOTE_STATUS_CALM_STRINGS = {
    // The quote card (js/quote.js) [kpadopt6].
    quoteBy: 'You',
    quoteCaption: (by, when) => (when === '' ? by : `${by}, ${when}`),
    quoteDay: (weekday, date) => `${weekday} ${date}`,
    quoteRelative: (days) =>
        days <= 0
            ? 'today'
            : days === 1
              ? 'yesterday'
              : days < 14
                ? `${days} days ago`
                : days < 60
                  ? `${Math.floor(days / 7)} weeks ago`
                  : days < 730
                    ? `${Math.floor(days / 30)} months ago`
                    : `${Math.floor(days / 365)} years ago`,
    quoteBoth: (date, relative) => `${date} (${relative})`,
    quoteHide: 'Do not show this again',
    quoteHideDone: 'Hidden',
    quoteHiding: 'Saving',
    quoteCopy: 'Copy',
    quoteCopied: 'Copied',
    quoteCopyFailed: 'Could not copy',
    quoteShowAll: 'Show all',
    quoteShowLess: 'Show less',
    quoteShowAllN: (n) => `Show all ${n}`,
    quoteShowFewer: 'Show fewer',
    quoteOpen: 'Open that day',
    quoteLoading: 'Reading your notes',
    quoteEmptyTitle: 'Nothing from earlier yet',
    quoteEmptyText: 'Words you write come back here',
    quoteFailedTitle: 'Could not read your notes',
    quoteFailedText: 'The notes could not be reached just now.',
    quoteRetry: 'Retry',
    quoteListName: 'Earlier words',
    quoteAnnounceHidden: 'Quote hidden',
    // The calm status vocabulary and the today card (js/statusrow.js) [kpadopt6].
    statusOpen: 'Open',
    statusDone: 'Done',
    statusPaused: 'Paused',
    statusUnknown: 'Not known',
    statusSinceDate: (date) => `Paused since ${date}`,
    statusSinceFor: (duration) => `Paused for ${duration}`,
    statusSinceBoth: (date, duration) => `Paused since ${date} (${duration})`,
    statusDuration: (days) =>
        days < 14
            ? `${days} ${days === 1 ? 'day' : 'days'}`
            : days < 60
              ? `${Math.floor(days / 7)} weeks`
              : days < 730
                ? `${Math.floor(days / 30)} months`
                : `${Math.floor(days / 365)} years`,
    statusResume: 'Resume',
    statusResumeLabel: (label) => `Resume ${label}`,
    statusPause: 'Pause',
    statusPauseLabel: (label) => `Pause ${label}`,
    statusResumed: (label) => `${label} resumed`,
    statusPausedNow: (label) => `${label} paused`,
    statusFoldLine: (n, days) => `${n} paused for more than ${days} days`,
    statusTodayEmptyTitle: 'Nothing planned today',
    statusTodayEmptyText: 'That is fine, nothing is waiting',
    statusTodayFailedTitle: 'Could not read today',
    statusTodayFailedText: 'The list could not be reached just now.',
    statusTodayLoading: 'Reading today',
    statusTodayRetry: 'Retry',
    // Calm tones for a calendar, a heat grid and an uptime strip (js/calm-tones.js) [kpadopt6].
    calmLogged: 'logged',
    calmQuiet: 'nothing logged',
    calmPaused: 'paused',
    calmLegendLogged: 'Logged',
    calmLegendQuiet: 'Nothing logged',
    calmLegendPaused: 'Paused',
    calmEmptyTitle: 'Nothing logged this month',
    calmEmptyText: 'That is fine, it starts whenever you do',
    calmFailedTitle: 'Could not read this month',
    calmFailedText: 'The days could not be reached just now.',
    calmRetry: 'Retry',
    calmTrendCaption: 'Trends count the days that were logged',
    calmSummary: (logged, total) => `${logged} of ${total} days logged`,
};
