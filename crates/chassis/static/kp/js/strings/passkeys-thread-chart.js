// The words of the passkey list, the conversation thread and the first chart words.

/**
 * @typedef {object} PasskeysThreadChartStrings
 * @property {string} passkeysLoading  What the busy card over the sign-in methods says (js/passkeys.js) [kpadopt5-people]
 * @property {string} passkeysListLabel  The sign-in methods list's name for a screen reader
 * @property {string} passkeysEmptyTitle  The empty sign-in methods list
 * @property {string} passkeysEmptyText  Its sentence, what a passkey is for
 * @property {string} passkeysRegister  The Register button of the empty list
 * @property {string} passkeysError  A sign-in methods list that could not be read, when the page gives no sentence
 * @property {string} passkeysRetry  The Retry button of a failed list
 * @property {(kind: string) => string} passkeysKind  The word for a kind of way in: passkey, magic link, password, token
 * @property {(date: string) => string} passkeysAdded  When a way was added, "Added 12/10/2026"
 * @property {string} passkeysLastUsedVerb  The verb of the last-used line, "Last used" (then "3 days ago")
 * @property {string} passkeysNeverUsed  A way that was never used
 * @property {string} passkeysCurrent  The badge on the way this session signed in with
 * @property {string} passkeysCurrentTitle  Its tooltip
 * @property {(days: number) => string} passkeysUnused  The badge on a way unused for long, "Unused for 120 days"
 * @property {string} passkeysUnusedTitle  Its tooltip: a candidate to remove
 * @property {string} passkeysRename  The Rename button
 * @property {(label: string) => string} passkeysRenameOf  Rename, as a screen reader hears it with the way's name
 * @property {string} passkeysRenameLabel  The name field's label while renaming
 * @property {string} passkeysSave  Save a new name
 * @property {string} passkeysCancel  Leave renaming
 * @property {string} passkeysNameRequired  The line under a name left empty
 * @property {(label: string) => string} passkeysRenamed  Announced after a rename
 * @property {(why: string) => string} passkeysRenameRefused  A rename the server refused, with its reason
 * @property {string} passkeysRemove  The Remove button
 * @property {string} passkeysRemoving  The Remove button while it works
 * @property {(label: string) => string} passkeysRemoveOf  Remove, as a screen reader hears it with the way's name
 * @property {(label: string) => string} passkeysRemoveTitle  The confirmation's question, "Remove Work laptop?"
 * @property {(label: string) => string} passkeysLosesWay  The first line of what a removal loses
 * @property {string} passkeysLosesLast  What removing the only way in loses
 * @property {string} passkeysLosesCurrent  What removing the way in use loses
 * @property {(label: string) => string} passkeysRemoved  Announced after a removal
 * @property {(why: string) => string} passkeysRefused  A removal the server refused, "Not removed: why"
 * @property {string} passkeysRefusedFallback  The reason when a refusal gave none
 * @property {string} passkeysLastWay  The reason Remove is off on the only way in, and what to do first
 * @property {string} passkeysOnlyWay  The short note in the place of Remove on the only way in (the `note` look)
 * @property {string} passkeysLastWayWarn  The warning on the only way in when removing it is allowed
 * @property {string} passkeysInsecureTitle  The warning heading when the page is not secure
 * @property {string} passkeysInsecureText  What to do about it
 * @property {string} threadLoading  What the busy card over a conversation says (js/thread.js) [kpadopt5-people]
 * @property {string} threadLabel  The conversation's name for a screen reader
 * @property {string} threadEmptyTitle  The empty conversation
 * @property {string} threadEmptyText  Its sentence
 * @property {string} threadAdd  The Add button of the empty conversation
 * @property {string} threadError  A conversation that could not be read, when the page gives no sentence
 * @property {string} threadRetry  The Retry button of a failed conversation, and of a message not sent
 * @property {string} threadYou  The sender of an outgoing message with no name
 * @property {string} threadUnknownSender  The sender of an incoming message with no name
 * @property {(sender: string, moment: string) => string} threadBubbleLabel  A message's label, "From Acme HR, 13/10/2026 14:02"
 * @property {(weekday: string, date: string) => string} threadDay  A day divider, "Monday 13/10/2026"
 * @property {(count: number) => string} threadAttachments  The attachments list's name, "2 attachments"
 * @property {(lines: number) => string} threadShowAll  The button under a folded message, "Show all 48 lines"
 * @property {string} threadShowLess  The same button when the message is whole
 * @property {string} threadCopy  The Copy text button of a message
 * @property {(sender: string) => string} threadCopyOf  Copy, as a screen reader hears it with the sender
 * @property {string} threadCopyFailed  The Copy button when the clipboard refused
 * @property {string} threadSending  The line on a message being sent
 * @property {(why: string) => string} threadNotSent  The line on a message that was not sent, "Not sent: why"
 * @property {string} threadNotSentFallback  The reason when none was given
 * @property {string} threadJump  The Jump to newest button
 * @property {string} chartMedian  The words in front of a median's value, "median" (js/chart.js) [kpadopt5-people]
 * @property {(have: number, need: number, unit: string) => string} chartFew  The sentence over a chart with too few readings, "3 of 7 days needed before a trend means something"
 * @property {string} chartFewUnit  What the readings are called in it when the page names none
 * @property {string} chartAnnotationKey  The key above a chart's plot, for a screen reader
 * @property {(tone: string) => string} chartKindTone  The key's word for an event that has a tone and no kind
 * @property {string} chartRunsKey  The key's note on a ringed run
 * @property {(label: string, from: string, until: string) => string} chartMarkBand  The tooltip of a band, "Maintenance, from … to …"
 * @property {(from: string, until: string) => string} chartBandWhen  The time of a band in the tooltip, "14:00 to 15:30"
 * @property {(count: number) => string} chartEdgeBefore  The arrow for events before the window, "2 events before this window"
 * @property {(count: number) => string} chartEdgeAfter  The arrow for events after the window
 * @property {(kind: string) => string} chartKindOn  A key item's tooltip, "Show or hide update events"
 */

/** @type {PasskeysThreadChartStrings} */
export const PASSKEYS_THREAD_CHART_STRINGS = {
    passkeysLoading: 'Reading your ways to sign in…',
    passkeysListLabel: 'Ways to sign in',
    passkeysEmptyTitle: 'No passkey registered yet',
    passkeysEmptyText: 'Register one to sign in with your fingerprint, your face or your device PIN.',
    passkeysRegister: 'Register a passkey',
    passkeysError: 'Your ways to sign in could not be read.',
    passkeysRetry: 'Retry',
    passkeysKind: (kind) => ({ passkey: 'Passkey', 'magic-link': 'Magic link', password: 'Password', token: 'Token' })[kind] ?? kind,
    passkeysAdded: (date) => `Added ${date}`,
    passkeysLastUsedVerb: 'Last used',
    passkeysNeverUsed: 'Never used',
    passkeysCurrent: 'This device',
    passkeysCurrentTitle: 'You are signed in with this one',
    passkeysUnused: (days) => `Unused for ${days} days`,
    passkeysUnusedTitle: 'Not used for a long time: a candidate to remove',
    passkeysRename: 'Rename',
    passkeysRenameOf: (label) => `Rename ${label}`,
    passkeysRenameLabel: 'Name',
    passkeysSave: 'Save',
    passkeysCancel: 'Cancel',
    passkeysNameRequired: 'Give it a name.',
    passkeysRenamed: (label) => `Renamed to ${label}`,
    passkeysRenameRefused: (why) => `Not renamed: ${why}`,
    passkeysRemove: 'Remove',
    passkeysRemoving: 'Removing…',
    passkeysRemoveOf: (label) => `Remove ${label}`,
    passkeysRemoveTitle: (label) => `Remove ${label}?`,
    passkeysLosesWay: (label) => `The way to sign in called "${label}"`,
    passkeysLosesLast: 'Your only way to sign in: afterwards you cannot get in.',
    passkeysLosesCurrent: 'The way you are signed in with right now.',
    passkeysRemoved: (label) => `${label} removed`,
    passkeysRefused: (why) => `Not removed: ${why}`,
    passkeysRefusedFallback: 'the server refused it.',
    passkeysLastWay: 'This is your only way to sign in. Add another way first, then remove this one.',
    passkeysOnlyWay: 'Your only way in',
    passkeysLastWayWarn: 'This is your only way to sign in. Removing it locks you out.',
    passkeysInsecureTitle: 'Passkeys need a secure connection',
    passkeysInsecureText: 'Open this page at its https address. Until then you can still sign in another way.',
    threadLoading: 'Reading the conversation…',
    threadLabel: 'Conversation',
    threadEmptyTitle: 'No messages yet',
    threadEmptyText: 'Messages you send and receive show up here.',
    threadAdd: 'Add a message',
    threadError: 'The conversation could not be read.',
    threadRetry: 'Retry',
    threadYou: 'You',
    threadUnknownSender: 'someone',
    threadBubbleLabel: (sender, moment) => `From ${sender}, ${moment}`,
    threadDay: (weekday, date) => `${weekday} ${date}`,
    threadAttachments: (count) => `${count} ${count === 1 ? 'attachment' : 'attachments'}`,
    threadShowAll: (lines) => `Show all ${lines} lines`,
    threadShowLess: 'Show less',
    threadCopy: 'Copy text',
    threadCopyOf: (sender) => `Copy the text of the message from ${sender}`,
    threadCopyFailed: 'Not copied',
    threadSending: 'Sending…',
    threadNotSent: (why) => `Not sent: ${why}`,
    threadNotSentFallback: 'no connection.',
    threadJump: 'Jump to newest',
    chartMedian: 'median',
    chartFew: (have, need, unit) => `${have} of ${need} ${unit} needed before a trend means something`,
    chartFewUnit: 'readings',
    chartAnnotationKey: 'Chart markers',
    chartKindTone: (tone) => ({ info: 'Event', warning: 'Warning', critical: 'Failure' })[tone] ?? tone,
    chartRunsKey: 'a run of six or more points on one side of the median',
    chartMarkBand: (label, from, until) => `${label}, from ${from} to ${until}`,
    chartBandWhen: (from, until) => `${from} to ${until}`,
    chartEdgeBefore: (count) => `${count} ${count === 1 ? 'event' : 'events'} before this window`,
    chartEdgeAfter: (count) => `${count} ${count === 1 ? 'event' : 'events'} after this window`,
    chartKindOn: (kind) => `Show or hide: ${kind}`,
};
