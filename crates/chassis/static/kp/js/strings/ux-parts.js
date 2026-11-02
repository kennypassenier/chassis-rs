// The words of the parts the app review of 2026-11-01 asked for [ux-1101]: the folded chip menu, the three-way chip's
// visible words, the popover form, the date navigation and the row deleted with Undo.

/**
 * @typedef {object} UxPartsStrings
 * @property {string} segmentedFoldName  What a folded chip group's menu button calls the group when the group has no name of its own ("Show") [ux-1101]
 * @property {string} segmentedFoldAll  What that button says while nothing (or All) is chosen [ux-1101]
 * @property {(name: string, chosen: string) => string} segmentedFoldButton  The folded group's button, "Show: Due" [ux-1101]
 * @property {(n: number) => string} segmentedFoldMany  What the button says for several values on at once, "3 chosen" [ux-1101]
 * @property {string} triTagAny  A three-way chip's visible word while it does not matter (the word look, the default of `data-kp-segmented-tri-look`) [ux-1101]
 * @property {string} triTagInclude  Its visible word while the value must be in [ux-1101]
 * @property {string} triTagExclude  Its visible word while the value must not be in [ux-1101]
 * @property {string} popoverFormInvalid  A popover form's problem line when the field is refused and the browser gave no words of its own [ux-1101]
 * @property {string} popoverFormClose  The name of a popover form's close button [ux-1101]
 * @property {string} dateNavGroup  The name of a date navigation when the page gives none [ux-1101]
 * @property {string} dateNavPrev  Its button to the range before, as shown [ux-1101]
 * @property {string} dateNavNext  Its button to the range after, as shown [ux-1101]
 * @property {string} dateNavToday  Its button back to the range that holds today [ux-1101]
 * @property {(unit: string) => string} dateNavPrevTitle  The first button's name and title, "Previous month" [ux-1101]
 * @property {(unit: string) => string} dateNavNextTitle  The last button's name and title, "Next month" [ux-1101]
 * @property {(unit: string) => string} dateNavTodayTitle  The middle button's title, "Show this month" [ux-1101]
 * @property {{ day: string, week: string, month: string }} dateNavUnits  What one step is called in each mode [ux-1101]
 * @property {(n: number, from: string, to: string) => string} dateNavWeekLabel  The range a week shows, "Week 45 · 02/11 to 08/11/2026" [ux-1101]
 * @property {(range: string) => string} dateNavShown  What the status region says after a move, "Now showing November 2026" [ux-1101]
 * @property {string} dateNavCurrent  The word after the range while it holds today [ux-1101]
 * @property {(name: string) => string} rowDeleted  The Undo toast's line after a row was deleted, "Ibuprofen 400 deleted" [ux-1101]
 * @property {string} rowDeletedNameless  The same line for a row with no name [ux-1101]
 * @property {(name: string) => string} rowRestored  The toast's line after Undo, "Ibuprofen 400 is back" [ux-1101]
 */

/** @type {UxPartsStrings} */
export const UX_PARTS_STRINGS = {
    segmentedFoldName: 'Show',
    segmentedFoldAll: 'All',
    segmentedFoldButton: (name, chosen) => `${name}: ${chosen}`,
    segmentedFoldMany: (n) => `${n} chosen`,
    triTagAny: 'either',
    triTagInclude: 'want',
    triTagExclude: 'not',
    popoverFormInvalid: 'This value cannot be used.',
    popoverFormClose: 'Close',
    dateNavGroup: 'Dates shown',
    dateNavPrev: '‹ Previous',
    dateNavNext: 'Next ›',
    dateNavToday: 'Today',
    dateNavPrevTitle: (unit) => `Previous ${unit}`,
    dateNavNextTitle: (unit) => `Next ${unit}`,
    dateNavTodayTitle: (unit) => `Show this ${unit}`,
    dateNavUnits: { day: 'day', week: 'week', month: 'month' },
    dateNavWeekLabel: (n, from, to) => `Week ${n} · ${from} to ${to}`,
    dateNavShown: (range) => `Now showing ${range}`,
    dateNavCurrent: 'current',
    rowDeleted: (name) => `${name} deleted`,
    rowDeletedNameless: 'Row deleted',
    rowRestored: (name) => `${name} is back`,
};
