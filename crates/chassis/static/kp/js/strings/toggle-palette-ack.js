// The words of the toggle, the tab count, the intent line, the command palette, version chips and the acknowledge gate.

/**
 * @typedef {object} TogglePaletteAckStrings
 * @property {string} toggleCounting  The count's name while it is still being counted (js/toggle.js) [kpadopt6-ops]
 * @property {string} tabCountCounting  The count on a tab, while it is still being counted: its name for a screen reader (js/tabbar.js, setTabCount) [gap-tab-count]
 * @property {string} tabCountFailed  The count on a tab that could not be counted, in words (the dash on the tab says nothing) [gap-tab-count]
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
 * @property {string} ackNotes  The fold of the release notes inside an acknowledge gate, and the notes' accessible name (js/ack-gate.js) [wish-1120]
 * @property {string} ackOpenNotes  Why the tick is off until the release notes were opened (`data-kp-ack-require-notes`) [wish-1120]
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
 */

/** @type {TogglePaletteAckStrings} */
export const TOGGLE_PALETTE_ACK_STRINGS = {
    // The toggle button (js/toggle.js) [kpadopt6-ops].
    toggleCounting: 'counting',
    tabCountCounting: 'counting',
    tabCountFailed: 'could not be counted',
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
    ackNotes: 'Release notes',
    ackOpenNotes: 'Open the release notes first',
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
};
