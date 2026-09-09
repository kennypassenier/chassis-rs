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
 * @property {string} busy
 * @property {string} close
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
 * @property {string} tableSearch
 * @property {string} tableSearchLabel
 * @property {string} tableSelectAll
 * @property {(key: string) => string} tableSelectRow
 * @property {string} tableEmpty
 * @property {(n: number) => string} tableRows
 * @property {(shown: number, total: number) => string} tableRowsFiltered
 * @property {(at: number, of: number) => string} tablePage
 * @property {string} tableRegion
 * @property {string} formRequired
 * @property {string} formInvalid
 * @property {string} formSummaryOne
 * @property {(n: number) => string} formSummaryMany
 * @property {string} fieldFallbackName
 * @property {string} calendarOpen
 * @property {string} calendarButton
 * @property {string} dateFormatHint
 * @property {string} previousMonth
 * @property {string} nextMonth
 * @property {(month: string, year: number) => string} monthTitle
 * @property {string[]} weekdays
 * @property {string[]} months
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
 * @property {string} save
 * @property {string} mainNavigation
 * @property {string} skipToContent
 * @property {string} diagnosticsEffects  The diagnostics row that lists unknown hook values [AR44]
 * @property {string} diagnosticsEffectsNone
 * @property {string} classified  The stamp a register may print on an emphasis reveal (the dossier) [AR35]
 * @property {string} arrivalLine  The boot line of an arrival a theme performs (synthwave's CRT) [SW2]
 * @property {Record<string, string[]>} arrivalLinesByTheme  The lines a theme's own boot shows instead of that one line, in order, keyed by theme [S49, A11]. A `{count}` in a line is replaced by a number counting up to `--kp-arrival-count` (640 by default), which is how retro's memory test reads.
 * @property {string} arrivalProgress  The word before the percentage on that line
 * @property {string} arrivalReady  The word that closes the boot line
 * @property {string} arrivalSkip  The button that ends the arrival at once
 * @property {string} measureLoading  A live dimension label before the first measurement lands (blueprint) [S48]
 * @property {(px: number) => string} measureWidth  The horizontal dimension label once measured (blueprint) [S48]
 * @property {(px: number) => string} measureHeight  The vertical dimension label once measured (blueprint) [S48]
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
    busy: 'Working…',
    close: 'Close',
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
    tableSearch: 'Search…',
    tableSearchLabel: 'Search the table',
    tableSelectAll: 'Select every visible row',
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
    formRequired: 'required',
    formInvalid: 'This field is not filled in correctly.',
    formSummaryOne: '1 field is not filled in correctly.',
    formSummaryMany: (n) => `${n} fields are not filled in correctly.`,
    fieldFallbackName: 'Field',
    calendarOpen: 'Open the calendar',
    calendarButton: 'Calendar',
    dateFormatHint: 'dd-mm-yyyy',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    /** The calendar's heading. A function, so a locale that writes the year first can. @param {string} month @param {number} year */
    monthTitle: (month, year) => `${month} ${year}`,
    weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
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
    save: 'Save',
    mainNavigation: 'Main navigation',
    skipToContent: 'Skip to the content',
    classified: 'Classified',
    arrivalLine: '▶ Calibrating neural uplink',
    arrivalLinesByTheme: {
        retro: ['KP Modular BIOS v4.51PG', 'kp-themes 95 — retro build', 'Memory Test : {count}K'],
        terminal: ['KP-THEMES BIOS v5.0.0', 'MEMORY TEST ......... 640K OK', 'PHOSPHOR PROFILE .... terminal', 'CRT WARM-UP ......... OK', 'READY.'],
    },
    arrivalProgress: 'Progress',
    arrivalReady: 'OK',
    arrivalSkip: 'Skip',
    measureLoading: 'measuring…',
    measureWidth: (px) => `${px}px measured · live`,
    measureHeight: (px) => `${px}px`,
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
    return current;
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
