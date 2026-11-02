// The Dutch words of the range picker, the weekday picker and the next-times list [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** One and many of each unit a range preset can name. @type {Record<string, [string, string]>} */
const UNITS = { m: ['minuut', 'minuten'], h: ['uur', 'uur'], d: ['dag', 'dagen'], w: ['week', 'weken'] };

/** @type {Partial<Strings>} */
export const NL_RANGE_WEEKDAYS_RUNS = {
    rangePresets: 'Periodes',
    rangePresetName: (key) => {
        const m = /^(\d+)\s*([mhdw])$/.exec(key.trim().toLowerCase());
        const unit = m ? UNITS[m[2] ?? ''] : undefined;
        if (!m || !unit) return key;
        const n = Number(m[1]);
        return n === 1 ? `Laatste ${unit[0]}` : `Laatste ${n} ${unit[1]}`;
    },
    rangePresetShort: (key) => String(key).replace(/h$/i, 'u'),
    rangeCustom: 'Zelf kiezen…',
    rangeCustomTitle: 'Eigen periode',
    rangeCustomName: 'Eigen',
    rangeFrom: 'Van',
    rangeTo: 'Tot',
    rangeDateLabel: (bound) => `${bound}, datum (dd/mm/jjjj)`,
    rangeTimeLabel: (bound) => `${bound}, tijd (UU:MM, 24 uur)`,
    rangeTimeHint: 'UU:MM',
    rangeApply: 'Toepassen',
    rangeCancel: 'Annuleren',
    rangeLabel: (name, from, to) => `${name} · ${from} – ${to}`,
    rangeErrorDate: (bound) => `${bound}: typ een volledige datum, dd/mm/jjjj.`,
    rangeErrorTime: (bound) => `${bound}: typ een tijdstip, 00:00 tot 23:59.`,
    rangeErrorOrder: 'Het einde moet na het begin komen.',
    rangeErrorFuture: 'Het einde ligt in de toekomst.',
    rangeErrorSpan: (days) => `Een periode duurt hoogstens ${days} dagen.`,
    weekdaysGroup: 'Dagen',
    weekdaysShort: ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'],
    weekdaysNarrow: ['M', 'D', 'W', 'D', 'V', 'Z', 'Z'],
    weekdaysLong: ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'],
    weekdaysLast: 'Laatste',
    weekdaysLastDay: 'laatste dag',
    weekdaysAnd: 'en',
    weekdaysPresets: 'Snel kiezen',
    weekdaysPresetWeekdays: 'Weekdagen',
    weekdaysPresetWeekend: 'Weekend',
    weekdaysPresetEvery: 'Elke dag',
    weekdaysNone: 'Geen dag gekozen',
    weekdaysEvery: 'Elke dag',
    weekdaysWeekdays: 'Elke weekdag',
    weekdaysWeekend: 'Elk weekend',
    weekdaysOrdinal: (n) => `${n}e`,
    weekdaysOnThe: (list) => `Op de ${list}`,
    weekdaysMin: (n) => (n === 1 ? 'Kies minstens één dag.' : `Kies minstens ${n} dagen.`),
    runsTitle: 'Volgende keren',
    runsNow: 'nu',
    runsIn: (distance) => `over ${distance}`,
    runsClockChange: (hours) => `De klok gaat ${Math.abs(hours)} u ${hours > 0 ? 'vooruit' : 'achteruit'}`,
    runsMore: (n) => `Nog ${n} tonen`,
    runsFewer: 'Minder tonen',
    runsEmpty: 'Nog geen tijdstip om te tonen.',
    runsFailed: 'De volgende keren konden niet berekend worden',
    runsRetry: 'Opnieuw proberen',
    runsLoading: 'De volgende keren worden berekend…',
    runsNext: (moment) => `Volgende keer: ${moment}`,
};
