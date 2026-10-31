// The words of forms, the date picker, upload, the wizard, copy buttons and secrets.

/**
 * @typedef {object} FormDateCopyStrings
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
 * @property {string} secretLabel  A secret field's name when the page gives none (js/patterns.js, `.kp-secret`) [kpadopt4]
 * @property {string} secretReveal  The button that shows a secret
 * @property {string} secretHide  The same button while the secret is shown
 * @property {string} secretHold  The button of a secret shown only while it is held (`data-kp-secret-reveal-on="hold"`)
 * @property {string} secretCopy  The button that copies a secret without showing it
 * @property {string} secretClipboardCleared  Said when a secret field emptied the clipboard again after its Copy (js/patterns.js) [wish-1120]
 * @property {string} secretReading  The words beside the spinner while a secret is fetched
 * @property {string} secretRetry  The reveal button's words after a secret could not be read
 * @property {(seconds: number) => string} secretHidesIn  The countdown under a shown secret, "Hides in 28 s"
 * @property {string} secretPaused  The countdown's words while the reader selects or holds the focus in the value
 * @property {string} secretStaysShown  The line under a shown secret that hides only when asked (`data-kp-secret-ttl="0"`)
 * @property {(seconds: number) => string} secretShown  What a screen reader hears when a secret is shown, "Shown. Hides in 30 s."
 * @property {string} secretHidden  What it hears when the secret is hidden again
 * @property {(reason: string) => string} secretFailed  The line under a secret that could not be read
 * @property {string} secretNoSource  The reason when a secret has no value, loader or listener to read it from
 * @property {string} secretPaste  The secret input's button that pastes the clipboard into the box [wish-1028]
 * @property {(count: number) => string} secretPasted  What a screen reader hears after Paste, "Pasted, 24 characters" [wish-1028]
 * @property {string} secretPasteBlocked  The line under a secret input when the browser refused to let the page read the clipboard [wish-1028]
 * @property {string} secretInputHint  The line under an empty secret input, "Typing is hidden" [wish-1028]
 * @property {(count: number) => string} secretInputCount  The line under a secret input that holds something, "24 characters, hidden" [wish-1028]
 */

/** @type {FormDateCopyStrings} */
export const FORM_DATE_COPY_STRINGS = {
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
    // The secret field [kpadopt4]: a masked value shown on request for a few seconds, copied without being shown.
    secretLabel: 'Secret',
    secretReveal: 'Reveal',
    secretHide: 'Hide',
    secretHold: 'Hold to reveal',
    secretCopy: 'Copy',
    secretClipboardCleared: 'Clipboard cleared',
    secretReading: 'Reading…',
    secretRetry: 'Try again',
    secretHidesIn: (seconds) => `Hides in ${seconds} s`,
    secretPaused: 'Paused while you select it',
    secretStaysShown: 'Shown until you hide it',
    secretShown: (seconds) => (seconds > 0 ? `Shown. Hides in ${seconds} s.` : 'Shown.'),
    secretHidden: 'Hidden again',
    secretFailed: (reason) => `Could not read it: ${reason}`,
    secretNoSource: 'there is nothing to read it from',
    secretPaste: 'Paste',
    secretPasted: (count) => `Pasted, ${count} ${count === 1 ? 'character' : 'characters'}`,
    secretPasteBlocked: 'The browser blocked Paste here. Click in the box and press Ctrl+V.',
    secretInputHint: 'Typing is hidden',
    secretInputCount: (count) => `${count} ${count === 1 ? 'character' : 'characters'}, hidden`,
};
