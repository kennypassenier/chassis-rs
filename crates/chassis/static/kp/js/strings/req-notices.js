// The words of the request inspector and the notices.

/**
 * @typedef {object} ReqNoticesStrings
 * @property {string} contentsLabel  The accessible name of an on-this-page list (js/page-contents.js) [wish-1120]
 * @property {string} contentsTitle  The heading over an on-this-page list [wish-1120]
 * @property {(line: number, column: number) => string} codeFieldPosition  The caret's place under a code field, "Line 3, column 12" (js/code-field.js) [wish-1120]
 * @property {(line: number, column: number, message: string) => string} codeFieldError  The problem the page found in a code field, with its place [wish-1120]
 * @property {(line: number, message: string) => string} codeFieldErrorLine  The same when only the line is known [wish-1120]
 * @property {(message: string) => string} codeFieldErrorPlain  The same when no place is known [wish-1120]
 * @property {string} codeFieldBlocked  Why a form is held back while a code field has an error [wish-1120]
 * @property {string} jsonGutter  The accessible name of the line numbers [kpadopt5]
 * @property {string} jsonBlocked  The validity message that stops a form with broken JSON [kpadopt5]
 * @property {(why: string) => string} jsonSchemaFailed  The error line when the page's shape check refuses valid JSON [kpadopt5]
 * @property {string} jsonFormatted  Said after Format [kpadopt5]
 * @property {string} reqLabel  The accessible name of the request list (js/request-inspector.js) [kpadopt5]
 * @property {string} reqEmptyTitle  The empty list's heading [kpadopt5]
 * @property {string} reqEmptyText  Its sentence [kpadopt5]
 * @property {string} reqSendTest  Its button [kpadopt5]
 * @property {string} reqFailedTitle  The failed list's heading [kpadopt5]
 * @property {string} reqLoading  The busy card's words [kpadopt5]
 * @property {string} reqHeaders  The headers block's heading [kpadopt5]
 * @property {string} reqBody  The body block's title [kpadopt5]
 * @property {string} reqNoBody  A request without a body [kpadopt5]
 * @property {string} reqNoHeaders  A request without headers [kpadopt5]
 * @property {string} reqCopyCurl  Copy as curl [kpadopt5]
 * @property {string} reqCopyJson  Copy as JSON [kpadopt5]
 * @property {string} reqCopyBody  Copy the body [kpadopt5]
 * @property {string} reqCopyCurlSecrets  The separate button that copies the curl with the real secrets [kpadopt5]
 * @property {(what: string) => string} reqCopyDone  Said after a copy, "curl copied, secrets masked" is built from this and the next [kpadopt5]
 * @property {string} reqMaskedNote  Added to a copy that masked the secrets [kpadopt5]
 * @property {string} reqSecretShow  The button that shows one masked header on screen [kpadopt5]
 * @property {string} reqSecretHide  The same, once shown [kpadopt5]
 * @property {string} reqSecretMasked  What a screen reader hears for a masked value [kpadopt5]
 * @property {(n: number) => string} reqShowOlder  The button under the list, "Show 12 older" [kpadopt5]
 * @property {string} reqFilterLabel  The accessible name of the status filter [kpadopt5]
 * @property {string} reqFilterAll  The filter's first choice [kpadopt5]
 * @property {string} reqToneSuccess  The word beside a 2xx status [kpadopt5]
 * @property {string} reqToneInfo  The word beside a 3xx status [kpadopt5]
 * @property {string} reqToneWarning  The word beside a 4xx status [kpadopt5]
 * @property {string} reqToneError  The word beside a 5xx status [kpadopt5]
 * @property {string} reqToneNone  The word beside a request without a status [kpadopt5]
 * @property {string} reqSourceTest  The badge of a request the page sent itself [kpadopt5]
 * @property {(shown: number, total: number) => string} reqCount  The line above the list, "20 of 31 requests" [kpadopt5]
 * @property {string} reqNoMatch  The list when the filter shows nothing [kpadopt5]
 * @property {(method: string, path: string, status: string) => string} reqSummary  A request's accessible name [kpadopt5]
 * @property {string} noticesInbox  The counter button's word (js/notices.js) [kpadopt5-notices]
 * @property {string} noticesTitle  The panel's heading [kpadopt5-notices]
 * @property {string} noticesPageTitle  The Inbox page's heading [kpadopt5-notices]
 * @property {string} noticesList  The accessible name of the list of notices [kpadopt5-notices]
 * @property {(n: number) => string} noticesUnread  The counter's label, "5 unread" [kpadopt5-notices]
 * @property {string} noticesNoneUnread  The counter's label with nothing unread [kpadopt5-notices]
 * @property {(why: string) => string} noticesCounterError  The counter's label when the notices could not be read [kpadopt5-notices]
 * @property {(inbox: string, label: string, quiet: string) => string} noticesCounterName  The counter button's accessible name, "Inbox: 5 unread. Quiet until 09:00" [kpadopt5-notices]
 * @property {string} noticesLoading  What the busy card over the list says, and the counter's label while it loads [kpadopt5-notices]
 * @property {(time: string) => string} noticesQuiet  The quiet line, "Quiet until 09:00" [kpadopt5-notices]
 * @property {string} noticesEndQuiet  The button that ends the quiet time [kpadopt5-notices]
 * @property {string} noticesSinceVerb  The verb of a notice's age line, "since 2 min ago" [kpadopt5-notices]
 * @property {string} noticesMarkRead  The per-row button that marks a notice read [kpadopt5-notices]
 * @property {string} noticesMarkUnread  The per-row button that marks it unread again [kpadopt5-notices]
 * @property {string} noticesReadAll  The button that marks every notice read [kpadopt5-notices]
 * @property {(n: number) => string} noticesAllInInbox  The footer link, "All 37 in the Inbox", with the exact count [kpadopt5-notices]
 * @property {string} noticesEmpty  The empty plate's title [kpadopt5-notices]
 * @property {string} noticesEmptyText  Its sentence [kpadopt5-notices]
 * @property {string} noticesErrorTitle  The failed plate's title [kpadopt5-notices]
 * @property {string} noticesErrorText  Its sentence when the page gives no reason [kpadopt5-notices]
 * @property {string} noticesRetry  The failed plate's Retry button [kpadopt5-notices]
 * @property {string} noticesSources  The title of the per-source switches [kpadopt5-notices]
 * @property {string} noticesMuted  A muted source's state word [kpadopt5-notices]
 * @property {string} noticesNotMuted  A source that is on [kpadopt5-notices]
 * @property {(title: string) => string} noticesNew  Announced when one new notice arrived [kpadopt5-notices]
 * @property {(n: number, title: string) => string} noticesNewMany  Announced when several arrived, naming the worst [kpadopt5-notices]
 */

/** @type {ReqNoticesStrings} */
export const REQ_NOTICES_STRINGS = {
    contentsLabel: 'On this page',
    contentsTitle: 'On this page',
    codeFieldPosition: (line, column) => `Line ${line}, column ${column}`,
    codeFieldError: (line, column, message) => `Line ${line}, column ${column}: ${message}`,
    codeFieldErrorLine: (line, message) => `Line ${line}: ${message}`,
    codeFieldErrorPlain: (message) => message,
    codeFieldBlocked: 'Fix the marked line first',
    jsonGutter: 'Line numbers',
    jsonBlocked: 'Fix the JSON before sending.',
    jsonSchemaFailed: (why) => `Does not match the expected shape: ${why}`,
    jsonFormatted: 'Formatted',
    reqLabel: 'Captured requests',
    reqEmptyTitle: 'No requests captured yet',
    reqEmptyText: 'Send a test to see one.',
    reqSendTest: 'Send a test',
    reqFailedTitle: 'Could not read the requests',
    reqLoading: 'Reading the requests…',
    reqHeaders: 'Headers',
    reqBody: 'Body',
    reqNoBody: 'No body',
    reqNoHeaders: 'No headers',
    reqCopyCurl: 'Copy as curl',
    reqCopyJson: 'Copy as JSON',
    reqCopyBody: 'Copy body',
    reqCopyCurlSecrets: 'Copy curl with secrets',
    reqCopyDone: (what) => `${what} copied`,
    reqMaskedNote: 'secrets masked',
    reqSecretShow: 'Show',
    reqSecretHide: 'Hide',
    reqSecretMasked: 'hidden value',
    reqShowOlder: (n) => `Show ${n} older`,
    reqFilterLabel: 'Status',
    reqFilterAll: 'All',
    reqToneSuccess: 'Success',
    reqToneInfo: 'Redirect',
    reqToneWarning: 'Client error',
    reqToneError: 'Server error',
    reqToneNone: 'No answer',
    reqSourceTest: 'test',
    reqCount: (shown, total) => (shown === total ? `${total} requests` : `${shown} of ${total} requests`),
    reqNoMatch: 'No request matches this filter.',
    reqSummary: (method, path, status) => `${method} ${path}, ${status}`,
    // kpadopt5-ops:notices:start
    // The notification centre (js/notices.js) [kpadopt5-ops].
    noticesInbox: 'Inbox',
    noticesTitle: 'Notifications',
    noticesPageTitle: 'Inbox',
    noticesList: 'Notifications',
    noticesUnread: (n) => `${n} unread`,
    noticesNoneUnread: 'none unread',
    noticesCounterError: (why) => `could not be read: ${why}`,
    noticesCounterName: (inbox, label, quiet) => `${inbox}: ${label}${quiet ? `. ${quiet}` : ''}`,
    noticesLoading: 'Reading the notifications…',
    noticesQuiet: (time) => `Quiet until ${time}`,
    noticesEndQuiet: 'End quiet',
    noticesSinceVerb: 'since',
    noticesMarkRead: 'Mark read',
    noticesMarkUnread: 'Mark unread',
    noticesReadAll: 'Mark all read',
    noticesAllInInbox: (n) => `All ${n} in the Inbox`,
    noticesEmpty: 'Nothing waiting',
    noticesEmptyText: 'Nothing needs you right now.',
    noticesErrorTitle: 'The notifications could not be read',
    noticesErrorText: 'The host did not answer. Nothing was lost.',
    noticesRetry: 'Retry',
    noticesSources: 'Sources',
    noticesMuted: 'Muted',
    noticesNotMuted: 'On',
    noticesNew: (title) => `New: ${title}`,
    noticesNewMany: (n, title) => `${n} new notifications, the worst: ${title}`,
};
