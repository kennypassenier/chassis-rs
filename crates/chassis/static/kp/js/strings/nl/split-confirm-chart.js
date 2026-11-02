// The Dutch words of the split pane, the confirmation, the alarm, the arrival, the time chart, menus and the tour [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** "Wil je 8 dode berichten verwijderen?" → "8 dode berichten verwijderen": the polite frame comes off, the verb stays last. */
const ASKING = /^(?:weet je (?:het )?zeker dat je|ben je zeker dat je|wil je(?: echt| zeker)?|echt)\s+/i;
/** A first word that makes the question a yes/no about a state, not an action. */
const NOT_AN_ACTION = /^(?:is|zijn|was|waren|kan|kun|kunnen|mag|mogen|moet|moeten|wordt|worden|heeft|hebben|heb|hebt|ben|bent)\b/i;

/** @type {Partial<Strings>} */
export const NL_SPLIT_CONFIRM_CHART = {
    splitLabel: 'De vlakken van grootte veranderen',
    reorderHandle: (name) => `${name} verplaatsen`,
    reorderMoved: (name, at, of) => `${name} verplaatst naar plaats ${at} van ${of}`,
    tileFallbackName: 'Tegel',
    tileLabel: (name, column, row, w, h) => `${name}, kolom ${column}, rij ${row}, ${w} op ${h}`,
    contrastMissing: (token) => `Geen contrast om te meten: ${token} bestaat niet in dit thema.`,
    contrastReport: (ratio, token, verdict) => `${ratio}:1 tegen ${token}: ${verdict}`,
    colourHue: 'Tint',
    colourSaturation: 'Verzadiging',
    colourLightness: 'Helderheid',
    contrastPasses: 'voldoet',
    contrastFails: 'te weinig',
    confirm: 'Bevestigen',
    confirmAccept: 'Ja, doen',
    confirmCancel: 'Annuleren',
    confirmDescription: 'Dit kan niet ongedaan gemaakt worden. Annuleren laat alles zoals het is.',
    confirmDependents: (count) => `Nog in gebruik door ${count}`,
    confirmBlocked: 'Haal eerst weg wat het gebruikt en probeer het dan opnieuw.',
    confirmClose: 'Sluiten',
    confirmSaysIrreversible: (text) =>
        /\bniet (?:meer )?ongedaan\b|\bonomkeerbaar|\bvoorgoed\b|\bdefinitief\b|\bpermanent\b|\b(?:cannot|can['’]t|can not) be undone\b|\bfor good\b/i.test(
            text,
        ),
    confirmLabelFrom: (phrase) => {
        const first = phrase.trim().split(/(?<=[?.!])\s+/)[0] ?? '';
        if (!first.endsWith('?')) return '';
        const bare = first
            .slice(0, -1)
            .trim()
            .replace(ASKING, '')
            .replace(/\s+wilt(?=\s+\S+$|$)/i, '');
        if (!/^[\p{L}\d]/u.test(bare) || NOT_AN_ACTION.test(bare)) return '';
        const label = bare.length <= 32 ? bare : (bare.split(/\s+/).at(-1) ?? '');
        return label.charAt(0).toLocaleUpperCase('nl') + label.slice(1);
    },
    confirmBack: 'Terug',
    dialogGuardTitle: 'Je wijzigingen weggooien?',
    dialogGuardText: 'Wat je hier wijzigde is nog niet bewaard.',
    dialogGuardKeep: 'Verder bewerken',
    dialogGuardDiscard: 'Weggooien',
    alarmAction: 'Bevestigen',
    alarmKeepOpen: 'Open houden',
    alarmHint: 'Druk op Enter',
    alarmCountdown: (seconds) => `Sluit over ${seconds} s`,
    alarmClosesBy: (seconds) => `Sluit vanzelf over ${seconds} ${seconds === 1 ? 'seconde' : 'seconden'}.`,
    alarmPressTo: (action) => `Druk op ${action} om verder te gaan.`,
    alarmKeptOpen: (action) => `Open gehouden. Druk op ${action} om verder te gaan.`,
    save: 'Bewaren',
    mainNavigation: 'Hoofdnavigatie',
    skipToContent: 'Naar de inhoud',
    classified: 'Vertrouwelijk',
    arrivalLine: 'Laden',
    arrivalWordsByTheme: {
        synthwave: { line: '▶ Play', progress: 'Tracking', ready: 'Druk op start' },
    },
    arrivalLinesByTheme: {},
    arrivalProgress: 'Voortgang',
    arrivalReady: 'Klaar',
    arrivalSkip: 'Overslaan',
    measureLoading: 'meten…',
    measureBox: (w, h) => `${w} × ${h} px`,
    chartPlot: (label) => `${label}: grafiek. Pijltjestoetsen gaan door de tijd, Enter zet de meting vast, Esc gaat een stap terug.`,
    chartSpark: (label) => `${label}: laatste 24 uur. Pijltjestoetsen gaan door de tijd.`,
    chartSources: (label) => `${label}: bronnen`,
    chartSource: (label) => `${label}: wijs aan om hem apart te tonen, klik om hem aan of uit te houden`,
    chartShowAll: 'Alles tonen',
    chartShowAllTitle: 'Elke bron weer tonen (Esc)',
    chartHintPointer: 'Wijs een bron aan om hem apart te tonen · klik om hem aan of uit te houden · Alles tonen zet terug',
    chartHintTouch: 'Tik op een bron om hem aan of uit te houden · Alles tonen zet terug',
    chartPinned: 'vastgezet',
    chartRelease: 'De vastgezette meting loslaten (Esc)',
    chartChange: 'verandering tegenover het uur ervoor',
    chartOpen: 'Openen',
    chartMark: (label, time) => `${label} · ${time}; klik om vast te zetten`,
    chartZoomed: (from, to) => `Ingezoomd: ${from}–${to} · `,
    chartZoomedSpan: (span) => `Ingezoomd: ${span} · `,
    chartReset: 'Terugzetten',
    chartResetTitle: 'De hele periode weer tonen (dubbelklik of Esc)',
    chartUp: 'omhoog',
    chartDown: 'omlaag',
    chartSame: 'gelijk',
    chartNow: 'nu',
    chartEmpty: 'Nog geen metingen in dit venster.',
    chartRetry: 'Opnieuw proberen',
    chartTrendFailed: 'De trend kon niet gelezen worden.',
    progressFailed: 'Dit kon niet afgewerkt worden.',
    chartOnePoint: 'Nog maar één meting: de lijn groeit als er meer metingen binnenkomen.',
    chartLoading: 'De metingen laden…',
    chartPinnedOutside: '(vastgezet, buiten het venster)',
    menuLoading: 'De acties laden…',
    menuEmpty: 'Hier is nu niets te doen.',
    navMore: 'Meer',
    navMoreMenu: 'Meer pagina’s',
    navMoreAlert: 'Hier heeft iets je nodig.',
    navMoreUnavailable: 'Nu niet beschikbaar.',
    tourNext: 'Volgende',
    tourNextTitle: 'Het volgende deel van de pagina tonen',
    tourBack: 'Terug',
    tourBackTitle: 'Het deel hiervoor tonen',
    tourDone: 'Klaar',
    tourDoneTitle: 'De rondleiding beëindigen',
    tourSkip: 'Overslaan',
    tourSkipTitle: 'De rondleiding nu beëindigen; Help kan ze opnieuw starten',
    tourCount: (n, of) => `${n} van ${of}`,
    chartToday: 'vandaag',
    chartYesterday: 'gisteren',
    chartTrendKeys:
        'Pijl links en rechts lezen de trend punt per punt, Shift springt tien, Home en End gaan naar de uiteinden, Escape verbergt de meting.',
    meterUsed: 'gebruikt',
    meterNotMeasured: 'niet gemeten',
    meterMeasuring: 'wordt gemeten',
    loadingWord: 'LADEN',
};
