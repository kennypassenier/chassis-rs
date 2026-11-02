// The Dutch words of the quote card, the calm status vocabulary and the calm tones [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** @param {number} n @param {string} one @param {string} many @returns {string} */
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** A span in days as Dutch words, the largest unit that reads well. @param {number} days @returns {string} */
const span = (days) =>
    days < 14
        ? count(days, 'dag', 'dagen')
        : days < 60
          ? `${Math.floor(days / 7)} weken`
          : days < 730
            ? `${Math.floor(days / 30)} maanden`
            : `${Math.floor(days / 365)} jaar`;

/** @type {Partial<Strings>} */
export const NL_QUOTE_STATUS_CALM = {
    quoteBy: 'Jij',
    quoteCaption: (by, when) => (when === '' ? by : `${by}, ${when}`),
    quoteDay: (weekday, date) => `${weekday} ${date}`,
    quoteRelative: (days) => (days <= 0 ? 'vandaag' : days === 1 ? 'gisteren' : `${span(days)} geleden`),
    quoteBoth: (date, relative) => `${date} (${relative})`,
    quoteHide: 'Dit niet meer tonen',
    quoteHideDone: 'Verborgen',
    quoteHiding: 'Bewaren',
    quoteCopy: 'Kopiëren',
    quoteCopied: 'Gekopieerd',
    quoteCopyFailed: 'Kopiëren lukte niet',
    quoteShowAll: 'Alles tonen',
    quoteShowLess: 'Minder tonen',
    quoteShowAllN: (n) => `Alle ${n} tonen`,
    quoteShowFewer: 'Minder tonen',
    quoteOpen: 'Die dag openen',
    quoteLoading: 'Je notities worden gelezen',
    quoteEmptyTitle: 'Nog niets van vroeger',
    quoteEmptyText: 'Woorden die je schrijft komen hier terug',
    quoteFailedTitle: 'Je notities konden niet gelezen worden',
    quoteFailedText: 'De notities waren net niet bereikbaar.',
    quoteRetry: 'Opnieuw proberen',
    quoteListName: 'Eerdere woorden',
    quoteAnnounceHidden: 'Citaat verborgen',
    statusOpen: 'Open',
    statusDone: 'Klaar',
    statusPaused: 'Gepauzeerd',
    statusUnknown: 'Niet bekend',
    statusSinceDate: (date) => `Gepauzeerd sinds ${date}`,
    statusSinceFor: (duration) => `Al ${duration} gepauzeerd`,
    statusSinceBoth: (date, duration) => `Gepauzeerd sinds ${date} (${duration})`,
    statusDuration: (days) => span(days),
    statusResume: 'Hervatten',
    statusResumeLabel: (label) => `${label} hervatten`,
    statusPause: 'Pauzeren',
    statusPauseLabel: (label) => `${label} pauzeren`,
    statusResumed: (label) => `${label} hervat`,
    statusPausedNow: (label) => `${label} gepauzeerd`,
    statusFoldLine: (n, days) => `${n} langer dan ${days} dagen gepauzeerd`,
    statusTodayEmptyTitle: 'Vandaag niets gepland',
    statusTodayEmptyText: 'Dat is prima, er wacht niets',
    statusTodayFailedTitle: 'Vandaag kon niet gelezen worden',
    statusTodayFailedText: 'De lijst was net niet bereikbaar.',
    statusTodayLoading: 'Vandaag wordt gelezen',
    statusTodayRetry: 'Opnieuw proberen',
    calmLogged: 'bijgehouden',
    calmQuiet: 'niets bijgehouden',
    calmPaused: 'gepauzeerd',
    calmLegendLogged: 'Bijgehouden',
    calmLegendQuiet: 'Niets bijgehouden',
    calmLegendPaused: 'Gepauzeerd',
    calmEmptyTitle: 'Deze maand niets bijgehouden',
    calmEmptyText: 'Dat is prima, het begint wanneer jij begint',
    calmFailedTitle: 'Deze maand kon niet gelezen worden',
    calmFailedText: 'De dagen waren net niet bereikbaar.',
    calmRetry: 'Opnieuw proberen',
    calmTrendCaption: 'Trends tellen de dagen die bijgehouden zijn',
    calmSummary: (logged, total) => `${logged} van ${total} dagen bijgehouden`,
};
