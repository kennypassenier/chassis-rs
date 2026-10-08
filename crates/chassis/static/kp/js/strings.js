// Every user-visible string this package can produce [KT5].
//
// The fault this closes, in Kenny's words: "Wij bieden de basis, de
// consumenten vullen de inhoud in." Until 2.0.0 every component spoke
// hardcoded Dutch in both channels, so an English consumer could adopt
// exactly the components that carry no text — and that was measurably
// the case: JobTracker took Button, Badge, Card, Alert, Health,
// EmptyState and Toasts, which are precisely the files with a zero in
// the count. Everything from round two, including the DataTable and the
// forms Kenny had asked for, was unreachable.
//
// **The fault is not "Dutch strings".** It is a user-visible string with
// no way in from outside, which the JobTracker session named more
// precisely than the first version of the correction did. A Dutch app
// that wants "Overnemen" where this says "Opslaan" is just as stuck, and
// translating everything to English would leave the same defect wearing
// a different word. So the shape of the fix is a way IN, and the default
// language is a separate decision that happens to be English.
//
// Screen-reader-only text is in here too, and that is the half that
// matters most. `Copyable` already took its visible labels as props and
// kept its announcement hardcoded, so an English page said one thing on
// screen and another to a screen reader. Half-translatable is worse than
// untranslatable: it fails silently, and only for the people who cannot
// see that it failed.
//
// Three ways to supply your own, all of them optional:
//
//   import { setStrings } from '@kp-soft/themes/js/strings';
//   setStrings({ formRequired: 'required' });        // framework-free
//
//   <StringsProvider value={{ formRequired: 'vereist' }}>…   // React
//
//   <DataTable strings={{ tableSearch: 'Rechercher' }} />    // per use
//
// Anything not supplied falls back to the English below, so a consumer
// overrides what it cares about and nothing else.

/**
 * @typedef {object} Strings
 * @property {string} alertSuccess
 * @property {string} alertWarning
 * @property {string} alertInfo
 * @property {string} alertError
 * @property {string} attentionCritical  The word a screen reader hears before a critical problem on the attention band (setAttention) [scope-143]
 * @property {string} attentionWarning  The same, before a warning [scope-143]
 * @property {string} attentionInfo  The same, before an information [scope-143]
 * @property {(verb: string, duration: string) => string} agoText  A ticking freshness line, "updated 12 s ago" (js/freshness.js) [scope-143]
 * @property {(verb: string) => string} agoNever  The same line with no moment yet, "not updated yet" [scope-143]
 * @property {(n: number) => string} agoSeconds  A duration's seconds part, "12 s" [scope-143]
 * @property {(n: number) => string} agoMinutes  Its minutes part, "2 min" [scope-143]
 * @property {(n: number) => string} agoHours  Its hours part, "3 h" [scope-143]
 * @property {(n: number) => string} agoDays  Its days part, "1 day", "2 days" [scope-143]
 * @property {string} agoVerb  The verb a freshness line uses when its element names none [scope-143]
 * @property {(text: string) => string} agoStale  What a freshness line with `data-kp-ago-announce="state"` announces once it turns stale [scope-143]
 * @property {(text: string) => string} agoFresh  What it announces once it is fresh again [scope-143]
 * @property {string} agoInLiveRegion  The console warning for a ticking line inside a live region [scope-143]
 * @property {string} busy
 * @property {string} close
 * @property {string} menu          The accessible name of a collapsed navigation's toggle
 * @property {string} closeMenu     The same toggle once the navigation is open
 * @property {string} navDisclosure  The accessible name of a mega-menu button in the bar that holds no words of its own [scope-48]
 * @property {string} sidebar       The accessible name of a hidden side navigation's toggle
 * @property {string} closeSidebar  The same toggle once that side navigation is open
 * @property {string} collapseRail  The accessible name of an empty slim-rail toggle while the rail is expanded
 * @property {string} expandRail    The same toggle while the rail is collapsed to its icons
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
 * @property {string} tableSearch
 * @property {string} tableSearchLabel
 * @property {string} tableSelectAll
 * @property {(key: string) => string} tableSelectRow
 * @property {string} tableEmpty
 * @property {(n: number) => string} tableRows
 * @property {(shown: number, total: number) => string} tableRowsFiltered
 * @property {(at: number, of: number) => string} tablePage
 * @property {string} tableRegion
 * @property {string} tableSearchScope      The name of the "In" choice beside the search box
 * @property {string} tableSearchAllColumns The "In" choice's first option
 * @property {(active: number) => string} tableFilters  The filter panel's toggle, with the number of active filters
 * @property {string} tableFiltersLabel     The filter panel's group name
 * @property {string} tableActiveFilters    The list of removable filter pills
 * @property {(column: string, value: string) => string} tableFilterValue  A choice filter's pill
 * @property {(column: string, from: string, to: string) => string} tableFilterRange  A range or date filter's pill; an open end is `tableFilterOpenEnd`
 * @property {string} tableFilterOpenEnd    The open end of a range in its pill
 * @property {(column: string) => string} tableFilterFrom  The lower bound's accessible name
 * @property {(column: string) => string} tableFilterTo    The upper bound's accessible name
 * @property {(label: string) => string} tableRemoveFilter  A pill's remove button
 * @property {string} tableClearFilters
 * @property {string} tableClearSearch      The way out of the no-match state
 * @property {(active: number) => string} tableAddFilter  The "+ Add filter" button of a table in the add-filter mode, with the number of active filters
 * @property {string} tableAddFilterMenu    The name of its menu of filterable columns
 * @property {(column: string) => string} tableAddFilterItem  A column in that menu, not filtered yet
 * @property {(column: string) => string} tableAddFilterItemActive  A column in that menu that is filtered already: choosing it edits that filter
 * @property {string} tableFilterMarked     The mark beside a filtered column in the menu
 * @property {(column: string) => string} tableFilterEditor  The editor's accessible name
 * @property {(column: string) => string} tableFilterChoicesLegend  The editor's list of choices, for a screen reader
 * @property {(kind: 'range' | 'date', bound: 'from' | 'to', column: string) => string} tableFilterBound  A bound's visible label in the editor
 * @property {(column: string, values: string[]) => string} tableFilterChoicePill  A choice filter's one pill in the add-filter mode
 * @property {(column: string, from: string, to: string, kind: 'range' | 'date') => string} tableFilterSpanPill  A range or date filter's pill in the add-filter mode; an open end is left out
 * @property {(label: string) => string} tableEditFilter  A pill's own button, which reopens its editor
 * @property {string} tableFilterApply
 * @property {string} tableFilterCancel
 * @property {string} tableFilterClearAll   The add-filter mode's way out of every filter, shown from two pills
 * @property {(label: string, value: string) => string} tableFilterNotNumber  A number bound that is not a number
 * @property {(label: string, value: string) => string} tableFilterNotDate  A date bound the picker cannot read
 * @property {(from: string, to: string) => string} tableFilterBackwards  A range whose lower bound is above its upper
 * @property {string} tableDensity
 * @property {string} tableDensityComfortable
 * @property {string} tableDensityCompact
 * @property {string} tableRowsPerPage
 * @property {(from: number, to: number, count: number, total: number) => string} tableShowing  The status line: "Showing 1–25 of 60"
 * @property {(n: number) => string} tableSelected  The action bar's count
 * @property {string} tableClearSelection
 * @property {string} tableSortBy           The card layout's sort control
 * @property {string} tableSortNone         Its first option
 * @property {string} tableSortAscending
 * @property {string} tableSortDescending
 * @property {string} tableFailed
 * @property {string} tableRetry
 * @property {(column: string, direction: 'ascending' | 'descending', kind: string) => string} tableSortKey  One key of a multi-column sort in words; `kind` is text, number, date or order
 * @property {(keys: string[]) => string} tableSortedBy  The multi-sort summary, from the keys in order
 * @property {string} tableNotSorted
 * @property {string} tableSortReset
 * @property {(seconds: number) => string} tableBusyElapsed
 * @property {string} tableColumns          The column menu's button
 * @property {string} tableColumnsLabel     The column menu's name
 * @property {(column: string) => string} tableColumnLocked  A column that cannot be hidden, in the menu
 * @property {string} tableShowAllColumns
 * @property {(shown: number, total: number) => string} tableColumnsShown
 * @property {string} tableDetailsColumn    The expansion column's header, read by a screen reader only
 * @property {(key: string) => string} tableRowDetails  A row's expand button
 * @property {(group: string, count: number) => string} tableGroupRows  A group row's fold button: the group's name and how many of its rows match [J2]
 * @property {(column: string, key: string, value: string) => string} tableEdit  An editable cell's button
 * @property {(column: string, key: string) => string} tableEditField  The editor's accessible name
 * @property {(column: string, key: string) => string} tableEditing  Said when an editor opens
 * @property {(key: string, column: string, before: string, after: string) => string} tableEdited
 * @property {(key: string, column: string, value: string) => string} tableEditUndone
 * @property {string} tableEditCancelled
 * @property {string} tableEditRequired
 * @property {string} tableEditInvalid     A rejected edit with no message of its own
 * @property {string} tableGridStart        The keyboard grid's line before the first cell is focused
 * @property {(row: number, rows: number, column: string, text: string) => string} tableGridPosition  Row 0 is the header row
 * @property {string} formRequired
 * @property {string} formInvalid
 * @property {string} formSummaryOne
 * @property {(n: number) => string} formSummaryMany
 * @property {string} fieldFallbackName
 * @property {string} switchOn   The word beside a switch that is on [gap-11]
 * @property {string} switchOff  The word beside a switch that is off [gap-11]
 * @property {string} calendarOpen
 * @property {string} calendarButton
 * @property {string} dateFormatHint
 * @property {string} previousMonth
 * @property {string} nextMonth
 * @property {(month: string, year: number) => string} monthTitle
 * @property {(title: string) => string} chooseMonth  The month title's name: it opens the twelve months [scope-89]
 * @property {(year: number) => string} chooseYear    The year title's name: it opens twelve years [scope-89]
 * @property {string} previousYear
 * @property {string} nextYear
 * @property {string} previousYears  Twelve years back, in the year grid
 * @property {string} nextYears      Twelve years on, in the year grid
 * @property {(year: number) => string} monthGrid           The month grid's name, and what is said when it opens
 * @property {(from: number, to: number) => string} yearGrid The year grid's name, and what is said when it opens
 * @property {(from: number, to: number) => string} yearRange The year grid's title
 * @property {string[]} weekdays
 * @property {string[]} months
 * @property {string[]} monthsShort  The month grid's cells, where a full name does not fit [scope-89]
 * @property {(day: number, month: string, year: number) => string} dayLabel
 * @property {string} uploadZone
 * @property {(size: string) => string} uploadTooLarge
 * @property {(max: number) => string} uploadTooMany
 * @property {(max: string) => string} uploadTotalTooLarge
 * @property {(accept: string) => string} uploadWrongType
 * @property {(name: string) => string} uploadProgress
 * @property {(at: number, of: number) => string} wizardStep
 * @property {string} copy
 * @property {string} copied
 * @property {string} copyBlocked
 * @property {(value: string) => string} copiedAnnouncement
 * @property {string} copyBlockedAnnouncement
 * @property {string} undo
 * @property {string} deleted
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
 * @property {string} diagnosticsEffects  The diagnostics row that lists unknown hook values [AR44]
 * @property {string} diagnosticsEffectsNone
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
 * @property {string} chartOnePoint  Under a chart whose every source has one reading (with `onePointNote`) [scope-143]
 * @property {string} chartLoading  A loading chart (`data-kp-chart-loading`), for a screen reader [scope-143]
 * @property {string} chartPinnedOutside  A pinned tooltip's head once a live update moved the window past the pin [scope-143]
 * @property {string} menuLoading  A menu button's menu while its entries load: one disabled entry (js/menu-button.js) [scope-143]
 * @property {string} menuEmpty  The title of a menu button with no entries, which stays and does nothing (`data-kp-menu-empty="disable"`) [scope-143]
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
 * @property {string} loadingWord  The word a busy picture spells on screen, deciphered letter by letter (cyberpunk's skeletons, busy bars and meters); `setStrings()` hands it to the stylesheet [scope-143]
 * @property {string} calendarNav  The name of a month heatmap's row of month buttons (js/calendar.js) [scope-143]
 * @property {string} calendarPrev  A month heatmap's button to the month before; its name and title are `previousMonth` [scope-143]
 * @property {string} calendarNext  Its button to the month after; its name and title are `nextMonth` [scope-143]
 * @property {string} calendarToday  Its button back to today's month, with today picked [scope-143]
 * @property {string} calendarTodayTitle  That button's title [scope-143]
 * @property {(date: string, label: string) => string} calendarDay  A day's name and title: the date (dd/mm/yyyy) and what the page says about it [scope-143]
 * @property {string} calendarFuture  What a day still to come is, when the page says nothing about it [scope-143]
 * @property {string} calendarLoading  What every day is while the calendar loads [scope-143]
 * @property {string} calendarUnknown  What a past day is when the page says nothing about it [scope-143]
 * @property {string} graphShowAll  The network graph's way back to every node and every kind of link (js/graph.js) [scope-143]
 * @property {string} graphShowAllTitle  Its title [scope-143]
 * @property {string} graphHint  The hint under the graph, and the second half of its picture's accessible name: what a pointer, a click and the keys do [scope-143]
 * @property {string} graphKinds  The name of the list of kinds of link over the graph [scope-143]
 * @property {string} graphLoading  A loading graph's sentence when the page gives none (`setGraphState(el, 'loading')`) [scope-143]
 * @property {string} graphUnnamed  The picture's name when the graph has no `aria-label` [scope-143]

 * @property {string} breadcrumb
 * @property {string} pagination
 * @property {string} themePicker
 * @property {string} themeSaveFailed
 * @property {string} themeSaveRefused
 * @property {string} contractDestructive
 * @property {string} contractSemantic
 * @property {string} themeGroupLight
 * @property {string} themeGroupDark
 * @property {(requested: string, applied: string) => string} themeUnknown
 * @property {(name: string, component: string) => string} rememberClash  The console warning when two elements of one component ask to be remembered under the same name
 * @property {(theme: string, href: string) => string} registerLoadFailed  The console error when a lazily loaded register did not arrive; the theme stays what it was [scope-50]
 * @property {string} diagnosticsHeading
 * @property {string} diagnosticsStylesheet
 * @property {string} diagnosticsScript
 * @property {string} diagnosticsVersion
 * @property {string} diagnosticsThemes
 * @property {string} diagnosticsVerdict
 * @property {string} diagnosticsMatch
 * @property {(stylesheet: string, script: string) => string} diagnosticsStylesheetBehind
 * @property {(stylesheet: string, script: string) => string} diagnosticsScriptBehind
 * @property {(version: string) => string} diagnosticsThemesDiffer
 * @property {string} diagnosticsNoVersion
 * @property {(names: string) => string} diagnosticsOnlyInStylesheet
 * @property {(names: string) => string} diagnosticsOnlyInScript
 * @property {string} diagnosticsUnknownVersion
 */

/**
 * The defaults. English, by Kenny's decision of 2026-09-04 — the package
 * has to speak something, and English is the language a consumer is least
 * likely to have to replace.
 *
 * @type {Strings}
 */
export const DEFAULT_STRINGS = Object.freeze({
    alertSuccess: 'Success',
    alertWarning: 'Warning',
    alertInfo: 'Info',
    alertError: 'Error',
    // The attention band's severities, for a screen reader [scope-143].
    attentionCritical: 'Critical',
    attentionWarning: 'Warning',
    attentionInfo: 'Information',
    // A ticking freshness line [scope-143]: exact numbers, the two largest
    // units, a zero part left out ("2 min", "2 min 5 s", "1 day 1 h").
    agoText: (verb, duration) => `${verb} ${duration} ago`,
    agoNever: (verb) => `not ${verb} yet`,
    agoSeconds: (n) => `${n} s`,
    agoMinutes: (n) => `${n} min`,
    agoHours: (n) => `${n} h`,
    agoDays: (n) => (n === 1 ? '1 day' : `${n} days`),
    agoVerb: 'updated',
    agoStale: (text) => `${text}, out of date`,
    agoFresh: (text) => `${text}, up to date`,
    agoInLiveRegion:
        'kp-themes: a ticking freshness line (data-kp-ago) sits inside a live region, so a screen reader would hear it every second. It is silenced (aria-live="off"); move it out of the region, or use data-kp-ago-announce="state".',
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
    tableSearch: 'Search…',
    tableSearchLabel: 'Search the table',
    // "On this page", because that is what it does [gap-13]: the header box
    // used to tick every filtered row on every page while saying "visible".
    tableSelectAll: 'Select every row on this page',
    tableSelectRow: (key) => `Select row ${key}`,
    tableEmpty: 'Nothing found.',
    tableRows: (n) => `${n} rows`,
    tableRowsFiltered: (shown, total) => `${shown} of ${total} rows`,
    /** The pager's position, "2 / 5". A function, so a consumer reorders it. @param {number} at @param {number} of */
    tablePage: (at, of) => `${at} / ${of}`,
    /**
     * The name of the scrolling region around a table [TH95], used only
     * when the table has no caption and the consumer named nothing: a
     * region with no name is announced as "region" and tells a reader
     * nothing about what they just tabbed into.
     */
    tableRegion: 'Table',
    tableSearchScope: 'Search in',
    tableSearchAllColumns: 'All columns',
    tableFilters: (active) => (active > 0 ? `Filters (${active})` : 'Filters'),
    tableFiltersLabel: 'Filters',
    tableActiveFilters: 'Active filters',
    tableFilterValue: (column, value) => `${column}: ${value}`,
    tableFilterRange: (column, from, to) => `${column}: ${from}–${to}`,
    tableFilterOpenEnd: 'any',
    tableFilterFrom: (column) => `${column}, from`,
    tableFilterTo: (column) => `${column}, to`,
    tableRemoveFilter: (label) => `Remove filter ${label}`,
    tableClearFilters: 'Clear all filters',
    tableClearSearch: 'Clear the search and filters',
    // The add-filter mode [Kenny, 2026-09-14, "Allebei, per tabel"], in the
    // words of the approved mock, research/datatable/demo.html#filter-add.
    tableAddFilter: (active) => (active > 0 ? `+ Add filter (${active} active)` : '+ Add filter'),
    tableAddFilterMenu: 'Filter by column',
    tableAddFilterItem: (column) => `Filter on ${column}`,
    tableAddFilterItemActive: (column) => `${column}, already filtered: edit that filter`,
    tableFilterMarked: 'filtered',
    tableFilterEditor: (column) => `Filter on ${column}`,
    tableFilterChoicesLegend: (column) => `Show rows whose ${column.toLowerCase()} is`,
    tableFilterBound: (kind, bound, column) => {
        if (kind === 'date') return bound === 'from' ? `${column} on or after` : `${column} on or before`;
        return bound === 'from' ? 'From' : 'To';
    },
    tableFilterChoicePill: (column, values) => `${column}: ${values.join(', ')}`,
    tableFilterSpanPill: (column, from, to, kind) => {
        if (from !== '' && to !== '') return `${column}: ${from}${kind === 'date' ? ' to ' : '–'}${to}`;
        if (from !== '') return `${column}: from ${from}`;
        return `${column}: up to ${to}`;
    },
    tableEditFilter: (label) => `Edit filter ${label}`,
    tableFilterApply: 'Apply',
    tableFilterCancel: 'Cancel',
    tableFilterClearAll: 'Clear all',
    tableFilterNotNumber: (label, value) => `${label} takes a number, like 10; "${value}" is not one.`,
    tableFilterNotDate: (label, value) =>
        `${label}: "${value}" is not a date this field can read; write it the way the field shows, or use the calendar.`,
    tableFilterBackwards: (from, to) => `The range runs backwards: from ${from} to ${to}. Swap the two values.`,
    tableDensity: 'Density',
    tableDensityComfortable: 'Comfortable',
    tableDensityCompact: 'Compact',
    tableRowsPerPage: 'Rows per page',
    /** "Showing 1–25 of 60", and where a search or filter hides rows, how many. */
    tableShowing: (from, to, count, total) => {
        if (count === 0) return `Showing 0 of ${total}`;
        if (count === total) return `Showing ${from}–${to} of ${total}`;
        return `Showing ${from}–${to} of ${count} (filtered from ${total})`;
    },
    tableSelected: (n) => `${n} selected`,
    tableClearSelection: 'Clear selection',
    tableSortBy: 'Sort by',
    tableSortNone: 'None',
    tableSortAscending: 'Ascending',
    tableSortDescending: 'Descending',
    tableFailed: 'The rows could not be loaded.',
    tableRetry: 'Try again',
    // The seven features of 2026-09-13 ("Alle zeven, nu"), in the words the
    // approved mocks of research/datatable/demo.html used.
    tableSortKey: (column, direction, kind) => {
        const up = direction === 'ascending';
        if (kind === 'number' || kind === 'order') return `${column} ${up ? 'low to high' : 'high to low'}`;
        if (kind === 'date') return `${column} ${up ? 'oldest first' : 'newest first'}`;
        return `${column} ${up ? 'A to Z' : 'Z to A'}`;
    },
    tableSortedBy: (keys) => `Sorted by ${keys.join(', then ')}.`,
    tableNotSorted: 'Not sorted.',
    tableSortReset: 'Reset the sort',
    tableBusyElapsed: (seconds) => (seconds < 60 ? `${seconds} s so far` : `${Math.floor(seconds / 60)} min ${seconds % 60} s so far`),
    tableColumns: 'Columns',
    tableColumnsLabel: 'Visible columns',
    tableColumnLocked: (column) => `${column} (always shown)`,
    tableShowAllColumns: 'Show every column',
    tableColumnsShown: (shown, total) => `${shown} of ${total} columns shown`,
    tableDetailsColumn: 'Details',
    tableRowDetails: (key) => `Details for ${key}`,
    tableGroupRows: (group, count) => `${group}: ${count} ${count === 1 ? 'row' : 'rows'}`,
    tableEdit: (column, key, value) => `${column} of ${key}: ${value}. Edit`,
    tableEditField: (column, key) => `${column} of ${key}`,
    tableEditing: (column, key) => `Editing ${column} of ${key}. Press Enter to save, or Escape to cancel.`,
    tableEdited: (key, column, before, after) => `${key}: ${column} changed from ${before} to ${after}.`,
    tableEditUndone: (key, column, value) => `Undone: ${key} ${column} is ${value} again.`,
    tableEditCancelled: 'Edit cancelled; nothing changed.',
    tableEditRequired: 'A value is required.',
    tableEditInvalid: 'This value cannot be saved.',
    tableGridStart: 'Tab into the table to start.',
    tableGridPosition: (row, rows, column, text) => `${row === 0 ? 'Header row' : `Row ${row} of ${rows}`}, column ${column}: ${text}`,
    formRequired: 'required',
    formInvalid: 'This field is not filled in correctly.',
    formSummaryOne: '1 field is not filled in correctly.',
    formSummaryMany: (n) => `${n} fields are not filled in correctly.`,
    fieldFallbackName: 'Field',
    // Beside the track, so a switch's state never rests on colour or the
    // thumb's position alone [DI4]. Hidden from a screen reader, which
    // already hears "switch, on" from the role [gap-11].
    switchOn: 'On',
    switchOff: 'Off',
    calendarOpen: 'Open the calendar',
    // What the calendar button shows: a glyph, hidden from a screen reader,
    // which hears calendarOpen as the button's name instead. The same glyph
    // the date picker's own markup carries, so a picker the package builds
    // (the data table's date filter) looks like one written by hand
    // [Kenny's note of 2026-09-13]. Until then it was the word "Calendar".
    calendarButton: '▦',
    dateFormatHint: 'dd-mm-yyyy',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    /** The calendar's heading. A function, so a locale that writes the year first can. @param {string} month @param {number} year */
    monthTitle: (month, year) => `${month} ${year}`,
    // The title is a button since scope-89. Its name keeps the words it
    // shows and adds what a press does, so a voice command naming what is
    // on screen still reaches it.
    chooseMonth: (title) => `${title}, choose a month`,
    chooseYear: (year) => `${year}, choose a year`,
    previousYear: 'Previous year',
    nextYear: 'Next year',
    previousYears: 'Previous twelve years',
    nextYears: 'Next twelve years',
    monthGrid: (year) => `Months of ${year}`,
    yearGrid: (from, to) => `Years ${from} to ${to}`,
    yearRange: (from, to) => `${from}–${to}`,
    weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    // The full date, because "4" alone tells a screen reader nothing about
    // which month it is in.
    dayLabel: (day, month, year) => `${day} ${month} ${year}`,
    uploadZone: 'Drop files here or choose them',
    uploadTooLarge: (size) => `Larger than ${size}`,
    /** @param {number} max */
    uploadTooMany: (max) => `No more than ${max} files.`,
    /** @param {string} max */
    uploadTotalTooLarge: (max) => `Together the files may not exceed ${max}.`,
    /** @param {string} accept */
    uploadWrongType: (accept) => `Only ${accept} files.`,
    uploadProgress: (name) => `Progress of ${name}`,
    wizardStep: (at, of) => `Step ${at} of ${of}`,
    copy: 'Copy',
    copied: 'Copied',
    copyBlocked: 'Blocked',
    // Announced as well as shown: a button's own label changing is not
    // something a screen reader reports on its own.
    copiedAnnouncement: (value) => `${value} copied`,
    copyBlockedAnnouncement: 'Copying is blocked in this browser',
    undo: 'Undo',
    deleted: 'Deleted.',
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
    arrivalLinesByTheme: {
        retro: ['KP Modular BIOS v4.51PG', 'kp-themes 95 — retro build', 'Memory Test : {count}K'],
        terminal: ['KP-THEMES BIOS v5.0.0', 'MEMORY TEST ......... 640K OK', 'PHOSPHOR PROFILE .... terminal', 'CRT WARM-UP ......... OK', 'READY.'],
    },
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
    chartOnePoint: 'Only one reading so far: the line grows as more readings arrive.',
    chartLoading: 'Loading the readings…',
    chartPinnedOutside: '(pinned, outside the window)',
    // A menu button's menu [scope-143].
    menuLoading: 'Loading the actions…',
    menuEmpty: 'Nothing to do here right now.',
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
    calendarNav: 'Month',
    calendarPrev: '‹ Prev',
    calendarNext: 'Next ›',
    calendarToday: 'Today',
    calendarTodayTitle: 'Show this month and select today',
    calendarDay: (date, label) => `${date}: ${label}`,
    calendarFuture: 'a day still to come',
    calendarLoading: 'being read',
    calendarUnknown: 'nothing known about this day',
    // The network graph [scope-143]: its own words; the nodes, kinds and
    // the sentences of its states are the page's.
    graphShowAll: 'Show all',
    graphShowAllTitle: 'Clear the selection and show every kind of link again',
    graphHint:
        'Hover or focus a node to see only its links. Click it, or press Enter, to keep it picked; pick several the same way. Arrow keys move between nodes; Esc shows all.',
    graphKinds: 'Kinds of link',
    graphLoading: 'Reading the network…',
    graphUnnamed: 'Graph',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pagination',
    themePicker: 'Choose a theme',
    themeSaveFailed: 'This choice will not be remembered — storage is blocked in this browser.',
    themeSaveRefused: 'Not saved on the server — your choice has been put back.',
    /** The two contract violations enforceContracts reports [DI10, DI4]. */
    contractDestructive:
        'A destructive action must offer an undo (data-kp-undo) or a confirmation (data-kp-confirm="phrase"). SC 3.3.4 accepts either; it accepts neither of them missing.',
    contractSemantic: 'A control carrying a semantic colour must also say what it means: colour is never the only carrier.',
    /** The two sections of a grouped theme picker [TH63]. */
    themeGroupLight: 'Light',
    themeGroupDark: 'Dark',
    /**
     * The loud fallback and the diagnostics page [TH97, AR25].
     *
     * The console warning is in here for the same reason the rest is: a
     * consumer whose users are not English speakers should be able to
     * replace it, and a message written into theme-core.js has no door.
     */
    themeUnknown: (requested, applied) =>
        `kp-themes: "${requested}" is not a theme this build knows, so "${applied}" was applied instead. The stored choice was left alone; open the diagnostics page to see which half is behind.`,
    rememberClash: (name, component) =>
        `kp-themes: two ${component} elements both ask to be remembered as "${name}", so only the first one is. Give the second a data-kp-remember of its own.`,
    registerLoadFailed: (theme, href) =>
        `kp-themes: the register for "${theme}" did not load from ${href}, so the page keeps the theme it was wearing. Check the pattern given to attachLazyRegisters().`,
    diagnosticsHeading: 'Stylesheet and JavaScript, side by side',
    diagnosticsStylesheet: 'Stylesheet (css/themes.css)',
    diagnosticsScript: 'JavaScript (js/theme-registry.js)',
    diagnosticsVersion: 'Version',
    diagnosticsThemes: 'Themes',
    diagnosticsEffects: 'Unknown effect hooks',
    diagnosticsEffectsNone: 'none reported on this page',
    diagnosticsVerdict: 'Verdict',
    diagnosticsMatch: 'The stylesheet and the JavaScript come from the same version, and they know the same themes.',
    diagnosticsStylesheetBehind: (stylesheet, script) =>
        `The stylesheet is behind: it is version ${stylesheet} and the JavaScript is version ${script}. Copy a newer css/themes.css.`,
    diagnosticsScriptBehind: (stylesheet, script) =>
        `The JavaScript is behind: the stylesheet is version ${stylesheet} and the JavaScript is version ${script}. Copy newer files from js/.`,
    diagnosticsThemesDiffer: (version) =>
        `Both halves say version ${version} and yet they know different themes, so at least one of the two files has been edited by hand.`,
    diagnosticsNoVersion:
        'The stylesheet declares no version, so it was generated before 3.2.0 — older than the JavaScript beside it, whatever that one says.',
    diagnosticsOnlyInStylesheet: (names) => `Only the stylesheet has: ${names}`,
    diagnosticsOnlyInScript: (names) => `Only the JavaScript has: ${names}`,
    diagnosticsUnknownVersion: 'not declared',
});

// STRINGS_NL was removed in 4.0.0 [D3]. Kenny decided that on
// 2026-09-05: the Dutch set left js/strings.js and index.js. It was a
// bridge for the three consumers who read Dutch until 2.0.0, and
// removing an export is a breaking change, so it waited for a major.
// S20 keeps it reachable: the v2.0.0 and v3.0.0 tags still carry the
// seventy-two lines verbatim, and MIGRATION.md says where.

/** @type {Strings} */
let current = DEFAULT_STRINGS;

/**
 * Replace some or all of the strings, for the framework-free channel and
 * for anything that reads them outside React.
 *
 * Merged rather than replaced: a consumer that wants one word does not
 * have to restate the other seventy, and a key added in a later version
 * keeps working instead of becoming `undefined` on their page.
 *
 * @param {Partial<Strings>} next
 * @returns {Strings} the merged result
 */
export function setStrings(next) {
    current = Object.freeze({ ...current, ...next });
    if (typeof document !== 'undefined') applyStringProperties(document.documentElement, current);
    return current;
}

/** The noise a deciphered word starts from, seven glyphs. */
const CIPHER = '#&$?%@/';

/**
 * The words the stylesheets draw themselves, as custom properties
 * [scope-143]. A keyframe cannot read this module, so the word a busy
 * picture spells reaches it as `--kp-loading-word-0` to `-7`: the eight
 * ticks of cyberpunk's decipher, from all noise to the whole word. The
 * register keeps the English as each property's fallback, so a page that
 * never calls `setStrings()` draws what it always drew.
 *
 * @param {Strings} [strings] the strings to draw from, the current ones by default
 * @returns {Record<string, string>} property name to a CSS string value
 */
export function stringProperties(strings = current) {
    const word = strings.loadingWord;
    /** @type {Record<string, string>} */
    const out = {};
    for (let tick = 0; tick <= 7; tick++) {
        const shown = Math.round((tick * word.length) / 7);
        const turn = (tick * 5) % CIPHER.length;
        const noise = (CIPHER.slice(turn) + CIPHER.slice(0, turn)).repeat(Math.ceil(word.length / CIPHER.length) + 1);
        out[`--kp-loading-word-${tick}`] = JSON.stringify(word.slice(0, shown) + noise.slice(0, word.length - shown));
    }
    return out;
}

/**
 * Write `stringProperties()` onto an element, so every stylesheet under it
 * draws the consumer's words. `setStrings()` does this on the document
 * root; call it yourself for a subtree that speaks another language.
 *
 * @param {HTMLElement} root
 * @param {Strings} [strings]
 */
export function applyStringProperties(root, strings = current) {
    for (const [name, value] of Object.entries(stringProperties(strings))) root.style.setProperty(name, value);
}

/** @returns {Strings} the strings as they stand */
export function getStrings() {
    return current;
}

/**
 * The strings a component should use: the global ones, with anything the
 * caller passed layered on top.
 *
 * @param {Partial<Strings>} [overrides]
 * @returns {Strings}
 */
export function resolveStrings(overrides) {
    return overrides === undefined ? current : { ...current, ...overrides };
}
