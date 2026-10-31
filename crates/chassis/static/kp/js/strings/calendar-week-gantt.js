// The words of the calendar, the week agenda and the run timeline.

/**
 * @typedef {object} CalendarWeekGanttStrings
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
 * @property {(time: string) => string} ganttPlannedUntil  A running run's card line when it has a planned end, "planned until 14:30" [wish-1028]
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
 * @property {string} ganttHintOpen  The same hint of a timeline without its range toolbar (no brush): only opening a bar [gaps-time-1019]
 * @property {string} ganttAll  The range button that fits the window to everything on the timeline (`all` in `data-kp-gantt-ranges`) [kpadopt4]
 * @property {string} ganttAllTitle  Its title
 * @property {(label: string, when: string) => string} ganttPoint  A point event's name, "Applied, 02/10/2026" [kpadopt4]
 * @property {string} ganttPlanned  The word after a planned point's name, still to come
 * @property {(count: number, labels: string) => string} ganttCluster  The name of marks too close to tell apart, "3 events: Applied, Mail, Call"
 * @property {(more: number) => string} ganttClusterMore  The count on such a mark, "+2"
 * @property {string} ganttPointsHint  The hint under a timeline of point events
 */

/** @type {CalendarWeekGanttStrings} */
export const CALENDAR_WEEK_GANTT_STRINGS = {
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
    ganttPlannedUntil: (time) => `planned until ${time}`,
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
    ganttHintOpen: 'Click a bar to open it',
    ganttAll: 'All',
    ganttAllTitle: 'Show everything on the timeline',
    ganttPoint: (label, when) => `${label}, ${when}`,
    ganttPlanned: 'planned',
    ganttCluster: (count, labels) => `${count} events: ${labels}`,
    ganttClusterMore: (more) => `+${more}`,
    ganttPointsHint: 'Point at a mark to read it · arrows walk the marks · Enter opens one',
};
