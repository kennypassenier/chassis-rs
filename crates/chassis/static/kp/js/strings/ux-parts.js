// The words of the parts the app review of 2026-11-01 asked for [ux-1101]: the folded chip menu, the three-way chip's
// visible words, the popover form, the date navigation and the row deleted with Undo; the five parts the Habits todo app
// asked for on 2026-11-01 [parts-1102]: the day timeline, the swipe row, chord keys, the settled row and the swatch picker;
// and the form parts of 2026-11-02 [forms-1102]: the chip filter, the add row, the chip's menu and rename, and the tries
// left on a timeline lane.

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
 * @property {string} popoverFormDate  A popover form's problem line when its date field holds text that is not a date [parts-1102]
 * @property {string} popoverFormDateRange  Its problem line when the date lies outside the days its calendar offers [parts-1102]
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
 * @property {string} keysThen  The word between the caps of a chord in a line of shortcuts, "O then T" (js/keys.js) [parts-1102]
 * @property {string} daylineLabel  The name of a day timeline when the page gives none (js/dayline.js) [parts-1102]
 * @property {string} daylineAllDay  The name over the all-day strip above the hours [parts-1102]
 * @property {string} daylineAllDayNone  What the all-day strip says while it holds nothing [parts-1102]
 * @property {(time: string) => string} daylineNow  The now line's label, "Now 10:42" [parts-1102]
 * @property {(label: string) => string} daylineHandle  The name of an item's move handle, "Move Morning run" [parts-1102]
 * @property {string} daylineHandleHint  The handle's title: how it moves [parts-1102]
 * @property {(label: string, time: string) => string} daylineMoved  What is said after a step, "Morning run moved to 09:15" [parts-1102]
 * @property {(label: string, time: string) => string} daylineKept  What is said when a move is put back, "Morning run stays at 09:00" [parts-1102]
 * @property {string} daylineFixed  Said after a read-only item's time: it cannot be moved [parts-1102]
 * @property {string} daylineDone  Said after a done item's time [parts-1102]
 * @property {(time: string) => string} daylineDropAt  The marker while an item from a list is held over the hours, "Starts 14:30" [parts-1102]
 * @property {string} daylineLoading  The words on a day timeline's loading card [parts-1102]
 * @property {string} daylineEmpty  The heading over a day with no item, when the page gives none [parts-1102]
 * @property {string} daylineEmptyText  The sentence under it [parts-1102]
 * @property {string} daylineFailed  The heading over a day that could not be read [parts-1102]
 * @property {string} daylineRetry  Its Try again button [parts-1102]
 * @property {(name: string, word: string) => string} settledSaid  What is said when a row settles, "Buy milk: Deleted" (js/settled.js) [parts-1102]
 * @property {string} settledNameless  The name of a settled row that has none [parts-1102]
 * @property {(name: string, action: string) => string} swipeSaid  What is said after a swipe ran its action, "Buy milk: Done" (js/swipe.js) [parts-1102]
 * @property {string} swatchesLabel  The name of a swatch picker when the page gives none (js/swatches.js) [parts-1102]
 * @property {(label: string) => string} swatchesChosen  The line under the swatches naming the current one, "Teal" [parts-1102]
 * @property {string} swatchesNone  That line while no swatch is current [parts-1102]
 * @property {string} chipFilterAll  The All chip a chip filter adds when the page wrote none (js/chip-filter.js) [forms-1102]
 * @property {(name: string) => string} addRowAdded  What an add row says after the page took the line, "Added Pasta pesto"; '' when the line had no words [forms-1102]
 * @property {string} addRowRefused  An add row's refusal when the page refused without words of its own [forms-1102]
 * @property {(chip: string) => string} segmentedMenuFor  A chip's ⋯ menu button, "Actions for Pain" [forms-1102]
 * @property {(chip: string) => string} segmentedRenameField  The name of the field a chip becomes, "New name for Pain" [forms-1102]
 * @property {string} segmentedRenameEmpty  Said when a chip is to be renamed to nothing [forms-1102]
 * @property {string} segmentedRenameRefused  Said when the page refused a new name without words of its own [forms-1102]
 * @property {(n: number) => string} ganttTriesLeft  The mark at a timeline lane's name, "1 try left", "No tries left" (js/gantt.js) [forms-1102]
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
    popoverFormDate: 'Type a date as dd/mm/yyyy, or pick one in the calendar.',
    popoverFormDateRange: 'Pick a day the calendar offers.',
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
    keysThen: 'then',
    daylineLabel: 'Day timeline',
    daylineAllDay: 'All day',
    daylineAllDayNone: 'Nothing all day',
    daylineNow: (time) => `Now ${time}`,
    daylineHandle: (label) => `Move ${label}`,
    daylineHandleHint: 'Drag up or down, or press ↑ and ↓ (Shift: an hour); Escape puts it back',
    daylineMoved: (label, time) => `${label} moved to ${time}`,
    daylineKept: (label, time) => `${label} stays at ${time}`,
    daylineFixed: 'fixed',
    daylineDone: 'done',
    daylineDropAt: (time) => `Starts ${time}`,
    daylineLoading: 'Reading the day…',
    daylineEmpty: 'Nothing has a time yet',
    daylineEmptyText: 'Items with a start time stand here, as long as they take.',
    daylineFailed: 'The day could not be read',
    daylineRetry: 'Try again',
    settledSaid: (name, word) => `${name}: ${word}`,
    settledNameless: 'Item',
    swipeSaid: (name, action) => `${name}: ${action}`,
    swatchesLabel: 'Colour',
    swatchesChosen: (label) => label,
    swatchesNone: 'No colour',
    chipFilterAll: 'All',
    addRowAdded: (name) => (name ? `Added ${name}` : 'Added'),
    addRowRefused: 'This line could not be added.',
    segmentedMenuFor: (chip) => `Actions for ${chip}`,
    segmentedRenameField: (chip) => `New name for ${chip}`,
    segmentedRenameEmpty: 'A name is needed.',
    segmentedRenameRefused: 'This name cannot be used.',
    ganttTriesLeft: (n) => (n === 0 ? 'No tries left' : n === 1 ? '1 try left' : `${n} tries left`),
};
