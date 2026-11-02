// The Dutch words of the calendar, the week agenda and the run timeline [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** @type {Partial<Strings>} */
export const NL_CALENDAR_WEEK_GANTT = {
    calendarNav: 'Maand',
    calendarPrev: '‹ Vorige',
    calendarNext: 'Volgende ›',
    calendarToday: 'Vandaag',
    calendarTodayTitle: 'Deze maand tonen en vandaag kiezen',
    calendarDay: (date, label) => `${date}: ${label}`,
    calendarFuture: 'een dag die nog komt',
    calendarLoading: 'wordt gelezen',
    calendarUnknown: 'niets bekend over deze dag',
    weekGroup: 'Weekagenda',
    weekPrev: '‹ Vorige',
    weekNext: 'Volgende ›',
    weekToday: 'Vandaag',
    weekNow: 'nu',
    weekNowAt: (time) => `nu, ${time}`,
    weekMore: (n) => `+${n}`,
    weekMoreLabel: (n, day) => `Nog ${n} op ${day}`,
    weekNextRun: 'volgende keer',
    weekOff: 'uit',
    weekSkipped: 'overgeslagen',
    weekReference: 'ter info',
    weekEmpty: 'Er staat niets gepland deze week.',
    weekLoading: 'De week wordt gelezen',
    ganttGroup: 'Tijdlijn van runs',
    ganttRange: 'Periode',
    ganttRangeTitle: (label) => `${label} tonen`,
    ganttNow: 'nu',
    ganttSelection: 'Gekozen',
    ganttClear: 'Wissen',
    ganttClearTitle: 'De gekozen periode loslaten',
    ganttSelected: (from, to) => `${from} tot ${to}`,
    ganttEmpty: 'Geen run in dit venster.',
    ganttLoading: 'De geschiedenis wordt gelezen',
    ganttQueued: 'in de wachtrij',
    ganttRunning: 'bezig',
    ganttPlannedUntil: (time) => `gepland tot ${time}`,
    ganttOk: 'gelukt',
    ganttFailed: 'mislukt',
    ganttAnnounce: (label, state) => `${label}: ${state}`,
    ganttBar: (label, when, state) => `${label}, ${when}, ${state}`,
    ganttLive: 'Live',
    ganttLiveTitle: 'Nu volgen: het venster schuift mee met de klok',
    ganttZoom: 'Zoomen',
    ganttZoomTitle: 'Van de gekozen periode het venster maken',
    ganttDuration: (seconds) => {
        if (seconds < 60) return `${seconds} s`;
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest ? `${hours} u ${rest} min` : `${hours} u`;
    },
    ganttHint: 'Klik op een balk om hem te openen · sleep over de tijd om een periode te kiezen',
    ganttHintOpen: 'Klik op een balk om hem te openen',
    ganttAll: 'Alles',
    ganttAllTitle: 'Alles op de tijdlijn tonen',
    ganttPoint: (label, when) => `${label}, ${when}`,
    ganttPlanned: 'gepland',
    ganttCluster: (count, labels) => `${count} gebeurtenissen: ${labels}`,
    ganttClusterMore: (more) => `+${more}`,
    ganttPointsHint: 'Wijs een markering aan om ze te lezen · pijlen lopen langs de markeringen · Enter opent er een',
};
