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
 * @property {string} toggleCounting  The count's name while it is still being counted (js/toggle.js) [kpadopt6-ops]
 * @property {(label: string, count: number | null) => string} toggleOn  The line said once a toggle is switched on, "Only errors on, 12 shown" [kpadopt6-ops]
 * @property {(label: string, count: number | null) => string} toggleOff  The line said once it is switched off [kpadopt6-ops]
 * @property {(label: string, n: number) => string} toggleCount  The line said when the count beside a toggle changed (data-kp-announce="all") [kpadopt6-ops]
 * @property {(n: number) => string} toggleClear  The button that switches a group's toggles off, "Clear filters (2)" [kpadopt6-ops]
 * @property {string} toggleRefused  The word on a toggle whose change the app refused [kpadopt6-ops]
 * @property {(label: string) => string} toggleKeyWhat  What a toggle's key does in the shortcut sheet [kpadopt6-ops]
 * @property {string} toggleKeyGroup  The group a toggle's key is listed under in the shortcut sheet [kpadopt6-ops]
 * @property {string} intentNoMatch  What a palette says under "Nothing matches" when it knows nothing better [kpadopt6-ops]
 * @property {(name: string, verb: string, subjects: string[], noun: string) => string} intentNoSubject  A palette's line when the first word is a verb it knows but the rest names nothing it can act on [kpadopt6-ops]
 * @property {string} paletteNothing  The title of a palette's empty plate when no command answers [kpadopt6-ops]
 * @property {(shown: number, total: number) => string} paletteCapped  A palette's status line when more commands match than are shown [kpadopt6-ops]
 * @property {string} paletteLoading  The words under the spinner while a palette's commands are still arriving [kpadopt6-ops]
 * @property {string} paletteFailed  The title of a palette's plate when its commands could not be read [kpadopt6-ops]
 * @property {string} paletteFailedText  Its sentence when the page gives no reason [kpadopt6-ops]
 * @property {string} paletteRetry  Its action [kpadopt6-ops]
 * @property {string} versionMajor  The word on a chip whose first number rose, and in a count: "major" (js/version-delta.js) [kpadopt6-ops]
 * @property {string} versionMinor  The word for a second-number jump [kpadopt6-ops]
 * @property {string} versionPatch  The word for a jump in a later number [kpadopt6-ops]
 * @property {string} versionOther  The word for a change that has no numbers in it, such as a new digest [kpadopt6-ops]
 * @property {string} versionDowngrade  The word on a chip whose number fell [kpadopt6-ops]
 * @property {string} versionSame  The words when the two versions are the same [kpadopt6-ops]
 * @property {string} versionUnknown  The level of a chip whose versions cannot be compared [kpadopt6-ops]
 * @property {string} versionNoUpdates  The count's words when nothing is to be updated [kpadopt6-ops]
 * @property {string} versionLoading  A chip's name while the version is still being looked up [kpadopt6-ops]
 * @property {string} versionFailed  The words on a chip whose lookup failed [kpadopt6-ops]
 * @property {string} versionNone  The words where no version is tracked at all [kpadopt6-ops]
 * @property {string} versionNotes  A release-notes link's extra words for a screen reader [kpadopt6-ops]
 * @property {(from: string, to: string, level: string) => string} versionSpoken  What a screen reader hears for a jump, "from 10.11 to 12.1, major update" [kpadopt6-ops]
 * @property {(version: string) => string} versionSpokenSame  What it hears when nothing changes [kpadopt6-ops]
 * @property {(to: string) => string} versionSpokenTo  What it hears for a moving tag that only says where it goes [kpadopt6-ops]
 * @property {(from: string, to: string) => string} versionSpokenDown  What it hears for a version that went back [kpadopt6-ops]
 * @property {(from: string, to: string) => string} versionSpokenChanged  What a screen reader hears for a change that has no size, "changed from latest to nightly" [kpadopt6-ops]
 * @property {string} ackLink  The release-notes link's words on an acknowledge gate [kpadopt6-ops]
 * @property {string} ackLabel  The tick's words when the page names none [kpadopt6-ops]
 * @property {string} ackRetry  The Retry button of a gate whose notes could not be found [kpadopt6-ops]
 * @property {string} ackLooking  Why the tick is off while the notes are looked up [kpadopt6-ops]
 * @property {string} ackLocked  Why the tick is locked while the job runs [kpadopt6-ops]
 * @property {string} ackOpenFirst  Why the tick is off until the notes were opened [kpadopt6-ops]
 * @property {(label: string) => string} ackReason  Why the guarded button is off, with the tick's own words [kpadopt6-ops]
 * @property {(remaining: number, total: number) => string} ackReasonMany  Why it is off when several gates guard it, "2 of 3 release notes still to read" [kpadopt6-ops]
 * @property {string} ackEnabled  Said once when the last gate is ticked and the button comes on [kpadopt6-ops]
 * @property {(remaining: number) => string} ackDisabled  Said once when a tick is taken away [kpadopt6-ops]
 * @property {string} ackNoLink  A gate's line when no release notes link was found [kpadopt6-ops]
 * @property {(n: number) => string} deplistCount  The list's default heading, the exact count (js/deplist.js) [kpadopt6-ops]
 * @property {string} deplistReading  The heading while the rows are still being read [kpadopt6-ops]
 * @property {(from: string, to: string) => string} deplistNeeds  A row as a screen reader hears it, "paperless needs postgres" [kpadopt6-ops]
 * @property {(from: string, to: string) => string} deplistReaches  The same for a list that says what reaches what [kpadopt6-ops]
 * @property {string} deplistNeedsWord  The word between the names of a cycle, "paperless needs redis needs paperless" [kpadopt6-ops]
 * @property {(n: number) => string} deplistMore  The button that unfolds the rest, with the exact number of rows [kpadopt6-ops]
 * @property {string} deplistFewer  The button that folds it again [kpadopt6-ops]
 * @property {string} deplistEmpty  The empty plate's title when the page gives no sentence [kpadopt6-ops]
 * @property {string} deplistFailed  The failed plate's title [kpadopt6-ops]
 * @property {string} deplistFailedText  Its sentence when the page gives no reason [kpadopt6-ops]
 * @property {string} deplistRetry  Its action [kpadopt6-ops]
 * @property {string} deplistLoading  The words under the busy card's spinner [kpadopt6-ops]
 * @property {string} deplistRunning  The word for a needed thing that is running [kpadopt6-ops]
 * @property {string} deplistStopped  The word for a needed thing that is stopped [kpadopt6-ops]
 * @property {string} deplistUnknown  The word for a needed thing whose state is not known [kpadopt6-ops]
 * @property {string} deplistCopy  The button that copies the rows as text [kpadopt6-ops]
 * @property {string} deplistCopied  Its answer once the rows are on the clipboard [kpadopt6-ops]
 * @property {string} traceLabel  The hop list's accessible name [kpadopt6-ops]
 * @property {string} traceAllowed  The summary line when every hop lets the connection through [kpadopt6-ops]
 * @property {(hop: string, rule: string) => string} traceBlocked  The summary line when a hop refuses it, with the deciding rule when there is one [kpadopt6-ops]
 * @property {string} traceNotAll  The summary line when a hop could not be measured [kpadopt6-ops]
 * @property {string} traceAllowedWord  A hop's verdict word, allowed [kpadopt6-ops]
 * @property {string} traceRefusedWord  A hop's verdict word, refused [kpadopt6-ops]
 * @property {string} traceNotReached  The word for a hop after a refusal, which the connection never reaches [kpadopt6-ops]
 * @property {string} traceNotMeasured  The word for a hop whose verdict is not known [kpadopt6-ops]
 * @property {(rule: string) => string} traceRule  The deciding rule's chip, "Rule IoT to media" [kpadopt6-ops]
 * @property {string} traceRunning  The words under the busy card's spinner while the path is checked [kpadopt6-ops]
 * @property {string} traceEmpty  The empty plate's title before a question was asked [kpadopt6-ops]
 * @property {string} traceEmptyText  Its sentence [kpadopt6-ops]
 * @property {string} traceFailed  The failed plate's title [kpadopt6-ops]
 * @property {string} traceFailedText  Its sentence when the page gives no reason [kpadopt6-ops]
 * @property {string} traceRetry  Its action [kpadopt6-ops]
 * @property {string} traceCopy  The button that copies the trace as text [kpadopt6-ops]
 * @property {string} traceCopied  Its answer once the text is on the clipboard [kpadopt6-ops]
 * @property {string} traceSwap  The button that swaps source and target [kpadopt6-ops]
 * @property {string} traceKeySwap  What the swap key does in the shortcut sheet [kpadopt6-ops]
 * @property {string} traceKeyGroup  The group the swap key is listed under [kpadopt6-ops]
 * @property {(name: string) => string} entitySelect  A card's tick, named for a screen reader, "Select media" [kpadopt6-ops]
 * @property {string} entityFailed  The state word of a card that could not be read [kpadopt6-ops]
 * @property {string} entityNotMeasured  What a card says where it has nothing measured [kpadopt6-ops]
 * @property {(n: number) => string} entityMoreFlags  The "+2" button's accessible name [kpadopt6-ops]
 * @property {string} entityFlagsLabel  The name of the menu the "+2" opens [kpadopt6-ops]
 * @property {string} entityRetry  A failed card's or grid's Retry [kpadopt6-ops]
 * @property {string} entityMore  The button that opens the rest of a card's actions [kpadopt6-ops]
 * @property {string} entityMoreLabel  The name of that menu [kpadopt6-ops]
 * @property {string} entityLoading  The words under the busy card's spinner while the cards are read [kpadopt6-ops]
 * @property {string} entityGridFailed  The failed plate's title for a grid of cards [kpadopt6-ops]
 * @property {string} entityGridFailedText  Its sentence when the page gives no reason [kpadopt6-ops]
 * @property {string} entityGridEmpty  The empty plate's title for a grid with no cards [kpadopt6-ops]
 * @property {string} entityNew  The empty plate's action [kpadopt6-ops]
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
 * @property {string} stepPending  A step list's waiting step, as a screen reader hears it (js/steplist.js)
 * @property {string} stepRunning  The step being run
 * @property {string} stepDone  A finished step
 * @property {string} stepFailed  A step that failed
 * @property {string} stepSkipped  A step that was left out
 * @property {string} stepCurrent  The step a journey stands at now, neither running nor done (`data-state="current"`) [kpadopt4]
 * @property {(title: string, state: string) => string} stepAnnounce  What the list's status region says when a step changes, "Pull the images: running"
 * @property {string} statusOk  A status row that is fine, as a screen reader hears it (js/statusrow.js)
 * @property {string} statusLoading  A status row still being read
 * @property {string} statusFailed  A status row that failed
 * @property {string} statusEmpty  A status row with nothing to show
 * @property {string} statusWarn  A status row that passes with a reservation, `data-state="warn"` [kpadopt4-rows]
 * @property {string} cardLoading  What a loading card's busy card says under its spinner (js/card-state.js) [kpadopt4-rows]
 * @property {string} cardEmpty  An empty card's note when the page gives no title [kpadopt4-rows]
 * @property {string} cardFailed  A failed card's note when the page gives no title [kpadopt4-rows]
 * @property {string} cardRetry  The Try again button of a failed card [kpadopt4-rows]
 * @property {string} statusRetry  The Retry button of a failed status row
 * @property {(label: string) => string} statusRetryLabel  That button's accessible name, "Retry vault"
 * @property {(label: string, state: string, detail: string) => string} statusAnnounce  What the list's status region says when a row changes, "vault: failed, The host did not answer"
 * @property {(count: number, failed: number) => string} statusAnnounceMany  What it says when more than three rows change in one tick, "12 updated, 2 failed"
 * @property {string} facetOnly  The "only" button's text on a facet row (js/facets.js)
 * @property {(label: string) => string} facetOnlyLabel  That button's accessible name, "Show only Host"
 * @property {string} facetAll  The "Everything" row's text when the group gives none
 * @property {(label: string) => string} facetShowingOnly  What a facet group's status region says after "only", "Showing only Host"
 * @property {string} facetShowingAll  What it says after "Everything"
 * @property {string} idmarkUnknown  The glyph of an identity mark with no name (js/idmark.js) [kpadopt4-data]
 * @property {string} idmarkOnline  A mark's status word, online (js/idmark.js) [kpadopt5-people]
 * @property {string} idmarkAway  A mark's status word, away
 * @property {string} idmarkBusy  A mark's status word, busy
 * @property {(name: string, status: string) => string} idmarkLabel  A mark with a status as a screen reader hears it, "Ada, online"
 * @property {(count: number) => string} idmarkGroup  A group of marks, named by its size, "5 people"
 * @property {(count: number) => string} idmarkMore  The "+N" button of a group, "Show the 3 more people"
 * @property {(count: number) => string} idmarkMoreTitle  The heading of the list the "+N" opens, "3 more people"
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
 * @property {string} stackbarRest  The legend row of a share bar's free rest (js/stackbar.js)
 * @property {string} stackbarOther  The legend row the parts too small to draw are merged into
 * @property {(label: string, value: string, percent: string) => string} stackbarPart  One part, as a screen reader and the hover card read it
 * @property {(value: string) => string} stackbarOver  The free row when the parts add up to more than the whole
 * @property {(parts: string[]) => string} stackbarLabel  The bar's accessible name: every part in order
 * @property {string} stackbarLoading  A share bar being read
 * @property {string} stackbarEmpty  A share bar with nothing read yet
 * @property {string} stackbarError  A share bar that could not be read
 * @property {string} stackbarRetry  The Retry button of a failed share bar
 * @property {string} bulletsLoading  What the busy card over a bullet list says (js/bullets.js)
 * @property {string} bulletsEmpty  A bullet list with no rows, when the page gives no reason
 * @property {string} bulletsError  A bullet list that could not be read, when the page gives no sentence
 * @property {string} bulletsRetry  The Retry button of a failed bullet list
 * @property {string} bulletsUnknown  A row with nothing to measure, for a screen reader
 * @property {(figure: string, threshold: string) => string} bulletsValueText  A row's meter as a screen reader reads it
 * @property {string} codeLabel  A code block's accessible name when it has no title (js/code.js)
 * @property {string} codeWrap  The code block's Wrap toggle
 * @property {string} codePretty  The JSON view laid out with indents
 * @property {string} codeRaw  The JSON view as it came
 * @property {string} codeFormat  The accessible name of the Pretty / Raw choice
 * @property {(lines: number) => string} codeShowAll  The button under a folded block
 * @property {string} codeShowLess  The same button once the block is open
 * @property {(lines: number) => string} codeLines  The block's line count beside its title
 * @property {string} codeEmpty  A block with nothing in it
 * @property {(size: string) => string} codeBinary  A block whose content is not text
 * @property {(shown: string, total: string) => string} codeTruncated  The foot of a block that holds only the start
 * @property {string} codeLoading  What the busy card over a block says
 * @property {string} codeError  A block that could not be read, when the page gives no sentence
 * @property {(title: string) => string} codeCopiedAnnouncement  Announced after a copy, naming the block
 * @property {(n: number) => string} rowSelectCount  Said after a tick, a range or a clear: how many rows are selected (js/row-select.js) [kpadopt5]
 * @property {(n: number) => string} rowSelectSkipped  Said after a range that passed rows that cannot be selected [kpadopt5]
 * @property {(n: number) => string} rowSelectAllShown  Said after Ctrl+A: every row the table shows is ticked [kpadopt5]
 * @property {(label: string, at: number, of: number) => string} rowSelectCursor  Said when the cursor moves to a row, "INC-4471, row 3 of 12" [kpadopt5]
 * @property {string} rowSelectMode  Said when a long press starts selection mode on a phone [kpadopt5]
 * @property {string} rowSelectModeEnd  Said when selection mode ends [kpadopt5]
 * @property {string} rowKeysMove  The hint line under a selectable table: j and k [kpadopt5]
 * @property {string} rowKeysTick  The hint line: x [kpadopt5]
 * @property {string} rowKeysRange  The hint line: Shift and x [kpadopt5]
 * @property {string} rowKeysClear  The hint line: Esc [kpadopt5]
 * @property {string} rowKeysOpen  The hint line: Enter [kpadopt5]
 * @property {string} rowKeysAll  The hint line: Ctrl and A, when the table offers it [kpadopt5]
 * @property {string} selectionLabel  The accessible name of a selection bar (js/selection-bar.js) [kpadopt5]
 * @property {(n: number) => string} selectionCount  The bar's count, "3 selected" [kpadopt5]
 * @property {string} selectionClear  The bar's button that ticks nothing: it says what it does [kpadopt5]
 * @property {string} selectionClearTitle  Its tooltip, naming the key [kpadopt5]
 * @property {(n: number) => string} selectionMore  The names line when not every name fits, "+4 more" with the exact number [kpadopt5]
 * @property {string} selectionFewer  The same button once the whole list is open [kpadopt5]
 * @property {string} selectionActions  The phone's button that opens the bar's actions [kpadopt5]
 * @property {(total: number) => string} selectionMatching  The offer beyond what is shown, "Select all 312 that match" [kpadopt5]
 * @property {(total: number) => string} selectionMatchingOn  The bar's line once every match is selected [kpadopt5]
 * @property {(n: number) => string} selectionOnlyShown  The button that takes the offer back, "Select only the 40 shown" [kpadopt5]
 * @property {(words: string) => string} selectionBusy  Said when a bar action starts, "Backing up 3…" is the page's own words; this is the fallback [kpadopt5]
 * @property {(done: number, refused: number) => string} selectionResult  The bar's line after an action some rows refused, "2 done, 1 refused" [kpadopt5]
 * @property {(n: number) => string} selectionDropped  Said when selected rows are gone after a refresh [kpadopt5]
 * @property {(can: number, total: number) => string} selectionCan  The reason an action is off for some rows, "2 of 3 can be updated" with the page's verb after it [kpadopt5]
 * @property {string} selectionCleared  Said when the selection is cleared [kpadopt5]
 * @property {string} undoToastUndo  The Undo button of an undo toast (js/undo-toast.js) [kpadopt5]
 * @property {(key: string) => string} undoToastKeyTitle  Its tooltip, naming the key [kpadopt5]
 * @property {(text: string, seconds: number) => string} undoToastAnnounce  Said once when the toast opens, "Deleted. Undo available for 6 seconds" [kpadopt5]
 * @property {(seconds: number) => string} undoToastClock  The text clock, "5 s" [kpadopt5]
 * @property {string} undoToastRestored  The toast's line after an undo [kpadopt5]
 * @property {string} undoToastSaving  The toast's line while the commit is on its way [kpadopt5]
 * @property {(why: string) => string} undoToastFailed  The toast's line when the commit failed, "Not done: why" [kpadopt5]
 * @property {string} undoToastDismiss  The accessible name of the toast's close button [kpadopt5]
 * @property {string} newpillUnitOne  The word for one new row on a live list (js/newpill.js) [kpadopt5]
 * @property {string} newpillUnitMany  The word for several [kpadopt5]
 * @property {(n: number, unit: string) => string} newpillNew  The pill, "12 new lines" [kpadopt5]
 * @property {string} newpillBackTail  The pill's second half on a list that grows at the end [kpadopt5]
 * @property {string} newpillBackHead  The pill's second half on a list that grows at the top [kpadopt5]
 * @property {(n: number, unit: string) => string} newpillAnnounce  Said at most every ten seconds while the list is read elsewhere [kpadopt5]
 * @property {string} newpillPause  The toolbar button that stops following [kpadopt5]
 * @property {string} newpillResume  The toolbar button that follows again, shown while paused [kpadopt5]
 * @property {(time: string) => string} newpillSince  The divider at the first unseen row, "New since 14:32" [kpadopt5]
 * @property {string} newpillPausedNote  Said when following is paused [kpadopt5]
 * @property {string} newpillFollowing  Said when following resumes [kpadopt5]
 * @property {string} payloadEmpty  A payload cell with nothing in it (js/code.js, cell) [kpadopt5]
 * @property {(size: string) => string} payloadBinary  A payload cell that holds binary data, "binary, 2.1 kB" [kpadopt5]
 * @property {string} payloadOpen  The button that opens a long payload in a dialog [kpadopt5]
 * @property {string} payloadDownload  The link that downloads a binary payload when the page gives a URL [kpadopt5]
 * @property {(lines: number) => string} payloadShowAll  The cell's fold button, "Show all 40 lines" [kpadopt5]
 * @property {string} payloadCopyFull  The cell's copy button: it copies the whole value, folded or not [kpadopt5]
 * @property {(n: number) => string} jsonValidKeys  The quiet line under a valid object, "Valid JSON · 3 keys" [kpadopt5]
 * @property {(n: number) => string} jsonValidItems  The same for a list [kpadopt5]
 * @property {string} jsonValidValue  The same for a bare value [kpadopt5]
 * @property {(line: number, column: number, why: string) => string} jsonInvalid  The error line, "Line 3, column 12: expected ','" [kpadopt5]
 * @property {(why: string) => string} jsonInvalidPlain  The error line when the place is not known [kpadopt5]
 * @property {string} jsonPlainText  The line under text that is not JSON where plain text is allowed [kpadopt5]
 * @property {string} jsonEmpty  The line under an empty field [kpadopt5]
 * @property {string} jsonFormat  The Format button [kpadopt5]
 * @property {string} jsonMinify  The Minify button [kpadopt5]
 * @property {string} jsonWrap  The Wrap toggle [kpadopt5]
 * @property {string} jsonCopy  The Copy button [kpadopt5]
 * @property {string} jsonTabHint  The help line under the field: how to leave it with the keyboard [kpadopt5]
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
 * @property {string} toolbarShowingOnly  The word before the filters that are on, in a list toolbar's active row (js/toolbar.js) [kpadopt-controls]
 * @property {string} toolbarClearAll       The toolbar's button that turns every filter off [kpadopt-controls]
 * @property {string} keysLabel            The accessible name of a line of keyboard shortcuts (js/keys.js) [kpadopt-controls]
 * @property {string} heatLoading           What a heat grid's or matrix's cell says while its value is being read (js/heat.js) [kpadopt2-grids]
 * @property {string} heatEmpty             A heat grid or matrix with no rows [kpadopt2-grids]
 * @property {string} heatFailed            A heat grid or matrix that could not be read [kpadopt2-grids]
 * @property {string} matrixSelf            A matrix cell that pairs a row with itself, for a screen reader [kpadopt2-grids]
 * @property {string} matrixUnknown         A matrix cell with no answer, for a screen reader [kpadopt2-grids]
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
 * @property {string} secretLabel  A secret field's name when the page gives none (js/patterns.js, `.kp-secret`) [kpadopt4]
 * @property {string} secretReveal  The button that shows a secret
 * @property {string} secretHide  The same button while the secret is shown
 * @property {string} secretHold  The button of a secret shown only while it is held (`data-kp-secret-reveal-on="hold"`)
 * @property {string} secretCopy  The button that copies a secret without showing it
 * @property {string} secretReading  The words beside the spinner while a secret is fetched
 * @property {string} secretRetry  The reveal button's words after a secret could not be read
 * @property {(seconds: number) => string} secretHidesIn  The countdown under a shown secret, "Hides in 28 s"
 * @property {string} secretPaused  The countdown's words while the reader selects or holds the focus in the value
 * @property {string} secretStaysShown  The line under a shown secret that hides only when asked (`data-kp-secret-ttl="0"`)
 * @property {(seconds: number) => string} secretShown  What a screen reader hears when a secret is shown, "Shown. Hides in 30 s."
 * @property {string} secretHidden  What it hears when the secret is hidden again
 * @property {(reason: string) => string} secretFailed  The line under a secret that could not be read
 * @property {string} secretNoSource  The reason when a secret has no value, loader or listener to read it from
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
 * @property {string} chartRetry  The Retry under a failed chart's sentence [t56-statefix-1018]
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
 * @property {string} calendarNav  The name of a month heatmap's row of month buttons (js/calendar.js) [scope-143]
 * @property {string} calendarPrev  A month heatmap's button to the month before; its name and title are `previousMonth` [scope-143]
 * @property {string} calendarNext  Its button to the month after; its name and title are `nextMonth` [scope-143]
 * @property {string} calendarToday  Its button back to today's month, with today picked [scope-143]
 * @property {string} calendarTodayTitle  That button's title [scope-143]
 * @property {(date: string, label: string) => string} calendarDay  A day's name and title: the date (dd/mm/yyyy) and what the page says about it [scope-143]
 * @property {string} calendarFuture  What a day still to come is, when the page says nothing about it [scope-143]
 * @property {string} calendarLoading  What every day is while the calendar loads [scope-143]
 * @property {string} calendarUnknown  What a past day is when the page says nothing about it [scope-143]
 * @property {string} weekGroup  The name of a week agenda when the page gives none (js/week.js)
 * @property {string} weekPrev  The week agenda's button to the week before
 * @property {string} weekNext  Its button to the week after
 * @property {string} weekToday  Its button back to the current week; also the word under today's date
 * @property {string} weekNow  The now-line's name
 * @property {(time: string) => string} weekNowAt  The now-line's name with the time, "now, 14:32"
 * @property {(n: number) => string} weekMore  The overflow pill's text, "+3"
 * @property {(n: number, day: string) => string} weekMoreLabel  The overflow pill's name, "3 more runs on Tue 17/10"
 * @property {string} weekNextRun  What a next run is called in a pill's name
 * @property {string} weekOff  What a switched-off item is called in a pill's name
 * @property {string} weekSkipped  What a skipped item is called in a pill's name
 * @property {string} weekReference  What a reference item (the host's own round) is called in a pill's name
 * @property {string} weekEmpty  The sentence of a week with nothing in it
 * @property {string} weekLoading  The sentence of a week being read
 * @property {string} ganttGroup  The name of a run timeline when the page gives none (js/gantt.js)
 * @property {string} ganttRange  The name of the range buttons
 * @property {(label: string) => string} ganttRangeTitle  A range button's title, "Show the last 6 hours"
 * @property {string} ganttNow  The now-line's name
 * @property {string} ganttSelection  The selected range's chip label
 * @property {string} ganttClear  The button that lifts the selected range
 * @property {string} ganttClearTitle  Its title
 * @property {(from: string, to: string) => string} ganttSelected  The chip's text, "Selected 14:00 to 16:30"
 * @property {string} ganttEmpty  The sentence of a timeline with no run in the window
 * @property {string} ganttLoading  The sentence of a timeline being read
 * @property {string} ganttQueued  A queued run's state word
 * @property {string} ganttRunning  A running run's state word
 * @property {string} ganttOk  A finished run's state word
 * @property {string} ganttFailed  A failed run's state word
 * @property {(label: string, state: string) => string} ganttAnnounce  What the timeline's status region says when a run changes state, "Backup: failed"
 * @property {(label: string, when: string, state: string) => string} ganttBar  A bar's name, "Backup, 02:00 to 02:14, failed"
 * @property {string} ganttLive  The button that makes the window follow now
 * @property {string} ganttLiveTitle  Its title
 * @property {string} ganttZoom  The button that makes the selected range the window
 * @property {string} ganttZoomTitle  Its title
 * @property {(seconds: number) => string} ganttDuration  A length of time as a person reads it, "14 min", "1 h 5 min", "45 s"
 * @property {string} ganttHint  The one-line hint under the timeline on how to read and use it
 * @property {string} ganttAll  The range button that fits the window to everything on the timeline (`all` in `data-kp-gantt-ranges`) [kpadopt4]
 * @property {string} ganttAllTitle  Its title
 * @property {(label: string, when: string) => string} ganttPoint  A point event's name, "Applied, 02/10/2026" [kpadopt4]
 * @property {string} ganttPlanned  The word after a planned point's name, still to come
 * @property {(count: number, labels: string) => string} ganttCluster  The name of marks too close to tell apart, "3 events: Applied, Mail, Call"
 * @property {(more: number) => string} ganttClusterMore  The count on such a mark, "+2"
 * @property {string} ganttPointsHint  The hint under a timeline of point events
 * @property {string} pipelineLoading  The words on a pipeline's loading card (js/pipeline.js) [kpadopt4]
 * @property {string} pipelineEmpty  The sentence over a pipeline with no cards, when the page gives none
 * @property {(reason: string) => string} pipelineFailed  The sentence over a pipeline that could not be read
 * @property {string} pipelineRetry  Its Try again button
 * @property {string} pipelineNone  The word in a lane with no cards
 * @property {(more: number) => string} pipelineMore  The button under a lane's first cards, "+4 more"
 * @property {string} pipelineLess  The same button while the lane shows every card
 * @property {(percent: number) => string} pipelineShare  A lane's share of all cards, "25 % of all"
 * @property {string} uptimeLoading  The uptime strip's busy card and its summary while the history is read (js/uptime.js) [kpadopt4-ideas]
 * @property {string} uptimeEmpty  Its summary when no period has data yet [kpadopt4-ideas]
 * @property {string} uptimeError  Its summary when the history could not be read and the page gave no sentence [kpadopt4-ideas]
 * @property {(percent: string) => string} uptimePercent  The window's share up, from "99.4" to "99.4%" [kpadopt4-ideas]
 * @property {(n: number) => string} uptimeIncidents  The window's incident count, exact: "1 incident", "12 incidents" [kpadopt4-ideas]
 * @property {(percent: string, incidents: number) => string} uptimeSummary  The summary as one sentence, for a screen reader [kpadopt4-ideas]
 * @property {(label: string, summary: string) => string} uptimeTrack  The strip's name: its title and its summary [kpadopt4-ideas]
 * @property {(state: string) => string} uptimeStateWord  A period's state as a word: up, degraded, down, no data [kpadopt4-ideas]
 * @property {(label: string, state: string, percent: string | null, incidents: number | null) => string} uptimeCell  A cell's name and hover card: its period, its state and its figures [kpadopt4-ideas]
 * @property {(shown: number, total: number) => string} uptimeShown  Under a strip too narrow for every cell: "55 of 90 shown" [kpadopt4-ideas]
 * @property {(percent: string | null, incidents: number | null) => string} uptimeInfoFigures  A period's figures in its quick info: "99.4% up · 1 incident" [kpadopt4 r2]
 * @property {(label: string) => string} uptimeOpen  The link in a period's quick info to the period's own page: "Open 14/10/2026" [kpadopt4 r2]
 * @property {(name: string) => string} typeConfirmLabel  The typed confirmation's label; the name is set in as code where this sentence puts it (js/components.js) [kpadopt4-ideas]
 * @property {string} typeConfirmRuleExact  Its rule when capitals count [kpadopt4-ideas]
 * @property {string} typeConfirmRuleAnyCase  Its rule when capitals do not count (`data-kp-confirm-case="any"`) [kpadopt4-ideas]
 * @property {string} typeConfirmMatched  The badge once the typed name matches [kpadopt4-ideas]
 * @property {string} typeConfirmMismatch  The line while what is typed does not match yet [kpadopt4-ideas]
 * @property {string} typeConfirmLoses  The heading over what the action will delete [kpadopt4-ideas]
 * @property {(shell: string) => string} commandShell  A command block's terminal by its key: WSL, PowerShell, cmd, Garuda, bash; another key as written (js/command.js) [kpadopt4-ideas]
 * @property {string} commandAdmin  The badge of a Windows command that needs a terminal opened as administrator [kpadopt4-ideas]
 * @property {string} commandAdminTitle  Its tooltip [kpadopt4-ideas]
 * @property {string} commandSudo  The badge of a Linux command that runs with root rights [kpadopt4-ideas]
 * @property {string} commandSudoTitle  Its tooltip [kpadopt4-ideas]
 * @property {(where: string) => string} commandRunsOn  The note under a command that says where it runs [kpadopt4-ideas]
 * @property {string} timerStart  A timer's Start button (js/countdown.js, js/timer-disc.js) [kpadopt4-ideas]
 * @property {string} timerPause  The same button while it runs [kpadopt4-ideas]
 * @property {string} timerResume  The same button while it is paused [kpadopt4-ideas]
 * @property {string} timerReset  A timer's Reset button [kpadopt4-ideas]
 * @property {(seconds: number) => string} timerAddMinute  The countdown's button that adds time: "+1 min" [kpadopt4-ideas]
 * @property {(seconds: number) => string} timerAddMinuteTitle  Its tooltip: "Add 1 min" [kpadopt4-ideas]
 * @property {string} timerPaused  The line under a paused timer, and what a screen reader hears [kpadopt4-ideas]
 * @property {string} timerEnded  The line under a timer whose time is up [kpadopt4-ideas]
 * @property {(name: string) => string} timerEndedNamed  What a screen reader hears when a named timer ends [kpadopt4-ideas]
 * @property {string} timerStarted  What a screen reader hears when a timer starts [kpadopt4-ideas]
 * @property {string} timerResumed  What a screen reader hears when it goes on after a pause [kpadopt4-ideas]
 * @property {(duration: string) => string} timerLeft  The countdown's time left for a screen reader: "25 min left" [kpadopt4-ideas]
 * @property {(seconds: number) => string} timerDuration  A timer's length in words: "25 min", "1 h 30 min", "45 s" [kpadopt4-ideas]
 * @property {(left: string, total: string) => string} timerDiscLeft  The visual timer's face for a screen reader: "12 min left of 25 min" [kpadopt4-ideas]
 * @property {string} timerUnderMinute  The time left on the face in its last minute [kpadopt4-ideas]
 * @property {(name: string, duration: string) => string} timerDiscCaption  The still line under the disc: "Focus · 25 min" [kpadopt4-ideas]
 * @property {string} rangePresets  The range picker's preset group, for a screen reader (js/range.js) [kpadopt4-ideas]
 * @property {(key: string) => string} rangePresetName  A preset in words: "Last 24 hours" [kpadopt4-ideas]
 * @property {(key: string) => string} rangePresetShort  A preset on its segment: "24h" [kpadopt4-ideas]
 * @property {string} rangeCustom  The button that opens the custom range [kpadopt4-ideas]
 * @property {string} rangeCustomTitle  The custom panel's title [kpadopt4-ideas]
 * @property {string} rangeCustomName  A custom window's name in the line under the picker [kpadopt4-ideas]
 * @property {string} rangeFrom  The start's label [kpadopt4-ideas]
 * @property {string} rangeTo  The end's label [kpadopt4-ideas]
 * @property {(bound: string) => string} rangeDateLabel  A date field's name: "From, date (dd/mm/yyyy)" [kpadopt4-ideas]
 * @property {(bound: string) => string} rangeTimeLabel  A time field's name [kpadopt4-ideas]
 * @property {string} rangeTimeHint  The time field's placeholder [kpadopt4-ideas]
 * @property {string} rangeApply  The custom panel's Apply [kpadopt4-ideas]
 * @property {string} rangeCancel  The custom panel's Cancel [kpadopt4-ideas]
 * @property {(name: string, from: string, to: string) => string} rangeLabel  The line under the picker: "Last 24 hours · 15/10/2026 14:05 – 16/10/2026 14:05" [kpadopt4-ideas]
 * @property {(bound: string) => string} rangeErrorDate  A date that is not a whole dd/mm/yyyy [kpadopt4-ideas]
 * @property {(bound: string) => string} rangeErrorTime  A time that is not a time of day [kpadopt4-ideas]
 * @property {string} rangeErrorOrder  A window whose end does not come after its start [kpadopt4-ideas]
 * @property {string} rangeErrorFuture  A window that ends in the future [kpadopt4-ideas]
 * @property {(days: number) => string} rangeErrorSpan  A window longer than the picker allows [kpadopt4-ideas]
 * @property {string} weekdaysGroup  The weekday picker's name when the page gives none (js/weekdays.js) [kpadopt5-time]
 * @property {string[]} weekdaysShort  The short day names, Monday first: "Mon" [kpadopt5-time]
 * @property {string[]} weekdaysNarrow  The one-letter day names, Monday first: "M" [kpadopt5-time]
 * @property {string[]} weekdaysLong  The full day names, Monday first, a chip's hint and name [kpadopt5-time]
 * @property {string} weekdaysLast  The month picker's chip for the last day [kpadopt5-time]
 * @property {string} weekdaysLastDay  The last day of the month in words [kpadopt5-time]
 * @property {string} weekdaysAnd  The word that joins the last two days of a list: "Mon and Thu" [kpadopt5-time]
 * @property {string} weekdaysPresets  The quick picks' group name for a screen reader [kpadopt5-time]
 * @property {string} weekdaysPresetWeekdays  The quick pick for Monday to Friday [kpadopt5-time]
 * @property {string} weekdaysPresetWeekend  The quick pick for Saturday and Sunday [kpadopt5-time]
 * @property {string} weekdaysPresetEvery  The quick pick for all seven days [kpadopt5-time]
 * @property {string} weekdaysNone  The line while no day is picked [kpadopt5-time]
 * @property {string} weekdaysEvery  The line for all seven days [kpadopt5-time]
 * @property {string} weekdaysWeekdays  The line for Monday to Friday [kpadopt5-time]
 * @property {string} weekdaysWeekend  The line for Saturday and Sunday [kpadopt5-time]
 * @property {(n: number) => string} weekdaysOrdinal  A day of the month in words: "1st", "22nd" [kpadopt5-time]
 * @property {(list: string) => string} weekdaysOnThe  The days of a month in a sentence: "On the 1st and 15th" [kpadopt5-time]
 * @property {(n: number) => string} weekdaysMin  What a picker below its least says: "Pick at least one day" [kpadopt5-time]
 * @property {string} runsTitle  The heading over a next-times list (js/runs.js) [kpadopt5-time]
 * @property {string} runsNow  A run that is due now, where "in 2 days" would stand [kpadopt5-time]
 * @property {(distance: string) => string} runsIn  How far away a run is: "in 2 days" [kpadopt5-time]
 * @property {(hours: number) => string} runsClockChange  The mark on a run after the clock was turned, positive hours forward: "Clock goes back 1 h" [kpadopt5-time]
 * @property {(n: number) => string} runsMore  The button that shows the times past the count: "Show 10 more" [kpadopt5-time]
 * @property {string} runsFewer  The same button once they are shown [kpadopt5-time]
 * @property {string} runsEmpty  An empty list's sentence when the page gives none [kpadopt5-time]
 * @property {string} runsFailed  A failed list's first line [kpadopt5-time]
 * @property {string} runsRetry  The failed list's button [kpadopt5-time]
 * @property {string} runsLoading  What the busy card says while the times are worked out [kpadopt5-time]
 * @property {(moment: string) => string} runsNext  What the status region says when the first run changes [kpadopt5-time]
 * @property {string} snoozeTrigger  The snooze picker's button while nothing is snoozed (js/snooze.js) [kpadopt5-time]
 * @property {string} snoozeChange  The same button while a snooze is in force [kpadopt5-time]
 * @property {string} snoozeChoicesLabel  The chip row's name for a screen reader [kpadopt5-time]
 * @property {(key: string) => string} snoozeIn  A length as a choice: "In 4 hours" [kpadopt5-time]
 * @property {(time: string) => string} snoozeTonight  "This evening 18:00" [kpadopt5-time]
 * @property {(time: string) => string} snoozeTomorrow  "Tomorrow 09:00" [kpadopt5-time]
 * @property {(time: string) => string} snoozeMonday  "Monday 09:00" [kpadopt5-time]
 * @property {(time: string) => string} snoozeNextWeek  "Next week 09:00" [kpadopt5-time]
 * @property {string} snoozeLast  The last custom moment, offered at the top [kpadopt5-time]
 * @property {string} snoozePick  The choice that opens the date and time panel [kpadopt5-time]
 * @property {string} snoozePickHint  What stands under that choice [kpadopt5-time]
 * @property {string} snoozePickTitle  The panel's title [kpadopt5-time]
 * @property {string} snoozeDateLabel  The panel's date field name [kpadopt5-time]
 * @property {string} snoozeTimeLabel  The panel's time field name [kpadopt5-time]
 * @property {string} snoozeApply  The panel's confirm button [kpadopt5-time]
 * @property {string} snoozeCancel  The panel's cancel button [kpadopt5-time]
 * @property {(moment: string) => string} snoozeUntil  The line while snoozed: "Snoozed until Mon 20/10/2026 09:00 · in 2 days" [kpadopt5-time]
 * @property {string} snoozeNone  The line while nothing is snoozed [kpadopt5-time]
 * @property {string} snoozeEnd  The button that ends a snooze [kpadopt5-time]
 * @property {string} snoozeSaving  Why the choices are off while the page saves [kpadopt5-time]
 * @property {string} snoozeErrorDate  A date that is not a whole dd/mm/yyyy [kpadopt5-time]
 * @property {string} snoozeErrorTime  A time that is not a time of day [kpadopt5-time]
 * @property {string} snoozeErrorPast  A moment that has passed [kpadopt5-time]
 * @property {(days: number) => string} snoozeErrorMax  A moment past the longest a reminder may be put off [kpadopt5-time]
 * @property {string} datedGroup  A dated option picker's name when the page gives none (js/dated-options.js) [kpadopt5-time]
 * @property {string} datedLatest  The badge on the newest option [kpadopt5-time]
 * @property {string} datedJustNow  An option made under a minute ago [kpadopt5-time]
 * @property {(distance: string) => string} datedAgo  How long ago an option was made: "3 days ago" [kpadopt5-time]
 * @property {string} datedSearch  The search field's placeholder, for a long list [kpadopt5-time]
 * @property {(name: string) => string} datedChosen  What the status region says when an option is chosen [kpadopt5-time]
 * @property {string} datedEmpty  An empty picker's sentence when the page gives none [kpadopt5-time]
 * @property {string} datedFailed  A failed picker's first line [kpadopt5-time]
 * @property {string} datedRetry  The failed picker's button [kpadopt5-time]
 * @property {string} datedLoading  What the busy card says while the options load [kpadopt5-time]
 * @property {(label: string) => string} sentenceEmpty  What a sentence's summary says for a field with nothing in it: "(At)" (js/sentence.js) [kpadopt5-time]
 * @property {(field: string, why: string) => string} sentenceWhy  The line under a sentence that names the field that is wrong: "At: Type a time of day." [kpadopt5-time]
 * @property {string} sentenceField  The name of a control that has none and no words before it [kpadopt5-time]
 * @property {string} sliderGroup  A slider's name when the page gives none (js/slider.js) [kpadopt5-time]
 * @property {(label: string) => string} sliderMin  The lower thumb's and box's name: "Temperature, minimum" [kpadopt5-time]
 * @property {(label: string) => string} sliderMax  The upper thumb's and box's name: "Temperature, maximum" [kpadopt5-time]
 * @property {(label: string) => string} sliderValue  The value box's name: "Temperature, value" [kpadopt5-time]
 * @property {(min: string, max: string, unit: string) => string} sliderInvalid  The line under a slider for a typed value that is not a number in range [kpadopt5-time]
 * @property {(gap: string, unit: string) => string} sliderGap  The line for a typed value that would bring the two thumbs too close [kpadopt5-time]
 * @property {(n: number, text: string) => string} autosizeChars  The counter of a growing text box: "1 204 characters" (js/autosize.js) [kpadopt6-media]
 * @property {(n: number, text: string) => string} autosizeLines  Its line count: "12 lines" [kpadopt6-media]
 * @property {(chars: number, charsText: string, lines: number, linesText: string) => string} autosizeBoth  Both counts in one line [kpadopt6-media]
 * @property {(text: string, maxText: string) => string} autosizeOf  A count against the limit: "1 204 of 4 000 characters" [kpadopt6-media]
 * @property {(maxText: string) => string} autosizeFull  Said politely when the limit is reached [kpadopt6-media]
 * @property {(charsText: string, maxText: string) => string} autosizeNear  Said politely when 90 % of the limit is used [kpadopt6-media]
 * @property {string} autosizeSubmit  The sheet's words for Ctrl+Enter submitting the form [kpadopt6-media]
 * @property {string} autosizeGroup  The sheet's heading for that key [kpadopt6-media]
 * @property {string} autosizeLoading  The busy card's words while a box waits for its text [kpadopt6-media]
 * @property {string} autosizeFailed  The line under a box whose text could not be saved, when the page gives none [kpadopt6-media]
 * @property {(name: string) => string} anchorCopyLink  The accessible name of a link mark: "Copy link to Dead letter 4f2a" (js/anchors.js) [kpadopt6-media]
 * @property {string} anchorCopied  The word on the mark after a copy [kpadopt6-media]
 * @property {string} anchorFailed  The word on the mark when the clipboard refused [kpadopt6-media]
 * @property {(name: string) => string} anchorCopiedAnnounce  Said politely after a copy [kpadopt6-media]
 * @property {string} anchorFailedAnnounce  Said politely when the clipboard refused [kpadopt6-media]
 * @property {string} anchorMissing  The notice for an address that points at nothing here any more [kpadopt6-media]
 * @property {string} anchorShowAll  The notice's button that clears the address [kpadopt6-media]
 * @property {string} anchorKeyCopy  The sheet's words for y then l on a row [kpadopt6-media]
 * @property {string} anchorKeyGroup  The sheet's heading for the anchor keys [kpadopt6-media]
 * @property {string} printLoading  What a list that is still loading prints instead of a blank sheet (js/print.js) [kpadopt6-media]
 * @property {(moment: string) => string} printStamp  The foot of a printed sheet: "Printed 17/10/2026 14:05" [kpadopt6-media]
 * @property {string} viewerOpenNew  The viewer's "Open in a new tab" button (js/viewer.js) [kpadopt6-media]
 * @property {string} viewerDownload  The viewer's Download button [kpadopt6-media]
 * @property {string} viewerPrint  The viewer's Print button [kpadopt6-media]
 * @property {string} viewerCopyLink  The viewer's Copy link button [kpadopt6-media]
 * @property {string} viewerNoFile  The reason a viewer button is off when there is no file [kpadopt6-media]
 * @property {string} viewerLoading  The busy card's words while a file opens [kpadopt6-media]
 * @property {string} viewerFailedTitle  The failed stage's heading [kpadopt6-media]
 * @property {string} viewerFailedText  The failed stage's sentence when the server gave none [kpadopt6-media]
 * @property {string} viewerUnsupportedTitle  The heading of the stage that cannot show this kind of file here [kpadopt6-media]
 * @property {string} viewerUnsupportedText  Its sentence [kpadopt6-media]
 * @property {string} viewerRetry  The failed stage's Retry [kpadopt6-media]
 * @property {(index: number, total: number) => string} viewerPosition  The exact position in a set: "4 of 37" [kpadopt6-media]
 * @property {string} previewKeyGroup  The sheet's heading for the preview keys (js/docpreview.js) [kpadopt6-media]
 * @property {string} previewKeyOpen  The sheet's words for o [kpadopt6-media]
 * @property {string} previewKeyDownload  The sheet's words for d [kpadopt6-media]
 * @property {string} previewKeyPrint  The sheet's words for p [kpadopt6-media]
 * @property {string} previewKeyPrevious  The sheet's words for Left in a group of documents [kpadopt6-media]
 * @property {string} previewKeyNext  The sheet's words for Right in a group of documents [kpadopt6-media]
 * @property {string} previewTimeout  The sentence when a file takes too long to open [kpadopt6-media]
 * @property {string} previewGone  The sentence when the server says the file is gone [kpadopt6-media]
 * @property {(status: number) => string} previewServer  The sentence when the server answered with an error [kpadopt6-media]
 * @property {string} previewNoPdf  The sentence when this browser cannot show a PDF here [kpadopt6-media]
 * @property {string} previewShownByBrowser  The line under a PDF's title: how it is shown [kpadopt6-media]
 * @property {string} previewImage  The sentence when a picture would not load [kpadopt6-media]
 * @property {string} previewNoFile  The reason an opener is off when there is no file yet [kpadopt6-media]
 * @property {string} docKindImage  The facts word of a picture file [kpadopt6-media]
 * @property {string} docKindText  The facts word of a text file [kpadopt6-media]
 * @property {string} docMissing  The name of a document glyph whose file is missing [kpadopt6-media]
 * @property {(kind: string) => string} docKindName  The name of a document glyph: "PDF document" [kpadopt6-media]
 * @property {string} galleryContinue  The button that opens the picture last looked at (js/gallery.js) [kpadopt6-media]
 * @property {string} galleryFailed  The failed gallery's heading [kpadopt6-media]
 * @property {string} galleryFailedText  Its sentence [kpadopt6-media]
 * @property {string} galleryEmpty  The empty gallery's heading [kpadopt6-media]
 * @property {string} galleryEmptyText  Its sentence [kpadopt6-media]
 * @property {string} galleryEmptyAdd  Its sentence when pictures can be added [kpadopt6-media]
 * @property {string} galleryRetry  The Retry of a failed gallery or picture [kpadopt6-media]
 * @property {string} galleryAdd  The add tile's words [kpadopt6-media]
 * @property {string} galleryLoading  The busy card's words while the gallery loads [kpadopt6-media]
 * @property {string} galleryPicture  What a picture without a name is called [kpadopt6-media]
 * @property {(name: string) => string} galleryOpenPicture  The name of a tile that opens a picture [kpadopt6-media]
 * @property {(name: string) => string} galleryOpenVideo  The name of a tile that opens a video [kpadopt6-media]
 * @property {string} galleryPictureFailed  The heading of a picture that would not load [kpadopt6-media]
 * @property {string} galleryPictureFailedText  Its sentence in the lightbox [kpadopt6-media]
 * @property {(name: string) => string} galleryRetryPicture  The accessible name of a picture's Retry [kpadopt6-media]
 * @property {string} galleryPrevious  The lightbox's previous button [kpadopt6-media]
 * @property {string} galleryNext  The lightbox's next button [kpadopt6-media]
 * @property {string} galleryFirst  The reason previous is off at the first picture [kpadopt6-media]
 * @property {string} galleryLast  The reason next is off at the last picture [kpadopt6-media]
 * @property {string} galleryKeyGroup  The sheet's heading for the lightbox keys [kpadopt6-media]
 * @property {string} galleryKeyPrevious  The sheet's words for Left [kpadopt6-media]
 * @property {string} galleryKeyNext  The sheet's words for Right [kpadopt6-media]
 * @property {string} galleryKeyFirst  The sheet's words for Home [kpadopt6-media]
 * @property {string} galleryKeyLast  The sheet's words for End [kpadopt6-media]
 * @property {string} galleryKeyZoom  The sheet's words for z [kpadopt6-media]
 * @property {string} galleryKeyZoomIn  The sheet's words for + [kpadopt6-media]
 * @property {string} galleryKeyZoomOut  The sheet's words for - [kpadopt6-media]
 * @property {string} galleryKeyFull  The sheet's words for f [kpadopt6-media]
 * @property {string} usesLabel  A uses map's name when the page gives none (js/uses-map.js) [kpadopt6-media]
 * @property {string} usesSources  The sources column's name [kpadopt6-media]
 * @property {string} usesUsers  The users column's name [kpadopt6-media]
 * @property {string} usesFailed  The failed map's heading [kpadopt6-media]
 * @property {string} usesFailedText  Its sentence [kpadopt6-media]
 * @property {string} usesEmpty  The empty map's heading [kpadopt6-media]
 * @property {string} usesEmptyText  Its sentence [kpadopt6-media]
 * @property {string} usesRetry  The failed map's Retry [kpadopt6-media]
 * @property {string} usesLoading  The busy card's words while the map loads [kpadopt6-media]
 * @property {string} usesNotUsed  What a source nothing uses says [kpadopt6-media]
 * @property {(n: number) => string} usesCount  The exact number of uses on a source: "Used by 2" [kpadopt6-media]
 * @property {(label: string) => string} usesOpen  The name of a node's link [kpadopt6-media]
 * @property {(label: string, n: number, names: string) => string} usesNodeSource  A source in words: "CV Developer NL, used by 2: Deloitte, Takto" [kpadopt6-media]
 * @property {(label: string) => string} usesNodeUnused  A source nothing uses, in words [kpadopt6-media]
 * @property {(label: string, names: string) => string} usesNodeUser  A user in words: "Deloitte, uses: CV Developer NL" [kpadopt6-media]
 * @property {(label: string) => string} usesNodeNothing  A user that uses nothing, in words [kpadopt6-media]
 * @property {string} unsavedGroup  The unsaved-changes bar's name for a screen reader (js/unsaved.js) [kpadopt5-time]
 * @property {string} unsavedNone  The line while nothing is changed [kpadopt5-time]
 * @property {(n: number) => string} unsavedCount  The chip: "2 changes" [kpadopt5-time]
 * @property {(n: number) => string} unsavedSave  The Save button with its count: "Save 2 changes" [kpadopt5-time]
 * @property {string} unsavedSaveNone  The Save button while nothing is changed [kpadopt5-time]
 * @property {string} unsavedDiscard  The Discard button [kpadopt5-time]
 * @property {string} unsavedMore  The menu that holds Discard on a narrow bar [kpadopt5-time]
 * @property {string} unsavedDiscardChanges  Its Discard entry [kpadopt5-time]
 * @property {string} unsavedDiscardHint  What it does [kpadopt5-time]
 * @property {string} unsavedShowChanges  Its entry that opens the list [kpadopt5-time]
 * @property {string} unsavedShowHint  What it does [kpadopt5-time]
 * @property {string} unsavedNothingToSave  Why Save and Discard are off while nothing is changed [kpadopt5-time]
 * @property {string} unsavedSavingNow  Why they are off while saving [kpadopt5-time]
 * @property {string} unsavedListTitle  The list of changes' name [kpadopt5-time]
 * @property {string} unsavedGoFirst  The button that takes you to the first changed row [kpadopt5-time]
 * @property {(key: string) => string} unsavedGoTo  A change's name as a link to its row [kpadopt5-time]
 * @property {string} unsavedRevert  A change's own revert button [kpadopt5-time]
 * @property {(key: string) => string} unsavedRevertOne  That button's accessible name [kpadopt5-time]
 * @property {string} unsavedUnnamed  A change whose row has no name [kpadopt5-time]
 * @property {string} unsavedSecret  A secret's value in the list [kpadopt5-time]
 * @property {string} unsavedOn  A switch that is on, in the list [kpadopt5-time]
 * @property {string} unsavedOff  A switch that is off, in the list [kpadopt5-time]
 * @property {string} unsavedEmpty  An empty value, in the list [kpadopt5-time]
 * @property {(n: number) => string} unsavedDropped  What the toast says after Discard: "Dropped 2 changes" [kpadopt5-time]
 * @property {string} unsavedUndo  Its Undo button [kpadopt5-time]
 * @property {(n: number) => string} unsavedRestoredUndo  What is said after Undo [kpadopt5-time]
 * @property {(n: number) => string} unsavedRestored  The toast when kept changes come back after a reload [kpadopt5-time]
 * @property {(n: number) => string} unsavedSavedAll  What is said when every change was saved [kpadopt5-time]
 * @property {(saved: number, refused: number) => string} unsavedPartly  The alert's first line when some were refused: "1 saved, 1 refused" [kpadopt5-time]
 * @property {(n: number) => string} unsavedRefused  The alert's first line when none was saved [kpadopt5-time]
 * @property {(key: string, why: string) => string} unsavedWhy  One refused change and its reason [kpadopt5-time]
 * @property {string} unsavedDismiss  The alert's close [kpadopt5-time]
 * @property {string} unsavedLeaveTitle  The question on following a link with unsaved changes [kpadopt5-time]
 * @property {(n: number) => string} unsavedLeaveText  Its sentence [kpadopt5-time]
 * @property {string} unsavedLeaveAccept  Its leave button [kpadopt5-time]
 * @property {string} unsavedLeaveStay  Its stay button [kpadopt5-time]
 * @property {string} compareBefore  The compare slider's label on the before side (js/compare.js) [kpadopt4-ideas]
 * @property {string} compareAfter  Its label on the after side [kpadopt4-ideas]
 * @property {(before: string, after: string) => string} compareSlider  The divider's name for a screen reader [kpadopt4-ideas]
 * @property {(percent: number, before: string, after: string) => string} compareValue  Where the divider stands: "40% Before, 60% After" [kpadopt4-ideas]
 * @property {string} compareFailed  A pane whose image could not be loaded [kpadopt4-ideas]
 * @property {string} compareRetry  The Retry button of a pane whose image could not be loaded [kpadopt4 r2]
 * @property {string} compareLoading  What the busy card over a compare slider says while its images load [kpadopt4 r2]
 * @property {string} calmOn  The polite announcement when calm mode is switched on (js/calm.js) [kpadopt5]
 * @property {string} calmOff  The same, when it is switched off [kpadopt5]
 * @property {string} calmSystem  The reason the calm switch is disabled while the system itself asks for less motion [kpadopt5]
 * @property {string} shortcutsEmptyTitle  The shortcut sheet's empty state, when no shortcut is registered (js/shortcuts.js) [kpadopt5]
 * @property {string} shortcutsEmptyText  Its second line [kpadopt5]
 * @property {string} shortcutsPalette  The sheet's fixed row for the command palette key [kpadopt5]
 * @property {string} shortcutsSheet  The sheet's fixed row for the key that opens the sheet [kpadopt5]
 * @property {string} shortcutsPending  What a screen reader hears while a chord waits for its second key [kpadopt5]
 * @property {(keys: string) => string} shortcutsUnknown  The short line after a chord that does nothing, "No shortcut on g x" [kpadopt5]
 * @property {(keys: string, suggestion: string) => string} shortcutsAltGr  The warning for a key that needs AltGr on an AZERTY keyboard [kpadopt5]
 * @property {string} shortcutsUnavailable  The sheet's note on a shortcut that is not available right now [kpadopt5]
 * @property {string} ledeMore  The button that opens a collapsed lede (js/lede.js) [kpadopt5]
 * @property {string} ledeLess  The button that folds it again [kpadopt5]
 * @property {string} ledeLearnMore  The link at the end of a lede that carries `data-kp-lede-link` [kpadopt5]
 * @property {string} problemRemedy  The label before the remedy of a problem, "What now" (js/problems.js) [kpadopt5]
 * @property {(n: number) => string} problemShowOthers  The button that opens the problems folded away, "Show the other 3" [kpadopt5]
 * @property {string} problemShowFewer  The button that folds them again [kpadopt5]
 * @property {string} problemCopy  The copy button on a remedy that is a command [kpadopt5]
 * @property {(n: number) => string} problemListLabel  The name of a list of problems for a screen reader, "3 problems" [kpadopt5]
 * @property {string} flashDone  The word on a button after its work went well and the page gave no word of its own (js/flash.js) [kpadopt5]
 * @property {string} flashRefused  The word on a button after the work was refused [kpadopt5]
 * @property {string} flashFailed  The word on a button after the work failed without an answer [kpadopt5]
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
 * @property {string} triInclude  A three-way filter chip that must be in, as a screen reader hears it after the chip's name (js/segmented.js, `data-kp-segmented="tri"`) [kpadopt4]
 * @property {string} triExclude  A chip that must not be in [kpadopt4]
 * @property {string} triAny  A chip that may or may not be in [kpadopt4]
 * @property {(label: string, state: string) => string} triAnnounce  What a three-way group says after a press, "Chicken: required" [kpadopt4]
 * @property {string} triHint  The line under a three-way group while nothing is chosen [kpadopt4]
 * @property {(include: string[], exclude: string[]) => string} triSummary  The same line once something is chosen [kpadopt4]
 * @property {string} triCleared  What a three-way group says after Clear all [kpadopt4]
 * @property {(label: string) => string} quantityLess  The minus button's name, "Portions, less" (js/quantity.js) [kpadopt4]
 * @property {(label: string) => string} quantityMore  The plus button's name, "Portions, more" [kpadopt4]
 * @property {(value: string, unit: string) => string} quantityValue  The value with its unit, as a screen reader hears it, "6 portions" [kpadopt4]
 * @property {(done: number, total: number) => string} checklistCount  A checklist group's count beside its heading, "4 of 9" (js/checklist.js) [kpadopt4]
 * @property {(done: number, total: number) => string} checklistSummary  The whole list's count in its bar, "4 of 9 done" [kpadopt4]
 * @property {string} checklistCheckAll  The bar's button that ticks every item [kpadopt4]
 * @property {string} checklistUncheckAll  The bar's button that takes the tick off every item [cook-1017]
 * @property {string} checklistClear  The bar's button that takes the ticked items away [kpadopt4]
 * @property {string} checklistUndo  The button that brings them back [kpadopt4]
 * @property {(n: number) => string} checklistCleared  The bar's line after a clear, "3 cleared" [kpadopt4]
 * @property {(n: number) => string} checklistRestored  Said after Undo [kpadopt4]
 * @property {string} checklistEmpty  An empty checklist [kpadopt4]
 * @property {string} checklistLoading  The words under a loading checklist's spinner [kpadopt4]
 * @property {string} checklistFailed  A checklist that could not be read, when the page gives no message [kpadopt4]
 * @property {(label: string) => string} checklistDone  Said when an item is ticked [kpadopt4]
 * @property {(label: string) => string} checklistDoneMoved  Said when an item is ticked with the keyboard and sank [kpadopt4]
 * @property {(label: string) => string} checklistOpen  Said when an item is unticked [kpadopt4]
 * @property {string} timerRunning  A kitchen timer's state word while it runs (js/timer.js) [kpadopt4]
 * @property {string} timerDoneWord  Its state word once it has ended [kpadopt4]
 * @property {(name: string) => string} timerDone  The large line on an ended timer, its notification and its alert, "Rice is done" [kpadopt4]
 * @property {(name: string) => string} timerSpoken  What a timer says aloud when it ends and the list speaks, "Rice is done" [cook-1017]
 * @property {string} timerStopRing  The button on an ended timer that stops it and takes it away [kpadopt4]
 * @property {(name: string) => string} timerAddMinuteTo  That button's accessible name [kpadopt4]
 * @property {(name: string) => string} timerRemove  The remove button's accessible name and tooltip [kpadopt4]
 * @property {string} timerEmpty  A list with no timer [kpadopt4]
 * @property {(name: string) => string} timerLastMinute  Said once when a timer has a minute left [kpadopt4]
 * @property {(name: string, clock: string) => string} timerStartedNamed  Said when a kitchen timer starts, with its name and its clock [kpadopt4]
 * @property {(name: string) => string} timerAlready  Said when a starter is pressed while its timer runs [kpadopt4]
 * @property {(n: number, total: number) => string} focusCount  The count over a step shown on its own, "Step 3 of 8" (js/focus-steps.js) [kpadopt4]
 * @property {string} focusNext  The button that goes on to the next step [kpadopt4]
 * @property {string} focusPrevious  The button that goes back a step [kpadopt4]
 * @property {string} focusDone  The next button on the last step [kpadopt4]
 * @property {string} focusNeeds  The heading over what a step needs [kpadopt4]
 * @property {(duration: string) => string} focusTimer  A step's timer button, "Start a timer · 10 min" [kpadopt4]
 * @property {string} focusReadAloud  The button that reads the step aloud [kpadopt4]
 * @property {string} focusStopReading  The same button while it reads [kpadopt4]
 * @property {string} focusWakeOn  The screen line while the screen is kept on [kpadopt4]
 * @property {string} focusWakeOff  The screen line when it is not [kpadopt4]
 * @property {string} focusWakeUnsupported  The screen line in a browser that cannot keep it on [kpadopt4]
 * @property {string} focusEmpty  A view with no steps [kpadopt4]
 * @property {string} focusLoading  The words under its spinner while the steps load [kpadopt4]
 * @property {string} focusFailed  Steps that could not be read, when the page gives no message [kpadopt4]
 * @property {string} wheelSpin  The button in the middle of a wheel that picks (js/wheel.js) [kpadopt4]
 * @property {string} wheelSpinAgain  The same button once the wheel has chosen [kpadopt4]
 * @property {string} wheelIdle  The line under a wheel that has not spun yet [kpadopt4]
 * @property {string} wheelChose  The line over the outcome, "The wheel chose" [kpadopt4]
 * @property {string} wheelSpinning  The line while it turns [kpadopt4]
 * @property {string} wheelOnlyOne  The line over the outcome when there was only one choice [kpadopt4]
 * @property {string} wheelEmpty  A wheel with no choices, when the page gives no sentence [kpadopt4]
 * @property {string} wheelLoading  The words under its spinner while the choices load [kpadopt4]
 * @property {string} wheelFailed  Choices that could not be read, when the page gives no message [kpadopt4]
 * @property {string} claimAnd  The word before the last name in a list of people who bring an item (js/claim.js) [kpadopt6]
 * @property {string} claimDisabled  Why every claim button is off when the page gives no reason (js/claim.js) [kpadopt6]
 * @property {string} claimNoViewer  Why the buttons are off while nobody is signed in (js/claim.js) [kpadopt6]
 * @property {(max: number) => string} claimFullReason  Why the button is off on an item that has its people (js/claim.js) [kpadopt6]
 * @property {string} claimTake  The button's face on an item you do not bring (js/claim.js) [kpadopt6]
 * @property {string} claimHeld  The button's face on an item you bring (a press lets go) (js/claim.js) [kpadopt6]
 * @property {string} claimNobody  The words of the gap, an item nobody brings (js/claim.js) [kpadopt6]
 * @property {(names: string) => string} claimBy  The group of people on a row, as a screen reader hears it (js/claim.js) [kpadopt6]
 * @property {string} claimNobodyLabel  The same for the gap (js/claim.js) [kpadopt6]
 * @property {(label: string) => string} claimHeldLabel  The button's name on an item you bring (js/claim.js) [kpadopt6]
 * @property {(label: string) => string} claimTakeLabel  The button's name on an item you do not bring (js/claim.js) [kpadopt6]
 * @property {string} claimAssign  The assign mode's menu button (js/claim.js) [kpadopt6]
 * @property {(label: string) => string} claimAssignOf  Its name for a screen reader (js/claim.js) [kpadopt6]
 * @property {string} claimAssignHeading  The assign menu's heading (js/claim.js) [kpadopt6]
 * @property {string} claimAssigned  The hint of a person who is on the item (js/claim.js) [kpadopt6]
 * @property {string} claimNotAssigned  The hint of a person who is not (js/claim.js) [kpadopt6]
 * @property {(done: number, total: number) => string} claimGroupCount  A group's count of items somebody brings (js/claim.js) [kpadopt6]
 * @property {string} claimAllTaken  The bar's line when every item has somebody (js/claim.js) [kpadopt6]
 * @property {(n: number) => string} claimGapsCount  The bar's line with the exact number of items nobody brings (js/claim.js) [kpadopt6]
 * @property {string} claimFilterLabel  The filter chips' name (js/claim.js) [kpadopt6]
 * @property {string} claimFilterAll  The chip that shows every item (js/claim.js) [kpadopt6]
 * @property {string} claimFilterGaps  The chip that shows only the items nobody brings (js/claim.js) [kpadopt6]
 * @property {string} claimFilterMine  The chip that shows only the items you bring (js/claim.js) [kpadopt6]
 * @property {string} claimTakeAll  The bar's button that takes all items nobody brings (js/claim.js) [kpadopt6]
 * @property {string} claimCopyGaps  The bar's button that copies the items nobody brings (js/claim.js) [kpadopt6]
 * @property {string} claimNothingOpen  Why those two buttons are off (js/claim.js) [kpadopt6]
 * @property {string} claimNoneOpenTitle  The filter plate when no item is left without somebody (js/claim.js) [kpadopt6]
 * @property {string} claimNoneOpenText  Its sentence (js/claim.js) [kpadopt6]
 * @property {string} claimNoneMineTitle  The filter plate for Mine when it is empty (js/claim.js) [kpadopt6]
 * @property {string} claimNoneMineText  Its sentence (js/claim.js) [kpadopt6]
 * @property {string} claimShowAll  The plates' button (js/claim.js) [kpadopt6]
 * @property {string} claimRetry  The Retry of a list that could not be read (js/claim.js) [kpadopt6]
 * @property {string} claimNotSaved  The line when the server refused a change and gave no reason (js/claim.js) [kpadopt6]
 * @property {(name: string, label: string) => string} claimLost  The line when somebody was faster (js/claim.js) [kpadopt6]
 * @property {(label: string, names: string) => string} claimAnnounce  What is said after a change (js/claim.js) [kpadopt6]
 * @property {(label: string) => string} claimAnnounceNobody  What is said after the last person let go (js/claim.js) [kpadopt6]
 * @property {(label: string) => string} claimReleased  The toast after you let go (js/claim.js) [kpadopt6]
 * @property {(name: string, label: string) => string} claimUnassigned  The toast after a person was taken off (js/claim.js) [kpadopt6]
 * @property {(n: number) => string} claimTookAll  The toast and the line after Take every open item (js/claim.js) [kpadopt6]
 * @property {(names: string) => string} claimCopyLine  The text Copy the open list writes (js/claim.js) [kpadopt6]
 * @property {(n: number) => string} claimCopied  What is said after the copy (js/claim.js) [kpadopt6]
 * @property {string} claimCopyFailed  What is said when the clipboard refuses (js/claim.js) [kpadopt6]
 * @property {string} claimKeyTake  The shortcut sheet's line for c (js/claim.js) [kpadopt6]
 * @property {string} claimKeyGroup  The sheet's heading for the claim keys (js/claim.js) [kpadopt6]
 * @property {string} claimKeyReason  Why c does nothing now (js/claim.js) [kpadopt6]
 * @property {string} claimKeyGaps  The sheet's line for Shift C (js/claim.js) [kpadopt6]
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
 * @property {string} consoleUnit  The pill's word for a block, singular and plural (js/console.js) [kpadopt6]
 * @property {string} consoleOutputLabel  The body's name for a screen reader (js/console.js) [kpadopt6]
 * @property {string} consoleCommand  The prompt's name when the console has none (js/console.js) [kpadopt6]
 * @property {string} consoleHostFailed  The failed plate's heading and the reason the prompt is off then (js/console.js) [kpadopt6]
 * @property {string} consoleHostFailedText  The failed plate's sentence (js/console.js) [kpadopt6]
 * @property {string} consoleOff  Why the prompt is off when the page gives no reason (js/console.js) [kpadopt6]
 * @property {string} consoleContextLoadingWhy  Why the prompt is off while the context list loads (js/console.js) [kpadopt6]
 * @property {string} consoleRun  The Run button (js/console.js) [kpadopt6]
 * @property {string} consoleRunAnyway  The Run button after a line the app wants confirmed (js/console.js) [kpadopt6]
 * @property {string} consoleHint  The line under the prompt when the page gives none (js/console.js) [kpadopt6]
 * @property {string} consoleContext  The context select's label when the page gives none (js/console.js) [kpadopt6]
 * @property {string} consoleContextLoading  The select while its options load (js/console.js) [kpadopt6]
 * @property {string} consoleSending  A block before the app answered (js/console.js) [kpadopt6]
 * @property {string} consoleQueued  A queued block (js/console.js) [kpadopt6]
 * @property {string} consoleRunning  A running block with its timer off (js/console.js) [kpadopt6]
 * @property {(time: string) => string} consoleRunningFor  A running block's status with its elapsed time (js/console.js) [kpadopt6]
 * @property {(code: number) => string} consoleExit  A finished block's exit code (js/console.js) [kpadopt6]
 * @property {string} consoleDone  The word beside exit 0 (js/console.js) [kpadopt6]
 * @property {string} consoleFailed  The word beside a non-zero exit (js/console.js) [kpadopt6]
 * @property {string} consoleRefused  A block the app refused (js/console.js) [kpadopt6]
 * @property {string} consoleCancelled  A block that was stopped (js/console.js) [kpadopt6]
 * @property {string} consoleLost  A block whose connection dropped (js/console.js) [kpadopt6]
 * @property {string} consoleCopyCommand  The block's button that copies its command (js/console.js) [kpadopt6]
 * @property {string} consoleCopyOutput  The block's button that copies its output (js/console.js) [kpadopt6]
 * @property {string} consoleAgain  The block's button that runs its command again (js/console.js) [kpadopt6]
 * @property {string} consoleRecheck  The lost block's button that runs it again to see (js/console.js) [kpadopt6]
 * @property {string} consoleCancel  The running block's button that stops it (js/console.js) [kpadopt6]
 * @property {string} consoleCollapse  The block's button that folds it (js/console.js) [kpadopt6]
 * @property {string} consoleExpand  The block's button that opens it again (js/console.js) [kpadopt6]
 * @property {string} consoleCopied  A copy button's result word (js/console.js) [kpadopt6]
 * @property {string} consoleNotCopied  A copy button's refusal word (js/console.js) [kpadopt6]
 * @property {string} consoleLostWhat  A lost block's what (js/console.js) [kpadopt6]
 * @property {string} consoleLostNow  A lost block's what now (js/console.js) [kpadopt6]
 * @property {string} consoleRefusedWhat  A refusal's what when the app gave none (js/console.js) [kpadopt6]
 * @property {string} consoleNoOutput  A finished block with nothing written (js/console.js) [kpadopt6]
 * @property {string} consoleOutput  The output block's title (js/console.js) [kpadopt6]
 * @property {string} consoleWaitingOutput  A running block that has written nothing yet (js/console.js) [kpadopt6]
 * @property {string} consoleRetry  The failed plate's button (js/console.js) [kpadopt6]
 * @property {string} consoleLoading  The words under the busy card while the console loads (js/console.js) [kpadopt6]
 * @property {(n: number) => string} consoleEarlier  The line that stands for blocks folded away (js/console.js) [kpadopt6]
 * @property {string} consoleEmptyTitle  The empty plate's heading (js/console.js) [kpadopt6]
 * @property {string} consoleEmptyText  Its sentence (js/console.js) [kpadopt6]
 * @property {(code: number) => string} consoleFinishedOk  Said when the last command succeeded (js/console.js) [kpadopt6]
 * @property {(code: number) => string} consoleFinishedFailed  Said when the last command failed (js/console.js) [kpadopt6]
 * @property {string} consoleFinishedRefused  Said when the last command was refused (js/console.js) [kpadopt6]
 * @property {(command: string) => string} consoleConfirmSaid  Said when a line needs a second press (js/console.js) [kpadopt6]
 * @property {string} consoleCleared  The toast and the line after Clear (js/console.js) [kpadopt6]
 * @property {string} consoleCompletions  The completion list's name (js/console.js) [kpadopt6]
 * @property {(n: number) => string} consoleMatches  Said after Tab found several (js/console.js) [kpadopt6]
 * @property {string} consoleKeyClear  The shortcut sheet's line for Ctrl L (js/console.js) [kpadopt6]
 * @property {string} consoleKeyGroup  The sheet's heading (js/console.js) [kpadopt6]
 * @property {string} consoleKeyFocus  The sheet's line for the focus key (js/console.js) [kpadopt6]
 * @property {string} consoleKeyFocusReason  Why the focus key does nothing now (js/console.js) [kpadopt6]
 * @property {(n: number) => string} qrShowAllChars  The button that unfolds a long link under the code (js/qr.js) [kpadopt6]
 * @property {string} qrShowLess  The button that folds it again (js/qr.js) [kpadopt6]
 * @property {(item: string) => string} ratingGroupName  The star row's name for a screen reader: "Rating for Lasagne" (js/rating.js) [kpadopt6]
 * @property {string} ratingGroupNameBare  The same when the row names no item [kpadopt6]
 * @property {(n: number, max: number) => string} ratingStarName  One star's name: "4 of 5" [kpadopt6]
 * @property {(n: number, max: number, label: string) => string} ratingStarNameLabel  The same with its word: "4 of 5, Good" [kpadopt6]
 * @property {(value: number, max: number) => string} ratingRated  A display row's name: "Rated 4 of 5" [kpadopt6]
 * @property {(value: number, max: number, count: number) => string} ratingRatedCount  The same with how many people rated: "Rated 4.5 of 5 by 12 people" [kpadopt6]
 * @property {string} ratingUnrated  The line, and the name, of a row nobody has rated: "Not rated yet" [kpadopt6]
 * @property {string} ratingTap  The caption of an input row with no rating: "Tap a star" [kpadopt6]
 * @property {string} ratingClear  The small button that removes the rating [kpadopt6]
 * @property {(item: string) => string} ratingClearName  That button's accessible name: "Clear the rating for Lasagne" [kpadopt6]
 * @property {(value: number, max: number) => string} ratingOutOf  The caption of a rated row without words per level: "4 of 5" [kpadopt6]
 * @property {(value: number, count: number) => string} ratingAverage  An aggregated score: "4.5 (12)" [kpadopt6]
 * @property {(item: string, value: number, max: number) => string} ratingAnnounce  What is said when the rating changes: "Lasagne: 4 of 5" [kpadopt6]
 * @property {(item: string) => string} ratingAnnounceCleared  What is said when the rating is removed: "Lasagne: rating removed" [kpadopt6]
 * @property {(item: string, value: number) => string} ratingToast  The undo toast's line: "Lasagne: 4 stars" [kpadopt6]
 * @property {(item: string) => string} ratingToastCleared  The undo toast's line after Clear [kpadopt6]
 * @property {string} ratingLoading  The row's name while the saved value is read [kpadopt6]
 * @property {string} ratingFailedRead  The words that replace the stars when the value could not be read [kpadopt6]
 * @property {string} ratingRetry  Its button [kpadopt6]
 * @property {(item: string) => string} ratingSaveFailed  The line under the row when a save was refused: "Could not save the rating for Lasagne" [kpadopt6]
 * @property {string} ratingSaving  The row's description while a save is on its way [kpadopt6]
 * @property {string} ratingConfirm  The button that saves a pending rating (commit confirm) [kpadopt6]
 * @property {string} ratingCancel  The button that drops a pending rating [kpadopt6]
 * @property {(value: number, max: number) => string} ratingPending  The line over those two buttons: "4 of 5, not saved yet" [kpadopt6]
 * @property {string} ratingReadonly  What a screen reader hears on a row that cannot be changed by this person [kpadopt6]
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
 * @property {(n: number, total: number) => string} focusQuestionCount  The count over a question: "Question 3 of 7" (js/focus-steps.js, answer mode) [kpadopt6]
 * @property {(label: string, n: number, total: number) => string} focusAnswered  What a screen reader hears after an answer: "Answered Matig. Question 4 of 7" [kpadopt6]
 * @property {(label: string) => string} focusSameYesterday  The button that repeats yesterday's answer: "Same as yesterday: Matig" [kpadopt6]
 * @property {(label: string) => string} focusSameUsual  The button that takes the usual answer: "Same as usual: Goed" [kpadopt6]
 * @property {string} focusSkip  The button that passes a question: "Not today" [kpadopt6]
 * @property {string} focusSkipped  What a skipped question reads as in the summary [kpadopt6]
 * @property {string} focusReview  The next button on the last question when a summary follows [kpadopt6]
 * @property {string} focusSummaryTitle  The summary screen's name [kpadopt6]
 * @property {string} focusMultiHint  The line under a question that takes several answers [kpadopt6]
 * @property {string} focusTextLabel  The name of the box of a written answer [kpadopt6]
 * @property {string} focusPickedMark  The word a chosen answer carries for a screen reader besides the mark [kpadopt6]
 * @property {string} focusResumeAsk  The question when a check-in was left half way: "Continue where you stopped?" [kpadopt6]
 * @property {string} focusResumeContinue  Its yes [kpadopt6]
 * @property {string} focusResumeRestart  Its start over [kpadopt6]
 * @property {(n: number) => string} focusResumed  What is said when answers are put back: "Back at question 4" [kpadopt6]
 * @property {string} focusAnswerEmptyTitle  The plate of a day with no questions [kpadopt6]
 * @property {string} focusAnswerEmptyText  Its sentence: nothing is waiting [kpadopt6]
 * @property {string} focusAnswerFailedTitle  The plate of questions that could not be read [kpadopt6]
 * @property {string} focusAnswerFailedText  Its sentence [kpadopt6]
 * @property {string} focusRetry  Its button [kpadopt6]
 * @property {string} focusSaveFailedTitle  The plate when the finished answers could not be saved [kpadopt6]
 * @property {string} focusSaveFailedText  Its sentence: nothing is lost [kpadopt6]
 * @property {string} focusSaveRetry  Its button: "Try again" [kpadopt6]
 * @property {string} focusAnswerLoading  The words under the loading card of the questions [kpadopt6]
 * @property {string} usualLabel  The label over the usual band of a picker (js/usual-picker.js) [kpadopt6]
 * @property {string} usualAll  The label over the full list under the band [kpadopt6]
 * @property {(usual: number, more: number) => string} usualStatus  The status line of a picker with a band: "5 usual, 33 more" [kpadopt6]
 * @property {(n: number) => string} usualShowAll  The row that unfolds the full list: "Show all 38", the exact number [kpadopt6]
 * @property {string} usualShowFewer  The same row once the list is open [kpadopt6]
 * @property {(label: string) => string} usualAdd  The row that adds what was typed: "Add 'hoofdpjn' as new" [kpadopt6]
 * @property {(name: string) => string} usualDidYouMean  A close name offered for what was typed: "Did you mean Hoofdpijn?" [kpadopt6]
 * @property {string} usualNoMatchTitle  The plate over a search that matches nothing [kpadopt6]
 * @property {string} usualNoMatchText  Its sentence when a name can be added [kpadopt6]
 * @property {string} usualNoMatchTextFixed  Its sentence when nothing can be added [kpadopt6]
 * @property {(label: string) => string} usualSelectedExisting  What is said when typed text named an item already in the list: "Hoofdpijn was already in the list, selected" [kpadopt6]
 * @property {(label: string) => string} usualAdded  What is said after an add: "Hoofdpijn added" [kpadopt6]
 * @property {(label: string) => string} usualAddedToast  The undo toast's line after an add: "Added 'Neksteun'" [kpadopt6]
 * @property {string} usualEmptyTitle  The plate of a picker with no items at all [kpadopt6]
 * @property {string} usualEmptyText  Its sentence when a name can be added [kpadopt6]
 * @property {string} usualEmptyTextFixed  Its sentence when nobody can add here [kpadopt6]
 * @property {string} usualAddButton  Its button [kpadopt6]
 * @property {string} usualFailedTitle  The plate of a list that could not be read [kpadopt6]
 * @property {string} usualFailedText  Its sentence [kpadopt6]
 * @property {string} usualRetry  Its button [kpadopt6]
 * @property {string} usualLoading  The words under the loading card of a picker [kpadopt6]
 * @property {string} usualNotToday  The check's button that says a usual choice did not happen today [kpadopt6]
 * @property {(label: string) => string} usualNotTodayName  Kept for consumers: a not-today button's accessible name, "Hoofdpijn: not today" [kpadopt6]
 * @property {(label: string) => string} usualNotTodayAnnounce  What is said when it is set: "Hoofdpijn: not today" [kpadopt6]
 * @property {string} usualNotTodayMark  The word a screen reader hears after a chip that is not today [kpadopt6]
 * @property {string} usualJump  The `?` sheet's words for Alt U: "Jump to the usual choices" [kpadopt6]
 * @property {(label: string) => string} usualAlreadyPicked  The list's line, and what is said, when a name typed is already picked: "Headache is already picked" [kpadopt6]
 * @property {(label: string) => string} usualPicked  What is said when the check's "Had it" picks a choice: "Headache: had it" [kpadopt6]
 * @property {(typed: string, label: string) => string} usualTookClosest  What is said when Enter took the closest name: "Fatigu: took Fatigue" [kpadopt6]
 * @property {(label: string) => string} usualAsk  What is said when Enter lit the first "Did you mean" row: "Did you mean Fatigue? Enter picks it" [kpadopt6]
 * @property {(label: string) => string} usualAddedNote  The line under the field after an add: "Added 'Neksteun' as new" [kpadopt6]
 * @property {string} usualUndo  Its button [kpadopt6]
 * @property {(label: string) => string} usualUndoName  That button's accessible name: "Undo adding Neksteun" [kpadopt6]
 * @property {(label: string) => string} usualAddUndone  What is said after that Undo: "Neksteun taken out again" [kpadopt6]
 * @property {string} usualCheckTitle  The heading over the check of the usual choices [kpadopt6]
 * @property {string} usualCheckWhat  The line under it in the rows look: what Not today means [kpadopt6]
 * @property {string} usualCheckWhatChips  The line under it in the chips look: what a press does and what Not today means [kpadopt6]
 * @property {string} usualHadIt  The check's button that says the choice happened today (it picks it) [kpadopt6]
 * @property {string} usualHadItWord  The word a screen reader hears after a chip that is had it [kpadopt6]
 * @property {(label: string) => string} usualUnanswered  What is said when an answer is taken back: "Headache: not answered" [kpadopt6]
 * @property {string} usualUnansweredWord  The word a screen reader hears after a chip with no answer [kpadopt6]
 */

/**
 * The defaults. English, by Kenny's decision of 2026-09-04 — the package
 * has to speak something, and English is the language a consumer is least
 * likely to have to replace.
 *
 * @type {Strings}
 */
export const DEFAULT_STRINGS = Object.freeze({
    // The toggle button (js/toggle.js) [kpadopt6-ops].
    toggleCounting: 'counting',
    toggleOn: (label, count) => (count === null ? `${label} on` : `${label} on, ${count} shown`),
    toggleOff: (label, count) => (count === null ? `${label} off` : `${label} off, ${count} shown`),
    toggleCount: (label, n) => `${label}: ${n}`,
    toggleClear: (n) => `Clear filters (${n})`,
    toggleRefused: 'Refused',
    toggleKeyWhat: (label) => `Turn ${label} on or off`,
    toggleKeyGroup: 'Filters',
    // The palette that finds words in any order (js/intent.js, js/palette.js) [kpadopt6-ops].
    intentNoMatch: 'Try other words, or fewer of them.',
    intentNoSubject: (name, verb, subjects, noun) =>
        `There is no ${noun === '' ? 'match' : noun} called "${name}". ${verb} works on: ${subjects.join(', ')}.`,
    paletteNothing: 'Nothing matches',
    paletteCapped: (shown, total) => `${shown} of ${total} shown, type more words`,
    paletteLoading: 'Loading the commands…',
    paletteFailed: 'The commands could not be read',
    paletteFailedText: 'The places below still work.',
    paletteRetry: 'Retry',
    // The version jump chip (js/version-delta.js) [kpadopt6-ops].
    versionMajor: 'major',
    versionMinor: 'minor',
    versionPatch: 'patch',
    versionOther: 'changed',
    versionDowngrade: 'older',
    versionSame: 'up to date',
    versionUnknown: 'unknown',
    versionNoUpdates: 'nothing to update',
    versionLoading: 'checking the version',
    versionFailed: 'could not check',
    versionNone: 'not tracked',
    versionNotes: 'release notes, opens in a new tab',
    versionSpoken: (from, to, level) => `from ${from} to ${to}, ${level} update`,
    versionSpokenSame: (version) => `${version}, up to date`,
    versionSpokenTo: (to) => `going to ${to}`,
    versionSpokenDown: (from, to) => `from ${from} back to ${to}, an older version`,
    versionSpokenChanged: (from, to) => `changed from ${from} to ${to}`,
    // The acknowledge gate (js/ack-gate.js) [kpadopt6-ops].
    ackLink: 'Read the release notes',
    ackLabel: 'I read the release notes',
    ackRetry: 'Retry',
    ackLooking: 'Looking up the release notes',
    ackLocked: 'The update is running',
    ackOpenFirst: 'Open the release notes first',
    ackReason: (label) => `Tick "${label}" first`,
    ackReasonMany: (remaining, total) => `${remaining} of ${total} release notes still to read`,
    ackEnabled: 'Update enabled',
    ackDisabled: (remaining) => `Update disabled: ${remaining} release ${remaining === 1 ? 'note' : 'notes'} still to read`,
    ackNoLink: 'No release notes link found',
    // The dependency list (js/deplist.js) [kpadopt6-ops].
    deplistCount: (n) => `${n} ${n === 1 ? 'dependency' : 'dependencies'}`,
    deplistReading: 'Reading what depends on what',
    deplistNeeds: (from, to) => `${from} needs ${to}`,
    deplistReaches: (from, to) => `${from} reaches ${to}`,
    deplistNeedsWord: 'needs',
    deplistMore: (n) => `Show all ${n}`,
    deplistFewer: 'Show fewer',
    deplistEmpty: 'Nothing depends on these',
    deplistFailed: 'The dependencies could not be read',
    deplistFailedText: 'Try again in a moment.',
    deplistRetry: 'Retry',
    deplistLoading: 'Reading the dependencies…',
    deplistRunning: 'running',
    deplistStopped: 'stopped',
    deplistUnknown: 'unknown',
    deplistCopy: 'Copy as text',
    deplistCopied: 'Copied',
    // The path of a connection (js/path-trace.js) [kpadopt6-ops].
    traceLabel: 'The path of the connection',
    traceAllowed: 'Allowed',
    traceBlocked: (hop, rule) => (rule === '' ? `Blocked at ${hop}` : `Blocked at rule "${rule}"`),
    traceNotAll: 'Not every step could be measured',
    traceAllowedWord: 'allowed',
    traceRefusedWord: 'refused',
    traceNotReached: 'not reached',
    traceNotMeasured: 'not measured',
    traceRule: (rule) => `Rule ${rule}`,
    traceRunning: 'Checking the path…',
    traceEmpty: 'Pick a source and a target',
    traceEmptyText: 'The path they take shows here.',
    traceFailed: 'The path could not be checked',
    traceFailedText: 'Try again in a moment.',
    traceRetry: 'Retry',
    traceCopy: 'Copy as text',
    traceCopied: 'Copied',
    traceSwap: 'Swap direction',
    traceKeySwap: 'Swap source and target',
    traceKeyGroup: 'Path',
    // The entity card (js/entity-card.js) [kpadopt6-ops].
    entitySelect: (name) => `Select ${name}`,
    entityFailed: 'failed',
    entityNotMeasured: 'not measured',
    entityMoreFlags: (n) => `${n} more ${n === 1 ? 'flag' : 'flags'}`,
    entityFlagsLabel: 'More flags',
    entityRetry: 'Retry',
    entityMore: 'More',
    entityMoreLabel: 'More actions',
    entityLoading: 'Reading the stacks…',
    entityGridFailed: 'The stacks could not be read',
    entityGridFailedText: 'Try again in a moment.',
    entityGridEmpty: 'No stacks yet',
    entityNew: 'New stack',
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
    // A step list's states and its announcement (js/steplist.js).
    stepPending: 'waiting',
    stepRunning: 'running',
    stepDone: 'done',
    stepFailed: 'failed',
    stepSkipped: 'skipped',
    stepCurrent: 'current',
    stepAnnounce: (title, state) => `${title}: ${state}`,
    // A status row's states, its Retry and its announcement (js/statusrow.js).
    statusOk: 'ok',
    statusLoading: 'loading',
    statusFailed: 'failed',
    statusEmpty: 'nothing to show',
    statusWarn: 'needs attention',
    // A card's data states (js/card-state.js).
    cardLoading: 'Loading…',
    cardEmpty: 'Nothing to show yet.',
    cardFailed: 'Could not be read.',
    cardRetry: 'Try again',
    statusRetry: 'Retry',
    statusRetryLabel: (label) => `Retry ${label}`,
    statusAnnounce: (label, state, detail) => (detail ? `${label}: ${state}, ${detail}` : `${label}: ${state}`),
    statusAnnounceMany: (count, failed) => (failed ? `${count} updated, ${failed} failed` : `${count} updated`),
    // A facet list's "only" button and its announcements (js/facets.js).
    facetOnly: 'only',
    facetOnlyLabel: (label) => `Show only ${label}`,
    facetAll: 'Everything',
    facetShowingOnly: (label) => `Showing only ${label}`,
    facetShowingAll: 'Showing everything',
    // Data pieces [kpadopt4-data]: the identity mark, the share bar, the bullet list and the code block.
    idmarkUnknown: '?',
    // People [kpadopt5-people]: the avatar, the sign-in methods list, the conversation and the chart's markers.
    idmarkOnline: 'online',
    idmarkAway: 'away',
    idmarkBusy: 'busy',
    idmarkLabel: (name, status) => `${name}, ${status}`,
    idmarkGroup: (count) => `${count} ${count === 1 ? 'person' : 'people'}`,
    idmarkMore: (count) => `Show the ${count} more ${count === 1 ? 'person' : 'people'}`,
    idmarkMoreTitle: (count) => `${count} more ${count === 1 ? 'person' : 'people'}`,
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
    stackbarRest: 'Free',
    stackbarOther: 'Other',
    stackbarPart: (label, value, percent) => `${label}: ${value} (${percent})`,
    stackbarOver: (value) => `Over by ${value}`,
    stackbarLabel: (parts) => parts.join('; '),
    stackbarLoading: 'Reading…',
    stackbarEmpty: 'Not read yet.',
    stackbarError: 'Could not be read.',
    stackbarRetry: 'Retry',
    bulletsLoading: 'Reading…',
    bulletsEmpty: 'Nothing to show.',
    bulletsError: 'Could not be read.',
    bulletsRetry: 'Retry',
    bulletsUnknown: 'nothing to measure',
    bulletsValueText: (figure, threshold) => `${figure}; the threshold is ${threshold}`,
    codeLabel: 'Code',
    codeWrap: 'Wrap',
    codePretty: 'Pretty',
    codeRaw: 'Raw',
    codeFormat: 'Layout',
    codeShowAll: (lines) => `Show all ${lines} lines`,
    codeShowLess: 'Show less',
    codeLines: (lines) => (lines === 1 ? '1 line' : `${lines} lines`),
    codeEmpty: 'Nothing to show.',
    codeBinary: (size) => `Binary data (${size}), not shown as text.`,
    codeTruncated: (shown, total) => `Showing the first ${shown} of ${total}.`,
    codeLoading: 'Reading…',
    codeError: 'Could not be read.',
    codeCopiedAnnouncement: (title) => `${title} copied`,
    // The rows group, formal first (js/row-select.js, selection-bar.js, undo-toast.js, newpill.js, request-inspector.js) [kpadopt5].
    rowSelectCount: (n) => (n === 0 ? 'None selected' : `${n} selected`),
    rowSelectSkipped: (n) => `${n} skipped: cannot be selected`,
    rowSelectAllShown: (n) => `All ${n} rows shown are selected`,
    rowSelectCursor: (label, at, of) => `${label}, row ${at} of ${of}`,
    rowSelectMode: 'Selection mode: tap rows to tick them',
    rowSelectModeEnd: 'Selection mode ended',
    rowKeysMove: 'move',
    rowKeysTick: 'tick',
    rowKeysRange: 'tick up to here',
    rowKeysClear: 'clear',
    rowKeysOpen: 'open',
    rowKeysAll: 'tick all shown',
    selectionLabel: 'Selection',
    selectionCount: (n) => `${n} selected`,
    selectionClear: 'Untick all',
    selectionClearTitle: 'Untick every row (Esc)',
    selectionMore: (n) => `+${n} more`,
    selectionFewer: 'Show fewer',
    selectionActions: 'Actions',
    selectionMatching: (total) => `Select all ${total} that match`,
    selectionMatchingOn: (total) => `All ${total} that match are selected`,
    selectionOnlyShown: (n) => `Select only the ${n} shown`,
    selectionBusy: (words) => words || 'Working…',
    selectionResult: (done, refused) => (refused === 0 ? `${done} done` : `${done} done, ${refused} refused`),
    selectionDropped: (n) => (n === 1 ? '1 selected row is no longer in the list' : `${n} selected rows are no longer in the list`),
    selectionCan: (can, total) => `${can} of ${total}`,
    selectionCleared: 'Selection cleared',
    undoToastUndo: 'Undo',
    undoToastKeyTitle: (key) => `Undo (${key})`,
    undoToastAnnounce: (text, seconds) => `${text}. Undo available for ${seconds} seconds`,
    undoToastClock: (seconds) => `${seconds} s`,
    undoToastRestored: 'Restored',
    undoToastSaving: 'Saving…',
    undoToastFailed: (why) => `Not done: ${why}`,
    undoToastDismiss: 'Dismiss',
    newpillUnitOne: 'line',
    newpillUnitMany: 'lines',
    newpillNew: (n, unit) => `${n} new ${unit}`,
    newpillBackTail: 'back to the tail',
    newpillBackHead: 'back to the top',
    newpillAnnounce: (n, unit) => `${n} new ${unit}`,
    newpillPause: 'Pause',
    newpillResume: 'Resume',
    newpillSince: (time) => `New since ${time}`,
    newpillPausedNote: 'Paused',
    newpillFollowing: 'Following the latest',
    payloadEmpty: 'empty payload',
    payloadBinary: (size) => (size ? `binary, ${size}` : 'binary'),
    payloadOpen: 'Open full payload',
    payloadDownload: 'Download',
    payloadShowAll: (lines) => `Show all ${lines} lines`,
    payloadCopyFull: 'Copy',
    jsonValidKeys: (n) => `Valid JSON · ${n === 1 ? '1 key' : `${n} keys`}`,
    jsonValidItems: (n) => `Valid JSON · ${n === 1 ? '1 item' : `${n} items`}`,
    jsonValidValue: 'Valid JSON',
    jsonInvalid: (line, column, why) => `Line ${line}, column ${column}: ${why}`,
    jsonInvalidPlain: (why) => why,
    jsonPlainText: 'Plain text, not JSON',
    jsonEmpty: 'Empty',
    jsonFormat: 'Format',
    jsonMinify: 'Minify',
    jsonWrap: 'Wrap',
    jsonCopy: 'Copy',
    jsonTabHint: 'Tab indents. Esc, then Tab, leaves the field.',
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
    toolbarShowingOnly: 'Showing only',
    toolbarClearAll: 'Clear all',
    keysLabel: 'Keyboard shortcuts',
    heatLoading: 'Reading…',
    heatEmpty: 'Nothing to show.',
    heatFailed: 'Could not be read.',
    matrixSelf: 'itself',
    matrixUnknown: 'unknown',
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
    // The secret field [kpadopt4]: a masked value shown on request for a few seconds, copied without being shown.
    secretLabel: 'Secret',
    secretReveal: 'Reveal',
    secretHide: 'Hide',
    secretHold: 'Hold to reveal',
    secretCopy: 'Copy',
    secretReading: 'Reading…',
    secretRetry: 'Try again',
    secretHidesIn: (seconds) => `Hides in ${seconds} s`,
    secretPaused: 'Paused while you select it',
    secretStaysShown: 'Shown until you hide it',
    secretShown: (seconds) => (seconds > 0 ? `Shown. Hides in ${seconds} s.` : 'Shown.'),
    secretHidden: 'Hidden again',
    secretFailed: (reason) => `Could not read it: ${reason}`,
    secretNoSource: 'there is nothing to read it from',
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
    calendarNav: 'Month',
    calendarPrev: '‹ Prev',
    calendarNext: 'Next ›',
    calendarToday: 'Today',
    calendarTodayTitle: 'Show this month and select today',
    calendarDay: (date, label) => `${date}: ${label}`,
    calendarFuture: 'a day still to come',
    calendarLoading: 'being read',
    calendarUnknown: 'nothing known about this day',
    // The week agenda and the run timeline [kpadopt-time].
    weekGroup: 'Week agenda',
    weekPrev: '‹ Prev',
    weekNext: 'Next ›',
    weekToday: 'Today',
    weekNow: 'now',
    weekNowAt: (time) => `now, ${time}`,
    weekMore: (n) => `+${n}`,
    weekMoreLabel: (n, day) => `${n} more on ${day}`,
    weekNextRun: 'next run',
    weekOff: 'off',
    weekSkipped: 'skipped',
    weekReference: 'for reference',
    weekEmpty: 'Nothing is planned in this week.',
    weekLoading: 'Reading the week',
    ganttGroup: 'Run timeline',
    ganttRange: 'Range',
    ganttRangeTitle: (label) => `Show ${label}`,
    ganttNow: 'now',
    ganttSelection: 'Selected',
    ganttClear: 'Clear',
    ganttClearTitle: 'Lift the selected range',
    ganttSelected: (from, to) => `${from} to ${to}`,
    ganttEmpty: 'No run in this window.',
    ganttLoading: 'Reading the history',
    ganttQueued: 'queued',
    ganttRunning: 'running',
    ganttOk: 'succeeded',
    ganttFailed: 'failed',
    ganttAnnounce: (label, state) => `${label}: ${state}`,
    ganttBar: (label, when, state) => `${label}, ${when}, ${state}`,
    ganttLive: 'Live',
    ganttLiveTitle: 'Follow now: the window moves with the clock',
    ganttZoom: 'Zoom',
    ganttZoomTitle: 'Make the selected range the window',
    ganttDuration: (seconds) => {
        if (seconds < 60) return `${seconds} s`;
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest ? `${hours} h ${rest} min` : `${hours} h`;
    },
    ganttHint: 'Click a bar to open it · drag across the time to select a range',
    ganttAll: 'All',
    ganttAllTitle: 'Show everything on the timeline',
    ganttPoint: (label, when) => `${label}, ${when}`,
    ganttPlanned: 'planned',
    ganttCluster: (count, labels) => `${count} events: ${labels}`,
    ganttClusterMore: (more) => `+${more}`,
    ganttPointsHint: 'Point at a mark to read it · arrows walk the marks · Enter opens one',
    pipelineLoading: 'Reading the board',
    pipelineEmpty: 'Nothing on the board yet.',
    pipelineFailed: (reason) => (reason ? `Could not read the board: ${reason}` : 'Could not read the board.'),
    pipelineRetry: 'Try again',
    pipelineNone: 'none',
    pipelineMore: (more) => `+${more} more`,
    pipelineLess: 'Show fewer',
    pipelineShare: (percent) => `${percent} % of all`,
    // The uptime strip [kpadopt4-ideas]: the figures are exact, never "9+".
    uptimeLoading: 'Reading the history…',
    uptimeEmpty: 'No data yet',
    uptimeError: 'The history could not be read.',
    uptimePercent: (percent) => `${percent}%`,
    uptimeIncidents: (n) => (n === 1 ? '1 incident' : `${n} incidents`),
    uptimeSummary: (percent, incidents) => `${percent}% up, ${incidents === 1 ? '1 incident' : `${incidents} incidents`}`,
    uptimeTrack: (label, summary) => `${label}: ${summary}`,
    uptimeStateWord: (state) => ({ up: 'up', degraded: 'degraded', down: 'down' })[state] ?? 'no data',
    uptimeCell: (label, state, percent, incidents) =>
        [
            label,
            state,
            percent === null ? null : `${percent} up`,
            incidents === null ? null : incidents === 1 ? '1 incident' : `${incidents} incidents`,
        ]
            .filter(Boolean)
            .join(' · '),
    uptimeShown: (shown, total) => `${shown} of ${total} shown`,
    uptimeInfoFigures: (percent, incidents) =>
        [percent === null ? null : `${percent}% up`, incidents === null ? null : incidents === 1 ? '1 incident' : `${incidents} incidents`]
            .filter(Boolean)
            .join(' · '),
    uptimeOpen: (label) => `Open ${label}`,
    // The typed confirmation [kpadopt4-ideas].
    typeConfirmLabel: (name) => `Type ${name} to confirm`,
    typeConfirmRuleExact: 'Type it exactly: capitals count; spaces at the start and the end are ignored.',
    typeConfirmRuleAnyCase: 'Capitals do not count; spaces at the start and the end are ignored.',
    typeConfirmMatched: 'Matches',
    typeConfirmMismatch: 'Does not match yet',
    typeConfirmLoses: 'This deletes, for good:',
    // The command block [kpadopt4-ideas].
    commandShell: (shell) => ({ wsl: 'WSL', powershell: 'PowerShell', cmd: 'cmd', garuda: 'Garuda', bash: 'bash' })[shell] ?? shell,
    commandAdmin: 'admin',
    commandAdminTitle: 'Run it in a terminal opened as administrator',
    commandSudo: 'sudo',
    commandSudoTitle: 'Runs with root rights; the terminal asks for your password',
    commandRunsOn: (where) => `Runs on ${where}`,
    // The two timers [kpadopt4-ideas].
    timerStart: 'Start',
    timerPause: 'Pause',
    timerResume: 'Resume',
    timerReset: 'Reset',
    timerAddMinute: (seconds) => (seconds % 60 === 0 ? `+${seconds / 60} min` : `+${seconds} s`),
    timerAddMinuteTitle: (seconds) => (seconds % 60 === 0 ? `Add ${seconds / 60} min` : `Add ${seconds} s`),
    timerPaused: 'Paused',
    timerEnded: 'Time is up',
    timerEndedNamed: (name) => `${name}: time is up`,
    timerStarted: 'Started',
    timerResumed: 'Going on',
    timerLeft: (duration) => `${duration} left`,
    timerDuration: (seconds) => {
        if (seconds < 60) return `${seconds} s`;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return [h ? `${h} h` : '', m ? `${m} min` : '', s ? `${s} s` : ''].filter(Boolean).join(' ');
    },
    timerDiscLeft: (left, total) => `${left} left of ${total}`,
    timerUnderMinute: 'under a minute',
    timerDiscCaption: (name, duration) => `${name} · ${duration}`,
    // The range picker [kpadopt4-ideas].
    rangePresets: 'Ranges',
    rangePresetName: (key) => {
        const m = /^(\d+)\s*([mhdw])$/.exec(key.trim().toLowerCase());
        if (!m) return key;
        const n = Number(m[1]);
        const unit = /** @type {Record<string, string>} */ ({ m: 'minute', h: 'hour', d: 'day', w: 'week' })[m[2]];
        return n === 1 ? `Last ${unit}` : `Last ${n} ${unit}s`;
    },
    rangePresetShort: (key) => key,
    rangeCustom: 'Custom…',
    rangeCustomTitle: 'Custom range',
    rangeCustomName: 'Custom',
    rangeFrom: 'From',
    rangeTo: 'To',
    rangeDateLabel: (bound) => `${bound}, date (dd/mm/yyyy)`,
    rangeTimeLabel: (bound) => `${bound}, time (HH:MM, 24 hours)`,
    rangeTimeHint: 'HH:MM',
    rangeApply: 'Apply',
    rangeCancel: 'Cancel',
    rangeLabel: (name, from, to) => `${name} · ${from} – ${to}`,
    rangeErrorDate: (bound) => `${bound}: type a whole date, dd/mm/yyyy.`,
    rangeErrorTime: (bound) => `${bound}: type a time of day, 00:00 to 23:59.`,
    rangeErrorOrder: 'The end must come after the start.',
    rangeErrorFuture: 'The end lies in the future.',
    rangeErrorSpan: (days) => `A range spans at most ${days} days.`,
    // The weekday picker (js/weekdays.js) [kpadopt5-time].
    weekdaysGroup: 'Days',
    weekdaysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    weekdaysNarrow: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    weekdaysLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    weekdaysLast: 'Last',
    weekdaysLastDay: 'last day',
    weekdaysAnd: 'and',
    weekdaysPresets: 'Quick picks',
    weekdaysPresetWeekdays: 'Weekdays',
    weekdaysPresetWeekend: 'Weekend',
    weekdaysPresetEvery: 'Every day',
    weekdaysNone: 'No day picked',
    weekdaysEvery: 'Every day',
    weekdaysWeekdays: 'Every weekday',
    weekdaysWeekend: 'Every weekend',
    weekdaysOrdinal: (n) => {
        const rest = n % 100;
        const suffix = rest >= 11 && rest <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
        return `${n}${suffix}`;
    },
    weekdaysOnThe: (list) => `On the ${list}`,
    weekdaysMin: (n) => (n === 1 ? 'Pick at least one day.' : `Pick at least ${n} days.`),
    // The next-times list (js/runs.js) [kpadopt5-time].
    runsTitle: 'Next times',
    runsNow: 'now',
    runsIn: (distance) => `in ${distance}`,
    runsClockChange: (hours) => `Clock goes ${hours > 0 ? 'forward' : 'back'} ${Math.abs(hours)} h`,
    runsMore: (n) => `Show ${n} more`,
    runsFewer: 'Show fewer',
    runsEmpty: 'No time to show yet.',
    runsFailed: 'Could not work out the next times',
    runsRetry: 'Try again',
    runsLoading: 'Working out the next times…',
    runsNext: (moment) => `Next run: ${moment}`,
    // The snooze picker (js/snooze.js) [kpadopt5-time].
    snoozeTrigger: 'Remind me later',
    snoozeChange: 'Snooze again',
    snoozeChoicesLabel: 'Remind me',
    snoozeIn: (key) => {
        const m = /^(\d+)\s*([mhdw])$/.exec(key.trim().toLowerCase());
        if (!m) return key;
        const n = Number(m[1]);
        const unit = /** @type {Record<string, string>} */ ({ m: 'minute', h: 'hour', d: 'day', w: 'week' })[m[2]];
        return `In ${n} ${unit}${n === 1 ? '' : 's'}`;
    },
    snoozeTonight: (time) => `This evening ${time}`,
    snoozeTomorrow: (time) => `Tomorrow ${time}`,
    snoozeMonday: (time) => `Monday ${time}`,
    snoozeNextWeek: (time) => `Next week ${time}`,
    snoozeLast: 'Your last pick',
    snoozePick: 'Pick a date and time…',
    snoozePickHint: 'Any moment in the next days',
    snoozePickTitle: 'Remind me on',
    snoozeDateLabel: 'Date (dd/mm/yyyy)',
    snoozeTimeLabel: 'Time (HH:MM, 24 hours)',
    snoozeApply: 'Snooze',
    snoozeCancel: 'Cancel',
    snoozeUntil: (moment) => `Snoozed until ${moment}`,
    snoozeNone: 'Not snoozed',
    snoozeEnd: 'End snooze',
    snoozeSaving: 'Saving the reminder',
    snoozeErrorDate: 'Type a whole date, dd/mm/yyyy.',
    snoozeErrorTime: 'Type a time of day, 00:00 to 23:59.',
    snoozeErrorPast: 'Pick a moment in the future.',
    snoozeErrorMax: (days) => `A reminder can be at most ${days} days away.`,
    // The dated option picker (js/dated-options.js) [kpadopt5-time].
    datedGroup: 'Options',
    datedLatest: 'Latest',
    datedJustNow: 'just now',
    datedAgo: (distance) => `${distance} ago`,
    datedSearch: 'Search by date or name',
    datedChosen: (name) => `${name} chosen`,
    datedEmpty: 'Nothing to choose yet.',
    datedFailed: 'Could not load the options',
    datedRetry: 'Try again',
    datedLoading: 'Loading the options…',
    // The sentence form (js/sentence.js) [kpadopt5-time].
    sentenceEmpty: (label) => `(${label || '…'})`,
    sentenceWhy: (field, why) => `${field}: ${why}`,
    sentenceField: 'Field',
    // The slider (js/slider.js) [kpadopt5-time].
    sliderGroup: 'Value',
    sliderMin: (label) => `${label}, minimum`,
    sliderMax: (label) => `${label}, maximum`,
    sliderValue: (label) => `${label}, value`,
    sliderInvalid: (min, max, unit) => `Type a number from ${min} to ${max}${unit ? ` ${unit}` : ''}.`,
    sliderGap: (gap, unit) => `The two values must be at least ${gap}${unit ? ` ${unit}` : ''} apart.`,
    // Media: the growing box, anchors, printing, the viewer, the document preview, the gallery and the uses map [kpadopt6-media].
    // kpadopt6-media:start
    autosizeChars: (n, text) => `${text} ${n === 1 ? 'character' : 'characters'}`,
    autosizeLines: (n, text) => `${text} ${n === 1 ? 'line' : 'lines'}`,
    autosizeBoth: (chars, charsText, lines, linesText) =>
        `${charsText} ${chars === 1 ? 'character' : 'characters'}, ${linesText} ${lines === 1 ? 'line' : 'lines'}`,
    autosizeOf: (text, maxText) => `${text} of ${maxText} characters`,
    autosizeFull: (maxText) => `Limit of ${maxText} characters reached.`,
    autosizeNear: (charsText, maxText) => `${charsText} of ${maxText} characters used.`,
    autosizeSubmit: 'Send the form from this box',
    autosizeGroup: 'In a text box',
    autosizeLoading: 'Loading the text…',
    autosizeFailed: 'This text could not be saved. It is still here.',
    anchorCopyLink: (name) => `Copy link to ${name}`,
    anchorCopied: 'Copied',
    anchorFailed: 'Not copied',
    anchorCopiedAnnounce: (name) => `Link to ${name} copied`,
    anchorFailedAnnounce: 'The link could not be copied',
    anchorMissing: 'That item is no longer here.',
    anchorShowAll: 'Show the whole list',
    anchorKeyCopy: 'Copy link to this row',
    anchorKeyGroup: 'On a row',
    printLoading: 'The list was still loading when this sheet was printed.',
    printStamp: (moment) => `Printed ${moment}`,
    viewerOpenNew: 'Open in a new tab',
    viewerDownload: 'Download',
    viewerPrint: 'Print',
    viewerCopyLink: 'Copy link',
    viewerNoFile: 'No file yet',
    viewerLoading: 'Opening…',
    viewerFailedTitle: 'Could not open this file',
    viewerFailedText: 'Nothing was changed. You can still open it in a new tab or download it.',
    viewerUnsupportedTitle: 'This browser cannot show it here',
    viewerUnsupportedText: 'Open it in a new tab or download it instead.',
    viewerRetry: 'Retry',
    viewerPosition: (index, total) => `${index} of ${total}`,
    previewKeyGroup: 'In a document preview',
    previewKeyOpen: 'Open the file in a new tab',
    previewKeyDownload: 'Download the file',
    previewKeyPrint: 'Print the file',
    previewKeyPrevious: 'Previous document',
    previewKeyNext: 'Next document',
    previewTimeout: 'The file took too long to open.',
    previewGone: 'The server says this file is gone.',
    previewServer: (status) => `The server could not give the file (error ${status}).`,
    previewNoPdf: 'This browser cannot show PDFs here. Open the file in a new tab or download it.',
    previewShownByBrowser: "Shown by your browser's PDF viewer",
    previewImage: 'The picture could not be loaded.',
    previewNoFile: 'No file yet',
    docKindImage: 'Picture',
    docKindText: 'Text',
    docMissing: 'No file yet',
    docKindName: (kind) =>
        ({ pdf: 'PDF document', doc: 'Word document', sheet: 'Spreadsheet', image: 'Picture', text: 'Text file' })[kind] ?? 'Document',
    galleryContinue: 'Continue where you were',
    galleryFailed: 'The pictures could not be loaded',
    galleryFailedText: 'Nothing was changed. Try again in a moment.',
    galleryEmpty: 'No pictures yet',
    galleryEmptyText: 'Pictures added here will show up as small tiles.',
    galleryEmptyAdd: 'Add the first ones and they will show up as small tiles.',
    galleryRetry: 'Retry',
    galleryAdd: 'Add pictures',
    galleryLoading: 'Loading the pictures…',
    galleryPicture: 'Picture',
    galleryOpenPicture: (name) => `Open picture: ${name}`,
    galleryOpenVideo: (name) => `Play video: ${name}`,
    galleryPictureFailed: 'Could not load this picture',
    galleryPictureFailedText: 'The other pictures still work: use the arrows.',
    galleryRetryPicture: (name) => `Retry loading ${name}`,
    galleryPrevious: 'Previous picture',
    galleryNext: 'Next picture',
    galleryFirst: 'This is the first picture',
    galleryLast: 'This is the last picture',
    galleryKeyGroup: 'In the picture viewer',
    galleryKeyPrevious: 'Previous picture',
    galleryKeyNext: 'Next picture',
    galleryKeyFirst: 'First picture',
    galleryKeyLast: 'Last picture',
    galleryKeyZoom: 'Zoom to 100 % and back',
    galleryKeyZoomIn: 'Zoom in',
    galleryKeyZoomOut: 'Zoom out',
    galleryKeyFull: 'Full screen',
    usesLabel: 'What uses what',
    usesSources: 'Sources',
    usesUsers: 'Used by',
    usesFailed: 'The map could not be loaded',
    usesFailedText: 'Nothing was changed. Try again in a moment.',
    usesEmpty: 'Nothing to show yet',
    usesEmptyText: 'When there is something that others use, it shows here with a line to each user.',
    usesRetry: 'Retry',
    usesLoading: 'Reading…',
    usesNotUsed: 'Not used',
    usesCount: (n) => `Used by ${n}`,
    usesOpen: (label) => `Open ${label}`,
    usesNodeSource: (label, n, names) => `${label}, used by ${n}: ${names}`,
    usesNodeUnused: (label) => `${label}, not used`,
    usesNodeUser: (label, names) => `${label}, uses: ${names}`,
    usesNodeNothing: (label) => `${label}, uses nothing here`,
    // kpadopt6-media:end
    // The unsaved-changes bar (js/unsaved.js) [kpadopt5-time].
    unsavedGroup: 'Unsaved changes',
    unsavedNone: 'No changes',
    unsavedCount: (n) => `${n} ${n === 1 ? 'change' : 'changes'}`,
    unsavedSave: (n) => `Save ${n} ${n === 1 ? 'change' : 'changes'}`,
    unsavedSaveNone: 'Save',
    unsavedDiscard: 'Discard',
    unsavedMore: 'More',
    unsavedDiscardChanges: 'Discard changes',
    unsavedDiscardHint: 'Put every value back; you can undo it',
    unsavedShowChanges: 'Show the changes',
    unsavedShowHint: 'What was, and what it is now',
    unsavedNothingToSave: 'Nothing has changed yet.',
    unsavedSavingNow: 'Saving the changes.',
    unsavedListTitle: 'Unsaved changes',
    unsavedGoFirst: 'Go to the first',
    unsavedGoTo: (key) => `Go to ${key}`,
    unsavedRevert: 'Revert',
    unsavedRevertOne: (key) => `Revert ${key}`,
    unsavedUnnamed: 'Unnamed setting',
    unsavedSecret: '••••••',
    unsavedOn: 'on',
    unsavedOff: 'off',
    unsavedEmpty: '(empty)',
    unsavedDropped: (n) => `Dropped ${n} ${n === 1 ? 'change' : 'changes'}`,
    unsavedUndo: 'Undo',
    unsavedRestoredUndo: (n) => `${n} ${n === 1 ? 'change' : 'changes'} back`,
    unsavedRestored: (n) => `${n} ${n === 1 ? 'change' : 'changes'} kept from before you left`,
    unsavedSavedAll: (n) => `Saved ${n} ${n === 1 ? 'change' : 'changes'}`,
    unsavedPartly: (saved, refused) => `${saved} saved, ${refused} refused`,
    unsavedRefused: (n) => (n === 1 ? 'Could not save 1 change' : `Could not save ${n} changes`),
    unsavedWhy: (key, why) => `${key}: ${why}`,
    unsavedDismiss: 'Dismiss',
    unsavedLeaveTitle: 'Leave without saving?',
    unsavedLeaveText: (n) => `${n} ${n === 1 ? 'change is' : 'changes are'} not saved yet and will be lost if you leave.`,
    unsavedLeaveAccept: 'Leave',
    unsavedLeaveStay: 'Stay',
    // The compare slider [kpadopt4-ideas].
    compareBefore: 'Before',
    compareAfter: 'After',
    compareSlider: (before, after) => `Divider between ${before} and ${after}`,
    compareValue: (percent, before, after) => `${percent}% ${before}, ${100 - percent}% ${after}`,
    compareFailed: 'This image could not be loaded.',
    compareRetry: 'Retry',
    compareLoading: 'Loading the images…',
    // Calm mode, the shortcut engine, the lede, the problem alert and the flash button [kpadopt5].
    calmOn: 'Calm mode on',
    calmOff: 'Calm mode off',
    calmSystem: 'Your system asks for less motion',
    shortcutsEmptyTitle: 'No shortcuts on this page',
    shortcutsEmptyText: 'Keys that belong to a page show here while you are on it.',
    shortcutsPalette: 'Open the command palette',
    shortcutsSheet: 'Show these shortcuts',
    shortcutsPending: 'Waiting for the next key',
    shortcutsUnknown: (keys) => `No shortcut on ${keys}`,
    shortcutsAltGr: (keys, suggestion) =>
        `The key "${keys}" needs AltGr on an AZERTY keyboard, which is awkward with one hand. Consider ${suggestion}.`,
    shortcutsUnavailable: 'Not available right now',
    ledeMore: 'More',
    ledeLess: 'Less',
    ledeLearnMore: 'Learn more',
    problemRemedy: 'What now',
    problemShowOthers: (n) => `Show the other ${n}`,
    problemShowFewer: 'Show fewer',
    problemCopy: 'Copy',
    problemListLabel: (n) => (n === 1 ? '1 problem' : `${n} problems`),
    flashDone: 'Done',
    flashRefused: 'Refused',
    flashFailed: 'Failed',
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
    // A three-way filter chip (js/segmented.js, `data-kp-segmented="tri"`) [kpadopt4].
    triInclude: 'required',
    triExclude: 'left out',
    triAny: 'either way',
    triAnnounce: (label, state) => `${label}: ${state}`,
    triHint: 'Tap a chip once to require it, twice to leave it out, a third time to let it go.',
    triSummary: (include, exclude) => {
        const line = [include.length ? `with ${include.join(', ')}` : '', exclude.length ? `without ${exclude.join(', ')}` : '']
            .filter(Boolean)
            .join(', ');
        return line.charAt(0).toUpperCase() + line.slice(1);
    },
    triCleared: 'Every filter is let go.',
    // A quantity with minus and plus (js/quantity.js) [kpadopt4].
    quantityLess: (label) => (label ? `${label}, less` : 'Less'),
    quantityMore: (label) => (label ? `${label}, more` : 'More'),
    quantityValue: (value, unit) => `${value} ${unit}`,
    // A checklist (js/checklist.js) [kpadopt4].
    checklistCount: (done, total) => `${done} of ${total}`,
    checklistSummary: (done, total) => `${done} of ${total} done`,
    checklistCheckAll: 'Check all',
    checklistUncheckAll: 'Uncheck all',
    checklistClear: 'Clear checked',
    checklistUndo: 'Undo',
    checklistCleared: (n) => `${n} cleared`,
    checklistRestored: (n) => `${n} back on the list`,
    checklistEmpty: 'Nothing on the list.',
    checklistLoading: 'Loading the list…',
    checklistFailed: 'The list could not be read.',
    checklistDone: (label) => `${label} done`,
    checklistDoneMoved: (label) => `${label} done, moved to the end. Next item.`,
    checklistOpen: (label) => `${label} back on the list`,
    // Kitchen timers (js/timer.js) [kpadopt4].
    timerRunning: 'Running',
    timerDoneWord: 'Done',
    timerDone: (name) => `${name} is done`,
    timerSpoken: (name) => `${name} is done`,
    timerStopRing: 'Stop',
    timerAddMinuteTo: (name) => `One more minute for ${name}`,
    timerRemove: (name) => `Remove ${name}`,
    timerEmpty: 'No timers running.',
    timerLastMinute: (name) => `${name}: one minute left`,
    timerStartedNamed: (name, clock) => `${name} started, ${clock}`,
    timerAlready: (name) => `${name} is already running`,
    // One step at a time (js/focus-steps.js) [kpadopt4].
    focusCount: (n, total) => `Step ${n} of ${total}`,
    focusNext: 'Next',
    focusPrevious: 'Back',
    focusDone: 'Done',
    focusNeeds: 'For this step',
    focusTimer: (duration) => `Start a timer · ${duration}`,
    focusReadAloud: 'Read aloud',
    focusStopReading: 'Stop reading',
    focusWakeOn: 'Screen stays on',
    focusWakeOff: 'Screen may dim',
    focusWakeUnsupported: 'Screen may dim: this browser cannot keep it on',
    focusEmpty: 'This recipe has no steps yet.',
    focusLoading: 'Loading the steps…',
    focusFailed: 'The steps could not be read.',
    // A wheel that picks (js/wheel.js) [kpadopt4].
    wheelSpin: 'Spin',
    wheelSpinAgain: 'Again',
    wheelIdle: 'Press Spin to let the wheel choose.',
    wheelChose: 'The wheel chose',
    wheelSpinning: 'Turning…',
    wheelOnlyOne: 'Only one fits: nothing to spin',
    wheelEmpty: 'Nothing fits these filters.',
    wheelLoading: 'Loading the choices…',
    wheelFailed: 'The choices could not be read.',
    // Claim (js/claim.js) [kpadopt6].
    claimAnd: 'and',
    claimDisabled: 'You cannot change who brings what here.',
    claimNoViewer: 'Sign in to take an item.',
    claimFullReason: (max) => `${max} ${max === 1 ? 'person already brings' : 'people already bring'} this.`,
    claimTake: "I'll bring it",
    claimHeld: "I'm bringing it",
    claimNobody: 'Nobody yet',
    claimBy: (names) => `Brought by ${names}`,
    claimNobodyLabel: 'Nobody brings this yet',
    claimHeldLabel: (label) => `${label}: you bring it. Press to let go`,
    claimTakeLabel: (label) => `${label}: bring it`,
    claimAssign: 'Who brings it',
    claimAssignOf: (label) => `Choose who brings ${label}`,
    claimAssignHeading: 'People',
    claimAssigned: 'Brings it. Press to take off',
    claimNotAssigned: 'Not on this item. Press to add',
    claimGroupCount: (done, total) => `${done} of ${total} taken`,
    claimAllTaken: 'Everything is taken',
    claimGapsCount: (n) => `${n} still ${n === 1 ? 'has' : 'have'} nobody`,
    claimFilterLabel: 'Show',
    claimFilterAll: 'All',
    claimFilterGaps: 'Nobody yet',
    claimFilterMine: 'Mine',
    claimTakeAll: 'Take every open item',
    claimCopyGaps: 'Copy the open list',
    claimNothingOpen: 'Every item already has somebody.',
    claimNoneOpenTitle: 'Everything is taken',
    claimNoneOpenText: 'Every item has someone who brings it.',
    claimNoneMineTitle: 'You have not taken anything yet',
    claimNoneMineText: 'Press I will bring it on an item and it shows here.',
    claimShowAll: 'Show all items',
    claimRetry: 'Retry',
    claimNotSaved: 'Not saved: somebody changed this item first.',
    claimLost: (name, label) => `${name} took ${label} just before you`,
    claimAnnounce: (label, names) => `${label}: ${names} bring${/ and |, /.test(names) ? '' : 's'} it`,
    claimAnnounceNobody: (label) => `${label}: nobody brings it`,
    claimReleased: (label) => `You no longer bring ${label}`,
    claimUnassigned: (name, label) => `${name} no longer brings ${label}`,
    claimTookAll: (n) => `You took ${n} ${n === 1 ? 'item' : 'items'}`,
    claimCopyLine: (names) => `Still nobody: ${names}`,
    claimCopied: (n) => `Copied ${n} ${n === 1 ? 'item' : 'items'}`,
    claimCopyFailed: 'Could not copy. Select the list and copy it yourself.',
    claimKeyTake: 'Take or let go of the focused item',
    claimKeyGroup: 'Who brings it',
    claimKeyReason: 'Put the focus on an item first, and sign in.',
    claimKeyGaps: 'Show only the items nobody brings',
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
    // Console (js/console.js) [kpadopt6].
    consoleUnit: 'command,commands',
    consoleOutputLabel: 'Commands and their output',
    consoleCommand: 'Command',
    consoleHostFailed: 'Could not reach the host',
    consoleHostFailedText: 'Nothing can be run until the host answers again.',
    consoleOff: 'Running commands is off here.',
    consoleContextLoadingWhy: 'Waiting for the list to choose from.',
    consoleRun: 'Run',
    consoleRunAnyway: 'Run it anyway?',
    consoleHint: 'Up and Down walk your earlier lines.',
    consoleContext: 'Run in',
    consoleContextLoading: 'Reading the list…',
    consoleSending: 'Sending…',
    consoleQueued: 'Waiting its turn',
    consoleRunning: 'Running',
    consoleRunningFor: (time) => `Running for ${time}`,
    consoleExit: (code) => `exit ${code}`,
    consoleDone: 'Done',
    consoleFailed: 'Failed',
    consoleRefused: 'Refused',
    consoleCancelled: 'Cancelled',
    consoleLost: 'Not sure it finished',
    consoleCopyCommand: 'Copy command',
    consoleCopyOutput: 'Copy output',
    consoleAgain: 'Run again',
    consoleRecheck: 'Check again',
    consoleCancel: 'Cancel',
    consoleCollapse: 'Collapse',
    consoleExpand: 'Expand',
    consoleCopied: 'Copied',
    consoleNotCopied: 'Not copied',
    consoleLostWhat: 'The connection dropped while this was running.',
    consoleLostNow: 'It may have finished. Check again to find out.',
    consoleRefusedWhat: 'The command was refused.',
    consoleNoOutput: '(no output)',
    consoleOutput: 'Output',
    consoleWaitingOutput: 'Waiting for output…',
    consoleRetry: 'Retry',
    consoleLoading: 'Reading the host…',
    consoleEarlier: (n) => `Show ${n} earlier ${n === 1 ? 'command' : 'commands'}`,
    consoleEmptyTitle: 'Run a command below',
    consoleEmptyText: 'What it prints shows up here, one block per command.',
    consoleFinishedOk: (code) => `Command finished, exit ${code}`,
    consoleFinishedFailed: (code) => `Command failed, exit ${code}`,
    consoleFinishedRefused: 'Command refused',
    consoleConfirmSaid: (command) => `${command}: press Run again to confirm`,
    consoleCleared: 'Screen cleared',
    consoleCompletions: 'Completions',
    consoleMatches: (n) => `${n} matches`,
    consoleKeyClear: 'Clear the screen',
    consoleKeyGroup: 'In the console',
    consoleKeyFocus: 'Go to the console prompt',
    consoleKeyFocusReason: 'The prompt is off now.',
    // Qr (js/qr.js) [kpadopt6].
    qrShowAllChars: (n) => `Show all ${n} characters`,
    qrShowLess: 'Show less',
    // The star rating (js/rating.js) [kpadopt6].
    ratingGroupName: (item) => `Rating for ${item}`,
    ratingGroupNameBare: 'Rating',
    ratingStarName: (n, max) => `${n} of ${max}`,
    ratingStarNameLabel: (n, max, label) => `${n} of ${max}, ${label}`,
    ratingRated: (value, max) => `Rated ${value} of ${max}`,
    ratingRatedCount: (value, max, count) => `Rated ${value} of ${max} by ${count} ${count === 1 ? 'person' : 'people'}`,
    ratingUnrated: 'Not rated yet',
    ratingTap: 'Tap a star',
    ratingClear: 'Clear',
    ratingClearName: (item) => `Clear the rating for ${item}`,
    ratingOutOf: (value, max) => `${value} of ${max}`,
    ratingAverage: (value, count) => `${value} (${count})`,
    ratingAnnounce: (item, value, max) => `${item}: ${value} of ${max}`,
    ratingAnnounceCleared: (item) => `${item}: rating removed`,
    ratingToast: (item, value) => `${item}: ${value} ${value === 1 ? 'star' : 'stars'}`,
    ratingToastCleared: (item) => `${item}: rating removed`,
    ratingLoading: 'Reading the rating',
    ratingFailedRead: 'Could not read the rating',
    ratingRetry: 'Retry',
    ratingSaveFailed: (item) => `Could not save the rating for ${item}`,
    ratingSaving: 'Saving the rating',
    ratingConfirm: 'Save rating',
    ratingCancel: 'Cancel',
    ratingPending: (value, max) => `${value} of ${max}, not saved yet`,
    ratingReadonly: 'You can look at this rating but not change it',
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
    // Answering one question per screen (js/focus-steps.js, answer mode) [kpadopt6].
    focusQuestionCount: (n, total) => `Question ${n} of ${total}`,
    focusAnswered: (label, n, total) => `Answered ${label}. Question ${n} of ${total}`,
    focusSameYesterday: (label) => `Same as yesterday: ${label}`,
    focusSameUsual: (label) => `Same as usual: ${label}`,
    focusSkip: 'Not today',
    focusSkipped: 'Not today',
    focusReview: 'Review',
    focusSummaryTitle: 'Your answers',
    focusMultiHint: 'Pick as many as fit, then press Next',
    focusTextLabel: 'Your answer',
    focusPickedMark: 'chosen',
    focusResumeAsk: 'Continue where you stopped?',
    focusResumeContinue: 'Continue',
    focusResumeRestart: 'Start over',
    focusResumed: (n) => `Back at question ${n}`,
    focusAnswerEmptyTitle: 'No questions today',
    focusAnswerEmptyText: 'That is fine, nothing is waiting',
    focusAnswerFailedTitle: 'Could not read the questions',
    focusAnswerFailedText: 'The questions could not be reached just now.',
    focusRetry: 'Retry',
    focusSaveFailedTitle: 'Could not save your answers',
    focusSaveFailedText: 'Your answers are kept here, nothing is lost.',
    focusSaveRetry: 'Try again',
    focusAnswerLoading: 'Reading the questions',
    // A picker with the usual on top (js/usual-picker.js) [kpadopt6].
    usualLabel: 'Usual',
    usualAll: 'All',
    usualStatus: (usual, more) => `${usual} usual, ${more} more`,
    usualShowAll: (n) => `Show all ${n}`,
    usualShowFewer: 'Show fewer',
    usualAdd: (label) => `Add '${label}' as new`,
    usualDidYouMean: (name) => `Did you mean ${name}?`,
    usualNoMatchTitle: 'No match',
    usualNoMatchText: 'Pick a close name, or add it as new',
    usualNoMatchTextFixed: 'Nothing in the list looks like that',
    usualSelectedExisting: (label) => `${label} was already in the list, selected`,
    usualAdded: (label) => `${label} added`,
    usualAddedToast: (label) => `Added '${label}'`,
    usualEmptyTitle: 'Nothing here yet',
    usualEmptyText: 'Type a name to add the first one',
    usualEmptyTextFixed: 'Whoever keeps this list adds the first one',
    usualAddButton: 'Add',
    usualFailedTitle: 'Could not read the list',
    usualFailedText: 'The list could not be reached just now.',
    usualRetry: 'Retry',
    usualLoading: 'Reading the list',
    usualNotToday: 'Not today',
    usualNotTodayName: (label) => `${label}: not today`,
    usualNotTodayAnnounce: (label) => `${label}: not today`,
    usualNotTodayMark: 'not today',
    usualJump: 'Jump to the usual choices',
    usualAlreadyPicked: (label) => `${label} is already picked`,
    usualPicked: (label) => `${label}: had it`,
    usualTookClosest: (typed, label) => `${typed}: took ${label}`,
    usualAsk: (label) => `Did you mean ${label}? Enter picks it`,
    usualAddedNote: (label) => `Added '${label}' as new`,
    usualUndo: 'Undo',
    usualUndoName: (label) => `Undo adding ${label}`,
    usualAddUndone: (label) => `${label} taken out again`,
    usualCheckTitle: 'Your usual today',
    usualCheckWhat: 'Not today says it did not happen today. A row left blank is not answered yet.',
    usualCheckWhatChips: 'Tap once: had it. Twice: not today, it did not happen. Three times: not answered.',
    usualHadIt: 'Had it',
    usualHadItWord: 'had it',
    usualUnanswered: (label) => `${label}: not answered`,
    usualUnansweredWord: 'not answered',
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
