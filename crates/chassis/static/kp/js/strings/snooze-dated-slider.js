// The words of snooze, dated options, sentences, sliders, autosize, anchors and print.

/**
 * @typedef {object} SnoozeDatedSliderStrings
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
 */

/** @type {SnoozeDatedSliderStrings} */
export const SNOOZE_DATED_SLIDER_STRINGS = {
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
};
