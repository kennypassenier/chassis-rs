// The words of ranges, weekday pickers and run lists.

/**
 * @typedef {object} RangeWeekdaysRunsStrings
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
 */

/** @type {RangeWeekdaysRunsStrings} */
export const RANGE_WEEKDAYS_RUNS_STRINGS = {
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
};
