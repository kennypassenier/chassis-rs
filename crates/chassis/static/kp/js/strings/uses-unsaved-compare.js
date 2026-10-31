// The words of the uses map, unsaved changes, compare, calm, shortcuts and the lede.

/**
 * @typedef {object} UsesUnsavedCompareStrings
 * @property {string} usesLabel  A uses map's name when the page gives none (js/uses-map.js) [kpadopt6-media]
 * @property {string} usesSources  The sources column's name [kpadopt6-media]
 * @property {string} usesUsers  The users column's name [kpadopt6-media]
 * @property {string} usesFailed  The failed map's heading [kpadopt6-media]
 * @property {string} usesFailedText  Its sentence [kpadopt6-media]
 * @property {string} usesEmpty  The empty map's heading [kpadopt6-media]
 * @property {string} usesEmptyText  Its sentence [kpadopt6-media]
 * @property {string} usesRetry  The failed map's Retry [kpadopt6-media]
 * @property {string} stateRetry  The Retry of every failed data area drawn with the state plate (heat, matrix, timeline, week, graph, table) [state-plates-1019]
 * @property {string} stateFailedText  The sentence under a failed data area's heading when the page gives none [state-plates-1019]
 * @property {string} graphEmpty  The empty network's heading when the page gives no words [state-plates-1019]
 * @property {string} graphFailed  The failed network's heading when the page gives no words [state-plates-1019]
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
 */

/** @type {UsesUnsavedCompareStrings} */
export const USES_UNSAVED_COMPARE_STRINGS = {
    usesLabel: 'What uses what',
    usesSources: 'Sources',
    usesUsers: 'Used by',
    usesFailed: 'The map could not be loaded',
    usesFailedText: 'Nothing was changed. Try again in a moment.',
    usesEmpty: 'Nothing to show yet',
    usesEmptyText: 'When there is something that others use, it shows here with a line to each user.',
    usesRetry: 'Retry',
    stateRetry: 'Retry',
    stateFailedText: 'Nothing was changed. Try again in a moment.',
    graphEmpty: 'No network to show yet.',
    graphFailed: 'The network could not be read.',
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
};
