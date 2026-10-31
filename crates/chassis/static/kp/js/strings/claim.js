// The words of claims.

/**
 * @typedef {object} ClaimStrings
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
 */

/** @type {ClaimStrings} */
export const CLAIM_STRINGS = {
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
};
