// The Dutch words of the pipeline board, the uptime strip, the typed confirmation, the command block and the timers [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** @param {number} n @returns {string} */
const incidents = (n) => (n === 1 ? '1 incident' : `${n} incidenten`);

/** @type {Partial<Strings>} */
export const NL_PIPELINE_UPTIME_TIMER = {
    pipelineLoading: 'Het bord wordt gelezen',
    pipelineEmpty: 'Er staat nog niets op het bord.',
    pipelineFailed: (reason) => (reason ? `Het bord kon niet gelezen worden: ${reason}` : 'Het bord kon niet gelezen worden.'),
    pipelineRetry: 'Opnieuw proberen',
    pipelineDanger: 'Vraagt aandacht',
    pipelineNone: 'geen',
    pipelineMore: (more) => `+${more} meer`,
    pipelineLess: 'Minder tonen',
    pipelineShare: (percent) => `${percent} % van alles`,
    uptimeLoading: 'De geschiedenis wordt gelezen…',
    uptimeEmpty: 'Nog geen data',
    uptimeError: 'De geschiedenis kon niet gelezen worden.',
    uptimePercent: (percent) => `${percent}%`,
    uptimeIncidents: (n) => incidents(n),
    uptimeSummary: (percent, n) => `${percent}% up, ${incidents(n)}`,
    uptimeTrack: (label, summary) => `${label}: ${summary}`,
    uptimeStateWord: (state) => ({ up: 'up', degraded: 'verminderd', down: 'down' })[state] ?? 'geen data',
    uptimeCell: (label, state, percent, n) =>
        [label, state, percent === null ? null : `${percent} up`, n === null ? null : incidents(n)].filter(Boolean).join(' · '),
    uptimeShown: (shown, total) => `${shown} van ${total} getoond`,
    uptimeInfoFigures: (percent, n) =>
        [percent === null ? null : `${percent}% up`, n === null ? null : incidents(n)].filter(Boolean).join(' · '),
    uptimeOpen: (label) => `${label} openen`,
    typeConfirmLabel: (name) => `Typ ${name} om te bevestigen`,
    typeConfirmRuleExact: 'Typ het exact: hoofdletters tellen; spaties aan het begin en het einde tellen niet.',
    typeConfirmRuleAnyCase: 'Hoofdletters tellen niet; spaties aan het begin en het einde ook niet.',
    typeConfirmMatched: 'Klopt',
    typeConfirmMismatch: 'Klopt nog niet',
    typeConfirmLoses: 'Dit verwijdert, voorgoed:',
    commandShell: (shell) => ({ wsl: 'WSL', powershell: 'PowerShell', cmd: 'cmd', garuda: 'Garuda', bash: 'bash' })[shell] ?? shell,
    commandAdmin: 'admin',
    commandAdminTitle: 'Voer het uit in een terminal die als administrator geopend is',
    commandSudo: 'sudo',
    commandSudoTitle: 'Loopt met rootrechten; de terminal vraagt je wachtwoord',
    commandRunsOn: (where) => `Loopt op ${where}`,
    commandSecretShow: 'Tonen',
    commandSecretHide: 'Verbergen',
    commandSecretShowLabel: 'De verborgen waarde in het commando tonen',
    commandSecretHidden: (name) => (name ? `${name}, verborgen` : 'verborgen waarde'),
    timerStart: 'Start',
    timerPause: 'Pauzeren',
    timerResume: 'Hervatten',
    timerReset: 'Opnieuw',
    timerAddMinute: (seconds) => (seconds % 60 === 0 ? `+${seconds / 60} min` : `+${seconds} s`),
    timerAddMinuteTitle: (seconds) => (seconds % 60 === 0 ? `${seconds / 60} min erbij` : `${seconds} s erbij`),
    timerPaused: 'Gepauzeerd',
    timerEnded: 'De tijd is om',
    timerEndedNamed: (name) => `${name}: de tijd is om`,
    timerStarted: 'Gestart',
    timerResumed: 'Gaat verder',
    timerLeft: (duration) => `nog ${duration}`,
    timerDuration: (seconds) => {
        if (seconds < 60) return `${seconds} s`;
        if (seconds >= 86400) {
            const d = Math.floor(seconds / 86400);
            const dh = Math.floor((seconds % 86400) / 3600);
            return dh ? `${d} d ${dh} u` : `${d} d`;
        }
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return [h ? `${h} u` : '', m ? `${m} min` : '', s ? `${s} s` : ''].filter(Boolean).join(' ');
    },
    timerDiscLeft: (left, total) => `nog ${left} van ${total}`,
    timerUnderMinute: 'minder dan een minuut',
    timerDiscCaption: (name, duration) => `${name} · ${duration}`,
    timerUntil: (when) => `tot ${when}`,
    countdownDays: (days, hours) => `${days} d ${hours} u`,
};
