// The words of availability, QR codes and the time field.

/**
 * @typedef {object} AvailabilityQrTimeStrings
 * @property {(n: number) => string} availabilityDaysLong  A proposed period's length under its dates (js/availability.js) [kpadopt6]
 * @property {string} availabilityYes  The answer yes, in a cell's name, the legend and the list (js/availability.js) [kpadopt6]
 * @property {string} availabilityMaybe  The answer maybe (js/availability.js) [kpadopt6]
 * @property {string} availabilityNo  The answer no (js/availability.js) [kpadopt6]
 * @property {string} availabilityNone  A cell nobody filled (js/availability.js) [kpadopt6]
 * @property {string} availabilityNobodyAnswered  The line over a grid nobody has answered (js/availability.js) [kpadopt6]
 * @property {(yes: number, total: number) => string} availabilityCount  One column's exact count (js/availability.js) [kpadopt6]
 * @property {(n: number, total: number) => string} availabilityAnswered  The line over the grid (js/availability.js) [kpadopt6]
 * @property {(labels: string, count: string) => string} availabilityBestLine  The best column in words (js/availability.js) [kpadopt6]
 * @property {string} availabilityChoose  The button on the best column (js/availability.js) [kpadopt6]
 * @property {string} availabilityUnitLabel  The organiser's switch between periods and days (js/availability.js) [kpadopt6]
 * @property {string} availabilityByPeriod  Its first choice (js/availability.js) [kpadopt6]
 * @property {string} availabilityByDay  Its second choice (js/availability.js) [kpadopt6]
 * @property {string} availabilityFailedTitle  The failed plate's heading (js/availability.js) [kpadopt6]
 * @property {string} availabilityFailedText  Its sentence (js/availability.js) [kpadopt6]
 * @property {string} availabilityEmptyTitle  The empty plate's heading (js/availability.js) [kpadopt6]
 * @property {string} availabilityEmptyText  Its sentence (js/availability.js) [kpadopt6]
 * @property {string} availabilityRetry  The failed plate's button (js/availability.js) [kpadopt6]
 * @property {string} availabilityGroup  The grid's name when the page gives none (js/availability.js) [kpadopt6]
 * @property {string} availabilitySummaryLabel  The summary row's name (js/availability.js) [kpadopt6]
 * @property {(name: string) => string} availabilityYou  Your own row's name (js/availability.js) [kpadopt6]
 * @property {string} availabilityBestWord  The legend's word for the best column (js/availability.js) [kpadopt6]
 * @property {(name: string, column: string, answer: string) => string} availabilityCell  A cell's name for a screen reader (js/availability.js) [kpadopt6]
 * @property {(label: string) => string} availabilityNotSaved  The line when a change was refused (js/availability.js) [kpadopt6]
 * @property {(label: string) => string} availabilityEveryone  Said when a column becomes complete (js/availability.js) [kpadopt6]
 * @property {(yes: number, maybe: number, no: number) => string} availabilityYourAnswers  Said after a stroke (js/availability.js) [kpadopt6]
 * @property {(n: number) => string} availabilityStroke  The toast after a stroke (js/availability.js) [kpadopt6]
 * @property {(name: string, label: string, word: string) => string} availabilityCellSaid  Said after one cell changed (js/availability.js) [kpadopt6]
 * @property {string} availabilityClear  The menu entry that empties a cell (js/availability.js) [kpadopt6]
 * @property {string} availabilityKeyYes  The shortcut sheet's line for y (js/availability.js) [kpadopt6]
 * @property {string} availabilityKeyMaybe  The line for m (js/availability.js) [kpadopt6]
 * @property {string} availabilityKeyNo  The line for n (js/availability.js) [kpadopt6]
 * @property {string} availabilityKeyClear  The line for Backspace (js/availability.js) [kpadopt6]
 * @property {string} availabilityKeyGroup  The sheet's heading (js/availability.js) [kpadopt6]
 * @property {string} availabilityKeyReason  Why those keys do nothing now (js/availability.js) [kpadopt6]
 * @property {string} availabilityDisabled  Why every cell is inert when the page gives no reason (js/availability.js) [kpadopt6]
 * @property {string} qrLabel  The code's accessible name (js/qr.js) [kpadopt6]
 * @property {string} qrReady  Said once, politely, when the code is drawn (js/qr.js) [kpadopt6]
 * @property {string} qrTooLongTitle  The failed plate's heading (js/qr.js) [kpadopt6]
 * @property {string} qrTooLongText  Its sentence (js/qr.js) [kpadopt6]
 * @property {string} qrEmptyTitle  The empty plate's heading (js/qr.js) [kpadopt6]
 * @property {string} qrEmptyText  Its sentence (js/qr.js) [kpadopt6]
 * @property {string} qrExpired  The plate of a link whose time ran out (js/qr.js) [kpadopt6]
 * @property {string} qrExpiredText  Its sentence (js/qr.js) [kpadopt6]
 * @property {string} qrHidden  The cover of a code that waits to be shown (js/qr.js) [kpadopt6]
 * @property {string} qrShow  The cover's button (js/qr.js) [kpadopt6]
 * @property {string} qrHide  The button that covers a shown code again (js/qr.js) [kpadopt6]
 * @property {string} qrLoading  The words under the busy card while the link is made (js/qr.js) [kpadopt6]
 * @property {string} qrCopy  The Copy button (js/qr.js) [kpadopt6]
 * @property {string} qrCopied  Its result word (js/qr.js) [kpadopt6]
 * @property {string} qrCopyFailed  Its refusal word (js/qr.js) [kpadopt6]
 * @property {string} qrNoLink  Why Copy is off without a link (js/qr.js) [kpadopt6]
 * @property {string} qrCopyOff  Why Copy is off while the code is not ready (js/qr.js) [kpadopt6]
 * @property {string} qrDownloadPng  The download button for a picture (js/qr.js) [kpadopt6]
 * @property {string} qrDownloadSvg  The download button for a vector file (js/qr.js) [kpadopt6]
 * @property {(bytes: number) => string} qrDense  The warning under a long link (js/qr.js) [kpadopt6]
 * @property {string} qrRetry  The failed plate's button (js/qr.js) [kpadopt6]
 * @property {string} qrKey  The shortcut sheet's line for Shift C (js/qr.js) [kpadopt6]
 * @property {string} qrKeyGroup  The sheet's heading (js/qr.js) [kpadopt6]
 * @property {string} qrKeyReason  Why the key does nothing now (js/qr.js) [kpadopt6]
 * @property {string} timeChoose  The button that opens the list of times, and the sheet's title when the field has no name (js/timefield.js) [kpadopt6]
 * @property {string} timeRequired  The line under an empty required field (js/timefield.js) [kpadopt6]
 * @property {string} timeInvalid  The line under a text that is not a time (js/timefield.js) [kpadopt6]
 * @property {(min: string, max: string) => string} timeOutside  The line under a time outside the window (js/timefield.js) [kpadopt6]
 * @property {(value: string) => string} timeConverted  The polite line after a 12 hour time was pasted (js/timefield.js) [kpadopt6]
 * @property {(value: string) => string} timeSaid  What is said after the value changed (js/timefield.js) [kpadopt6]
 * @property {string} timePresets  The name of the group of preset chips (js/timefield.js) [kpadopt6]
 * @property {string} timePresetsFailed  The compact plate when presets failed (js/timefield.js) [kpadopt6]
 * @property {string} timeRetry  Its button (js/timefield.js) [kpadopt6]
 * @property {string} timeList  The list's name for a screen reader (js/timefield.js) [kpadopt6]
 * @property {string} timeNone  The list's entry that clears the field (js/timefield.js) [kpadopt6]
 * @property {string} timeNow  The note on the list's entry for the current time (js/timefield.js) [kpadopt6]
 * @property {(busy: string) => string} timeNear  The mark on a time close to a busy moment (js/timefield.js) [kpadopt6]
 * @property {(zone: string) => string} timeZoneNote  The quiet line that says whose clock the time is (js/timefield.js) [kpadopt6]
 * @property {(value: string) => string} timeWrappedNext  Said when stepping up went past midnight (js/timefield.js) [kpadopt6]
 * @property {(value: string) => string} timeWrappedPrevious  Said when stepping down went past midnight (js/timefield.js) [kpadopt6]
 */

/** @type {AvailabilityQrTimeStrings} */
export const AVAILABILITY_QR_TIME_STRINGS = {
    // Availability (js/availability.js) [kpadopt6].
    availabilityDaysLong: (n) => `${n} ${n === 1 ? 'day' : 'days'}`,
    availabilityYes: 'Can',
    availabilityMaybe: 'Maybe',
    availabilityNo: 'Cannot',
    availabilityNone: 'No answer',
    availabilityNobodyAnswered: 'Nobody answered yet',
    availabilityCount: (yes, total) => `${yes} of ${total} can`,
    availabilityAnswered: (n, total) => `${n} of ${total} answered`,
    availabilityBestLine: (labels, count) => `Best: ${labels}, ${count}`,
    availabilityChoose: 'Choose these dates',
    availabilityUnitLabel: 'Columns are',
    availabilityByPeriod: 'Periods',
    availabilityByDay: 'Days',
    availabilityFailedTitle: 'Could not read who can come',
    availabilityFailedText: 'The answers could not be loaded.',
    availabilityEmptyTitle: 'No dates proposed yet',
    availabilityEmptyText: 'Once dates are proposed, everybody can say which ones suit them.',
    availabilityRetry: 'Retry',
    availabilityGroup: 'Who can come',
    availabilitySummaryLabel: 'Who can',
    availabilityYou: (name) => `${name} (you)`,
    availabilityBestWord: 'Best choice',
    availabilityCell: (name, column, answer) => `${name}, ${column}${answer ? `: ${answer}` : ''}`,
    availabilityNotSaved: (label) => `Not saved: ${label}`,
    availabilityEveryone: (label) => `${label}: everyone can`,
    availabilityYourAnswers: (yes, maybe, no) => `Your answers: ${yes} can, ${maybe} maybe, ${no} cannot`,
    availabilityStroke: (n) => `${n} cells set`,
    availabilityCellSaid: (name, label, word) => `${name}, ${label}: ${word}`,
    availabilityClear: 'Clear',
    availabilityKeyYes: 'Can come, on the focused cell of your row',
    availabilityKeyMaybe: 'Maybe',
    availabilityKeyNo: 'Cannot come',
    availabilityKeyClear: 'Clear the answer',
    availabilityKeyGroup: 'In the availability grid',
    availabilityKeyReason: 'Move to a cell of your own row first.',
    availabilityDisabled: 'The dates are chosen.',
    // Qr (js/qr.js) [kpadopt6].
    qrLabel: 'QR code for this link',
    qrReady: 'QR code ready for this link',
    qrTooLongTitle: 'This link is too long for a QR code',
    qrTooLongText: 'Copy the link below instead.',
    qrEmptyTitle: 'No link yet',
    qrEmptyText: 'Once the link exists, its QR code shows here.',
    qrExpired: 'Expired',
    qrExpiredText: 'This link no longer works.',
    qrHidden: 'QR code hidden',
    qrShow: 'Show QR code',
    qrHide: 'Hide QR code',
    qrLoading: 'Making the link…',
    qrCopy: 'Copy link',
    qrCopied: 'Copied',
    qrCopyFailed: 'Not copied',
    qrNoLink: 'There is no link to copy yet.',
    qrCopyOff: 'This link cannot be copied now.',
    qrDownloadPng: 'Download PNG',
    qrDownloadSvg: 'Download SVG',
    qrDense: (bytes) => `This link is ${bytes} bytes long. The code gets dense and is harder to scan.`,
    qrRetry: 'Try again',
    qrKey: 'Copy the link of the focused QR code',
    qrKeyGroup: 'QR code',
    qrKeyReason: 'Put the focus on a QR code that has a link first.',
    // Timefield (js/timefield.js) [kpadopt6].
    timeChoose: 'Choose a time',
    timeRequired: 'Choose a time.',
    timeInvalid: 'Use a time like 03:00',
    timeOutside: (min, max) => `Choose a time from ${min} to ${max}.`,
    timeConverted: (value) => `Read as ${value}. Times here use 24 hours.`,
    timeSaid: (value) => value,
    timePresets: 'Common times',
    timePresetsFailed: 'The common times could not be loaded.',
    timeRetry: 'Retry',
    timeList: 'Times',
    timeNone: 'No time',
    timeNow: 'Now',
    timeNear: (busy) => `near ${busy}`,
    timeZoneNote: (zone) => `Clock of the host, ${zone}`,
    timeWrappedNext: (value) => `${value}, the next day`,
    timeWrappedPrevious: (value) => `${value}, the day before`,
};
