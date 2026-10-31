// The words of the split, reorder, tiles, contrast, colour, confirmations, alarms, arrivals, charts, menus, the tour and meters.

/**
 * @typedef {object} SplitConfirmChartStrings
 * @property {string} splitLabel
 * @property {(name: string) => string} reorderHandle
 * @property {(name: string, at: number, of: number) => string} reorderMoved
 * @property {string} tileFallbackName
 * @property {(name: string, column: number, row: number, w: number, h: number) => string} tileLabel
 * @property {(token: string) => string} contrastMissing
 * @property {(ratio: string, token: string, verdict: string) => string} contrastReport
 * @property {string} colourHue
 * @property {string} colourSaturation
 * @property {string} colourLightness
 * @property {string} contrastPasses
 * @property {string} contrastFails
 * @property {string} confirm
 * @property {string} confirmAccept
 * @property {string} confirmCancel
 * @property {string} confirmDescription
 * @property {(count: number) => string} confirmDependents  The heading over what still uses the thing a confirmation would remove, "Still in use by 2" (`data-kp-confirm-dependents`) [kpadopt4]
 * @property {string} confirmBlocked  What a confirmation that may not go ahead says when the page gives no sentence (`data-kp-confirm-blocked`) [kpadopt4]
 * @property {string} confirmClose  The one button of a confirmation that may not go ahead [kpadopt4]
 * @property {string} alarmAction  The button that closes an alarm that must be acknowledged, when the caller names none [scope-94]
 * @property {string} alarmKeepOpen  The button that stops an alarm's countdown and keeps it open [scope-94]
 * @property {string} alarmHint  The key hint beside the acknowledge button; hidden from a screen reader [scope-94]
 * @property {(seconds: number) => string} alarmCountdown  The whole seconds left under the countdown bar; hidden from a screen reader [scope-94]
 * @property {(seconds: number) => string} alarmClosesBy  Said once when an alarm that closes by itself opens [scope-94]
 * @property {(action: string) => string} alarmPressTo  Said when an alarm that must be acknowledged opens [scope-94]
 * @property {(action: string) => string} alarmKeptOpen  Said when Keep open stopped the countdown [scope-94]
 * @property {string} save
 * @property {string} mainNavigation
 * @property {string} skipToContent
 * @property {string} classified  The stamp a register may print on an emphasis reveal (the dossier) [AR35]
 * @property {string} arrivalLine  The neutral boot line of an arrival, for a theme that performs one and has no words of its own in `arrivalWordsByTheme` or `arrivalLinesByTheme` [SW2, scope-84]
 * @property {Record<string, { line?: string, progress?: string, ready?: string }>} arrivalWordsByTheme  A theme's own words for the counting boot, keyed by theme [scope-84]: its line, the word before the percentage, and the word that closes it. A word the entry leaves out is the neutral one.
 * @property {Record<string, string[]>} arrivalLinesByTheme  The lines a theme's own boot shows instead of that one line, in order, keyed by theme [S49, A11]. A `{count}` in a line is replaced by a number counting up to `--kp-arrival-count` (640 by default), which is how retro's memory test reads.
 * @property {string} arrivalProgress  The neutral word before the percentage on that line
 * @property {string} arrivalReady  The neutral word that closes the boot line
 * @property {string} arrivalSkip  The button that ends the arrival at once
 * @property {string} measureLoading  A live dimension label before the first measurement lands (blueprint) [S48]
 * @property {(w: number, h: number) => string} measureBox  The size of the box the measurement frame holds (blueprint) [scope-18]
 * @property {(label: string) => string} chartPlot  A time chart's plot, for a screen reader: what it is and its keys [scope-143]
 * @property {(label: string) => string} chartSpark  A chart's 24-hour spark line, for a screen reader [scope-143]
 * @property {(label: string) => string} chartSources  The name of a chart's legend [scope-143]
 * @property {(label: string) => string} chartSource  A legend button's title: what hovering and clicking it do [scope-143]
 * @property {string} chartShowAll  The legend's way back to every source [scope-143]
 * @property {string} chartShowAllTitle  Its title [scope-143]
 * @property {string} chartHintPointer  The hint under a legend, for a pointer [scope-143]
 * @property {string} chartHintTouch  The same hint, for a finger [scope-143]
 * @property {string} chartPinned  The word in a pinned tooltip's head [scope-143]
 * @property {string} chartRelease  The pinned tooltip's ✕, named [scope-143]
 * @property {string} chartChange  The tooltip's foot: what the ▲/▼ column is [scope-143]
 * @property {string} chartOpen  An event's link in a pinned tooltip [scope-143]
 * @property {(label: string, time: string) => string} chartMark  An event marker's title [scope-143]
 * @property {(from: string, to: string) => string} chartZoomed  The zoom chip, before its Reset, from its two ends; used only when a consumer overrides it and not `chartZoomedSpan` [scope-143]
 * @property {(span: string) => string} chartZoomedSpan  The zoom chip, before its Reset: `span` is the zoom as the chart's `range` time style prints it [scope-143]
 * @property {string} chartReset  The zoom chip's button [scope-143]
 * @property {string} chartResetTitle  Its title [scope-143]
 * @property {string} chartUp  A rise, as the readout says it [scope-143]
 * @property {string} chartDown  A fall, as the readout says it [scope-143]
 * @property {string} chartSame  No change, as the readout says it [scope-143]
 * @property {string} chartNow  A spark line's value when no time is under the crosshair [scope-143]
 * @property {string} chartEmpty  A time chart with no readings in its window, in the plot at its height [scope-143]
 * @property {string} chartRetry  The Retry under a failed chart's sentence [t56-statefix-1018]
 * @property {string} chartTrendFailed  The failed plate's heading of a key figure's trend when the page gives no sentence [kyu-plates-1019]
 * @property {string} progressFailed  The failed plate's heading of a progress bar when the page gives no title [kyu-plates-1019]
 * @property {string} chartOnePoint  Under a chart whose every source has one reading (with `onePointNote`) [scope-143]
 * @property {string} chartLoading  A loading chart (`data-kp-chart-loading`), for a screen reader [scope-143]
 * @property {string} chartPinnedOutside  A pinned tooltip's head once a live update moved the window past the pin [scope-143]
 * @property {string} menuLoading  A menu button's menu while its entries load: one disabled entry (js/menu-button.js) [scope-143]
 * @property {string} menuEmpty  The title of a menu button with no entries, which stays and does nothing (`data-kp-menu-empty="disable"`) [scope-143]
 * @property {string} navMore  The word on the button a folding bar puts its overflowing links behind (`data-kp-nav-fold`, js/nav-fold.js) [kpadopt-nav]
 * @property {string} navMoreMenu  The name of that button's menu, for a screen reader [kpadopt-nav]
 * @property {string} navMoreAlert  Said after the button's name when a link behind it carries a counter [kpadopt-nav]
 * @property {string} navMoreUnavailable  Under a folded link that cannot be followed now (`aria-disabled`, `disabled`), as its reason [kpadopt-nav]
 * @property {string} tourNext  The tour card's button to the next step (js/tour.js) [scope-143]
 * @property {string} tourNextTitle  Its title [scope-143]
 * @property {string} tourBack  The tour card's button to the step before [scope-143]
 * @property {string} tourBackTitle  Its title [scope-143]
 * @property {string} tourDone  The next button on the last step, which ends the tour [scope-143]
 * @property {string} tourDoneTitle  Its title [scope-143]
 * @property {string} tourSkip  The tour card's button that ends the tour at once [scope-143]
 * @property {string} tourSkipTitle  Its title [scope-143]
 * @property {(n: number, of: number) => string} tourCount  The tour card's count, "1 of 5"; `of` counts only the steps whose part is on the page [scope-143]
 * @property {string} chartToday  A key figure's trend axis: the word after the first point's clock when it is today ("07:00 today") [scope-143]
 * @property {string} chartYesterday  The same when it is yesterday ("14:40 yesterday") [scope-143]
 * @property {string} chartTrendKeys  A key figure's trend, for a screen reader: its keys [scope-143]
 * @property {string} meterUsed  A meter's share, in the words a screen reader hears, when the page names it nothing else ("62% used") [scope-143]
 * @property {string} meterNotMeasured  A meter with no share, for a screen reader [scope-143]
 * @property {string} meterMeasuring  A loading meter, for a screen reader [scope-143]
 * @property {string} [loading]  The calendar's busy text when the page gives none (`Loading…`)
 * @property {string} loadingWord  The word a busy picture spells on screen, deciphered letter by letter (cyberpunk's skeletons, busy bars and meters); `setStrings()` hands it to the stylesheet [scope-143]
 */

/** @type {SplitConfirmChartStrings} */
export const SPLIT_CONFIRM_CHART_STRINGS = {
    splitLabel: 'Resize the panes',
    reorderHandle: (name) => `Move ${name}`,
    /** Announced after a keyboard or pointer move. @param {string} name @param {number} at @param {number} of */
    reorderMoved: (name, at, of) => `${name} moved to position ${at} of ${of}`,
    tileFallbackName: 'Tile',
    tileLabel: (name, column, row, w, h) => `${name}, column ${column}, row ${row}, ${w} by ${h}`,
    contrastMissing: (token) => `No contrast to measure: ${token} does not exist in this theme.`,
    contrastReport: (ratio, token, verdict) => `${ratio}:1 against ${token} — ${verdict}`,
    colourHue: 'Hue',
    colourSaturation: 'Saturation',
    colourLightness: 'Lightness',
    contrastPasses: 'passes',
    contrastFails: 'too little',
    confirm: 'Confirm',
    /** The confirmation dialog TH107 opens: its two buttons, its description, and what a screen reader hears when it opens. */
    confirmAccept: 'Yes, do it',
    confirmCancel: 'Cancel',
    confirmDescription: 'This cannot be undone. Cancel leaves everything as it is.',
    confirmDependents: (count) => `Still in use by ${count}`,
    confirmBlocked: 'Remove what uses it first, then try again.',
    confirmClose: 'Close',
    // The alarm [scope-94]. The headline, the detail and the code line are
    // the caller's words; these are the ones the component adds itself. The
    // countdown and the key hint are hidden from a screen reader, which hears
    // the sentence below them once instead of a number every second.
    alarmAction: 'Acknowledge',
    alarmKeepOpen: 'Keep open',
    alarmHint: 'Press Enter',
    alarmCountdown: (seconds) => `Closes in ${seconds} s`,
    alarmClosesBy: (seconds) => `Closes by itself in ${seconds} seconds.`,
    alarmPressTo: (action) => `Press ${action} to continue.`,
    alarmKeptOpen: (action) => `Kept open. Press ${action} to continue.`,
    save: 'Save',
    mainNavigation: 'Main navigation',
    skipToContent: 'Skip to the content',
    classified: 'Classified',
    // The neutral words: no theme's world. Until scope-84 these were
    // "▶ Calibrating neural uplink", "Progress" and "OK" — cyberpunk's
    // voice, shown by synthwave's boot and by any theme that asked for one.
    arrivalLine: 'Loading',
    // Synthwave's boot is a VCR's on-screen display and an arcade cabinet's
    // attract screen: the tape plays, the tracking settles, press start.
    arrivalWordsByTheme: {
        synthwave: { line: '▶ Play', progress: 'Tracking', ready: 'Press start' },
    },
    arrivalLinesByTheme: {},
    arrivalProgress: 'Progress',
    arrivalReady: 'Ready',
    arrivalSkip: 'Skip',
    measureLoading: 'measuring…',
    measureBox: (w, h) => `${w} × ${h} px`,
    // The time chart [scope-143]: the chart's own words, the page's data
    // and labels being the page's.
    chartPlot: (label) => `${label}: chart. Arrow keys move through time, Enter pins the reading, Esc steps back.`,
    chartSpark: (label) => `${label}: last 24 hours. Arrow keys move through time.`,
    chartSources: (label) => `${label}: sources`,
    chartSource: (label) => `${label}: hover to single it out, click to keep it on or off`,
    chartShowAll: 'Show all',
    chartShowAllTitle: 'Show every source again (Esc)',
    chartHintPointer: 'Hover a source to single it out · click to keep it on or off · Show all resets',
    chartHintTouch: 'Tap a source to keep it on or off · Show all resets',
    chartPinned: 'pinned',
    chartRelease: 'Release the pinned reading (Esc)',
    chartChange: 'change over the hour before',
    chartOpen: 'Open',
    chartMark: (label, time) => `${label} · ${time}; click to pin`,
    chartZoomed: (from, to) => `Zoomed: ${from}–${to} · `,
    chartZoomedSpan: (span) => `Zoomed: ${span} · `,
    chartReset: 'Reset',
    chartResetTitle: 'Show the whole range again (double-click or Esc)',
    chartUp: 'up',
    chartDown: 'down',
    chartSame: 'unchanged',
    chartNow: 'now',
    chartEmpty: 'No readings in this window yet.',
    chartRetry: 'Retry',
    chartTrendFailed: 'The trend could not be read.',
    progressFailed: 'This could not be finished.',
    chartOnePoint: 'Only one reading so far: the line grows as more readings arrive.',
    chartLoading: 'Loading the readings…',
    chartPinnedOutside: '(pinned, outside the window)',
    // A menu button's menu [scope-143].
    menuLoading: 'Loading the actions…',
    menuEmpty: 'Nothing to do here right now.',
    navMore: 'More',
    navMoreMenu: 'More pages',
    navMoreAlert: 'Something here needs you.',
    navMoreUnavailable: 'Not available right now.',
    // A guided tour's card [scope-143].
    tourNext: 'Next',
    tourNextTitle: 'Show the next part of the page',
    tourBack: 'Back',
    tourBackTitle: 'Show the part before this one',
    tourDone: 'Done',
    tourDoneTitle: 'End the tour',
    tourSkip: 'Skip',
    tourSkipTitle: 'End the tour now; Help can start it again',
    tourCount: (n, of) => `${n} of ${of}`,
    // A key figure's 24-hour trend, and the meter with a mark [scope-143].
    chartToday: 'today',
    chartYesterday: 'yesterday',
    chartTrendKeys: 'Left and right arrows read the trend point by point, Shift moves ten, Home and End go to the ends, Escape hides the reading.',
    meterUsed: 'used',
    meterNotMeasured: 'not measured',
    meterMeasuring: 'being measured',
    loadingWord: 'LOADING',
};
