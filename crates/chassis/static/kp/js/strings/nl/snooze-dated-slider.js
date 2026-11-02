// The Dutch words of the snooze picker, the dated options, the sentence form, the slider and the media parts [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** One and many of each unit a snooze can name. @type {Record<string, [string, string]>} */
const UNITS = { m: ['minuut', 'minuten'], h: ['uur', 'uur'], d: ['dag', 'dagen'], w: ['week', 'weken'] };
/** @param {number} n @returns {string} */
const chars = (n) => (n === 1 ? 'teken' : 'tekens');
/** @param {number} n @returns {string} */
const lines = (n) => (n === 1 ? 'regel' : 'regels');

/** @type {Partial<Strings>} */
export const NL_SNOOZE_DATED_SLIDER = {
    snoozeTrigger: 'Later herinneren',
    snoozeChange: 'Opnieuw uitstellen',
    snoozeChoicesLabel: 'Herinner me',
    snoozeIn: (key) => {
        const m = /^(\d+)\s*([mhdw])$/.exec(key.trim().toLowerCase());
        const unit = m ? UNITS[m[2] ?? ''] : undefined;
        if (!m || !unit) return key;
        const n = Number(m[1]);
        return `Over ${n} ${n === 1 ? unit[0] : unit[1]}`;
    },
    snoozeTonight: (time) => `Vanavond ${time}`,
    snoozeTomorrow: (time) => `Morgen ${time}`,
    snoozeMonday: (time) => `Maandag ${time}`,
    snoozeNextWeek: (time) => `Volgende week ${time}`,
    snoozeLast: 'Je laatste keuze',
    snoozePick: 'Kies een datum en tijd…',
    snoozePickHint: 'Elk moment in de komende dagen',
    snoozePickTitle: 'Herinner me op',
    snoozeDateLabel: 'Datum (dd/mm/jjjj)',
    snoozeTimeLabel: 'Tijd (UU:MM, 24 uur)',
    snoozeApply: 'Uitstellen',
    snoozeCancel: 'Annuleren',
    snoozeUntil: (moment) => `Uitgesteld tot ${moment}`,
    snoozeNone: 'Niet uitgesteld',
    snoozeEnd: 'Uitstel beëindigen',
    snoozeSaving: 'De herinnering wordt bewaard',
    snoozeErrorDate: 'Typ een volledige datum, dd/mm/jjjj.',
    snoozeErrorTime: 'Typ een tijdstip, 00:00 tot 23:59.',
    snoozeErrorPast: 'Kies een moment in de toekomst.',
    snoozeErrorMax: (days) => `Een herinnering kan hoogstens ${days} dagen weg liggen.`,
    datedGroup: 'Opties',
    datedLatest: 'Nieuwste',
    datedJustNow: 'net nu',
    datedAgo: (distance) => `${distance} geleden`,
    datedSearch: 'Zoeken op datum of naam',
    datedChosen: (name) => `${name} gekozen`,
    datedEmpty: 'Nog niets om te kiezen.',
    datedFailed: 'De opties konden niet geladen worden',
    datedRetry: 'Opnieuw proberen',
    datedLoading: 'De opties laden…',
    sentenceEmpty: (label) => `(${label || '…'})`,
    sentenceWhy: (field, why) => `${field}: ${why}`,
    sentenceField: 'Veld',
    sliderGroup: 'Waarde',
    sliderMin: (label) => `${label}, minimum`,
    sliderMax: (label) => `${label}, maximum`,
    sliderValue: (label) => `${label}, waarde`,
    sliderInvalid: (min, max, unit) => `Typ een getal van ${min} tot ${max}${unit ? ` ${unit}` : ''}.`,
    sliderGap: (gap, unit) => `De twee waarden moeten minstens ${gap}${unit ? ` ${unit}` : ''} uit elkaar liggen.`,
    autosizeChars: (n, text) => `${text} ${chars(n)}`,
    autosizeLines: (n, text) => `${text} ${lines(n)}`,
    autosizeBoth: (n, charsText, l, linesText) => `${charsText} ${chars(n)}, ${linesText} ${lines(l)}`,
    autosizeOf: (text, maxText) => `${text} van ${maxText} tekens`,
    autosizeFull: (maxText) => `De limiet van ${maxText} tekens is bereikt.`,
    autosizeNear: (charsText, maxText) => `${charsText} van ${maxText} tekens gebruikt.`,
    autosizeSubmit: 'Het formulier versturen vanuit dit vak',
    autosizeGroup: 'In een tekstvak',
    autosizeLoading: 'De tekst laden…',
    autosizeFailed: 'Deze tekst kon niet bewaard worden. Hij staat er nog.',
    anchorCopyLink: (name) => `Link naar ${name} kopiëren`,
    anchorCopied: 'Gekopieerd',
    anchorFailed: 'Niet gekopieerd',
    anchorCopiedAnnounce: (name) => `Link naar ${name} gekopieerd`,
    anchorFailedAnnounce: 'De link kon niet gekopieerd worden',
    anchorMissing: 'Dat item is hier niet meer.',
    anchorShowAll: 'De hele lijst tonen',
    anchorKeyCopy: 'Link naar deze rij kopiëren',
    anchorKeyGroup: 'Op een rij',
    printLoading: 'De lijst was nog aan het laden toen dit blad werd afgedrukt.',
    printStamp: (moment) => `Afgedrukt op ${moment}`,
};
