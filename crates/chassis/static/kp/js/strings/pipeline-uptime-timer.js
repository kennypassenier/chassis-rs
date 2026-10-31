// The words of pipelines, the uptime strip, type and command blocks and timers.

/**
 * @typedef {object} PipelineUptimeTimerStrings
 * @property {string} pipelineLoading  The words on a pipeline's loading card (js/pipeline.js) [kpadopt4]
 * @property {string} pipelineEmpty  The sentence over a pipeline with no cards, when the page gives none
 * @property {(reason: string) => string} pipelineFailed  The sentence over a pipeline that could not be read
 * @property {string} pipelineRetry  Its Try again button
 * @property {string} pipelineDanger  The word on a failing lane's name plate (`danger: true`), so the colour is never the only carrier [r1r2-1019]
 * @property {string} pipelineNone  The word in a lane with no cards
 * @property {(more: number) => string} pipelineMore  The button under a lane's first cards, "+4 more"
 * @property {string} pipelineLess  The same button while the lane shows every card
 * @property {(percent: number) => string} pipelineShare  A lane's share of all cards, "25 % of all"
 * @property {string} uptimeLoading  The uptime strip's busy card and its summary while the history is read (js/uptime.js) [kpadopt4-ideas]
 * @property {string} uptimeEmpty  Its summary when no period has data yet [kpadopt4-ideas]
 * @property {string} uptimeError  Its summary when the history could not be read and the page gave no sentence [kpadopt4-ideas]
 * @property {(percent: string) => string} uptimePercent  The window's share up, from "99.4" to "99.4%" [kpadopt4-ideas]
 * @property {(n: number) => string} uptimeIncidents  The window's incident count, exact: "1 incident", "12 incidents" [kpadopt4-ideas]
 * @property {(percent: string, incidents: number) => string} uptimeSummary  The summary as one sentence, for a screen reader [kpadopt4-ideas]
 * @property {(label: string, summary: string) => string} uptimeTrack  The strip's name: its title and its summary [kpadopt4-ideas]
 * @property {(state: string) => string} uptimeStateWord  A period's state as a word: up, degraded, down, no data [kpadopt4-ideas]
 * @property {(label: string, state: string, percent: string | null, incidents: number | null) => string} uptimeCell  A cell's name and hover card: its period, its state and its figures [kpadopt4-ideas]
 * @property {(shown: number, total: number) => string} uptimeShown  Under a strip too narrow for every cell: "55 of 90 shown" [kpadopt4-ideas]
 * @property {(percent: string | null, incidents: number | null) => string} uptimeInfoFigures  A period's figures in its quick info: "99.4% up · 1 incident" [kpadopt4 r2]
 * @property {(label: string) => string} uptimeOpen  The link in a period's quick info to the period's own page: "Open 14/10/2026" [kpadopt4 r2]
 * @property {(name: string) => string} typeConfirmLabel  The typed confirmation's label; the name is set in as code where this sentence puts it (js/components.js) [kpadopt4-ideas]
 * @property {string} typeConfirmRuleExact  Its rule when capitals count [kpadopt4-ideas]
 * @property {string} typeConfirmRuleAnyCase  Its rule when capitals do not count (`data-kp-confirm-case="any"`) [kpadopt4-ideas]
 * @property {string} typeConfirmMatched  The badge once the typed name matches [kpadopt4-ideas]
 * @property {string} typeConfirmMismatch  The line while what is typed does not match yet [kpadopt4-ideas]
 * @property {string} typeConfirmLoses  The heading over what the action will delete [kpadopt4-ideas]
 * @property {(shell: string) => string} commandShell  A command block's terminal by its key: WSL, PowerShell, cmd, Garuda, bash; another key as written (js/command.js) [kpadopt4-ideas]
 * @property {string} commandAdmin  The badge of a Windows command that needs a terminal opened as administrator [kpadopt4-ideas]
 * @property {string} commandAdminTitle  Its tooltip [kpadopt4-ideas]
 * @property {string} commandSudo  The badge of a Linux command that runs with root rights [kpadopt4-ideas]
 * @property {string} commandSudoTitle  Its tooltip [kpadopt4-ideas]
 * @property {(where: string) => string} commandRunsOn  The note under a command that says where it runs [kpadopt4-ideas]
 * @property {string} commandSecretShow  The button that shows a masked token in a command (js/command/secret.js) [kyu gap 15]
 * @property {string} commandSecretHide  The same button while the token shows [kyu gap 15]
 * @property {string} commandSecretShowLabel  Its name for a screen reader [kyu gap 15]
 * @property {(name: string) => string} commandSecretHidden  What a screen reader hears in place of a masked token, "kyu token, hidden" [kyu gap 15]
 * @property {string} timerStart  A timer's Start button (js/countdown.js, js/timer-disc.js) [kpadopt4-ideas]
 * @property {string} timerPause  The same button while it runs [kpadopt4-ideas]
 * @property {string} timerResume  The same button while it is paused [kpadopt4-ideas]
 * @property {string} timerReset  A timer's Reset button [kpadopt4-ideas]
 * @property {(seconds: number) => string} timerAddMinute  The countdown's button that adds time: "+1 min" [kpadopt4-ideas]
 * @property {(seconds: number) => string} timerAddMinuteTitle  Its tooltip: "Add 1 min" [kpadopt4-ideas]
 * @property {string} timerPaused  The line under a paused timer, and what a screen reader hears [kpadopt4-ideas]
 * @property {string} timerEnded  The line under a timer whose time is up [kpadopt4-ideas]
 * @property {(name: string) => string} timerEndedNamed  What a screen reader hears when a named timer ends [kpadopt4-ideas]
 * @property {string} timerStarted  What a screen reader hears when a timer starts [kpadopt4-ideas]
 * @property {string} timerResumed  What a screen reader hears when it goes on after a pause [kpadopt4-ideas]
 * @property {(duration: string) => string} timerLeft  The countdown's time left for a screen reader: "25 min left" [kpadopt4-ideas]
 * @property {(seconds: number) => string} timerDuration  A timer's length in words: "25 min", "1 h 30 min", "45 s" [kpadopt4-ideas]
 * @property {(left: string, total: string) => string} timerDiscLeft  The visual timer's face for a screen reader: "12 min left of 25 min" [kpadopt4-ideas]
 * @property {string} timerUnderMinute  The time left on the face in its last minute [kpadopt4-ideas]
 * @property {(name: string, duration: string) => string} timerDiscCaption  The still line under the disc: "Focus · 25 min" [kpadopt4-ideas]
 * @property {(when: string) => string} timerUntil  The still line of a timer that counts down to a moment: "until 14:30" [gaps-time-1019]
 * @property {(days: number, hours: number) => string} countdownDays  A countdown of 24 hours or more, "6 d 22 h" (js/countdown.js) [wish-1120]
 */

/** @type {PipelineUptimeTimerStrings} */
export const PIPELINE_UPTIME_TIMER_STRINGS = {
    pipelineLoading: 'Reading the board',
    pipelineEmpty: 'Nothing on the board yet.',
    pipelineFailed: (reason) => (reason ? `Could not read the board: ${reason}` : 'Could not read the board.'),
    pipelineRetry: 'Try again',
    pipelineDanger: 'Needs attention',
    pipelineNone: 'none',
    pipelineMore: (more) => `+${more} more`,
    pipelineLess: 'Show fewer',
    pipelineShare: (percent) => `${percent} % of all`,
    // The uptime strip [kpadopt4-ideas]: the figures are exact, never "9+".
    uptimeLoading: 'Reading the history…',
    uptimeEmpty: 'No data yet',
    uptimeError: 'The history could not be read.',
    uptimePercent: (percent) => `${percent}%`,
    uptimeIncidents: (n) => (n === 1 ? '1 incident' : `${n} incidents`),
    uptimeSummary: (percent, incidents) => `${percent}% up, ${incidents === 1 ? '1 incident' : `${incidents} incidents`}`,
    uptimeTrack: (label, summary) => `${label}: ${summary}`,
    uptimeStateWord: (state) => ({ up: 'up', degraded: 'degraded', down: 'down' })[state] ?? 'no data',
    uptimeCell: (label, state, percent, incidents) =>
        [
            label,
            state,
            percent === null ? null : `${percent} up`,
            incidents === null ? null : incidents === 1 ? '1 incident' : `${incidents} incidents`,
        ]
            .filter(Boolean)
            .join(' · '),
    uptimeShown: (shown, total) => `${shown} of ${total} shown`,
    uptimeInfoFigures: (percent, incidents) =>
        [percent === null ? null : `${percent}% up`, incidents === null ? null : incidents === 1 ? '1 incident' : `${incidents} incidents`]
            .filter(Boolean)
            .join(' · '),
    uptimeOpen: (label) => `Open ${label}`,
    // The typed confirmation [kpadopt4-ideas].
    typeConfirmLabel: (name) => `Type ${name} to confirm`,
    typeConfirmRuleExact: 'Type it exactly: capitals count; spaces at the start and the end are ignored.',
    typeConfirmRuleAnyCase: 'Capitals do not count; spaces at the start and the end are ignored.',
    typeConfirmMatched: 'Matches',
    typeConfirmMismatch: 'Does not match yet',
    typeConfirmLoses: 'This deletes, for good:',
    // The command block [kpadopt4-ideas].
    commandShell: (shell) => ({ wsl: 'WSL', powershell: 'PowerShell', cmd: 'cmd', garuda: 'Garuda', bash: 'bash' })[shell] ?? shell,
    commandAdmin: 'admin',
    commandAdminTitle: 'Run it in a terminal opened as administrator',
    commandSudo: 'sudo',
    commandSudoTitle: 'Runs with root rights; the terminal asks for your password',
    commandRunsOn: (where) => `Runs on ${where}`,
    commandSecretShow: 'Show',
    commandSecretHide: 'Hide',
    commandSecretShowLabel: 'Show the hidden value in the command',
    commandSecretHidden: (name) => (name ? `${name}, hidden` : 'hidden value'),
    // The two timers [kpadopt4-ideas].
    timerStart: 'Start',
    timerPause: 'Pause',
    timerResume: 'Resume',
    timerReset: 'Reset',
    timerAddMinute: (seconds) => (seconds % 60 === 0 ? `+${seconds / 60} min` : `+${seconds} s`),
    timerAddMinuteTitle: (seconds) => (seconds % 60 === 0 ? `Add ${seconds / 60} min` : `Add ${seconds} s`),
    timerPaused: 'Paused',
    timerEnded: 'Time is up',
    timerEndedNamed: (name) => `${name}: time is up`,
    timerStarted: 'Started',
    timerResumed: 'Going on',
    timerLeft: (duration) => `${duration} left`,
    timerDuration: (seconds) => {
        if (seconds < 60) return `${seconds} s`;
        if (seconds >= 86400) {
            const d = Math.floor(seconds / 86400);
            const dh = Math.floor((seconds % 86400) / 3600);
            return dh ? `${d} d ${dh} h` : `${d} d`;
        }
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return [h ? `${h} h` : '', m ? `${m} min` : '', s ? `${s} s` : ''].filter(Boolean).join(' ');
    },
    timerDiscLeft: (left, total) => `${left} left of ${total}`,
    timerUnderMinute: 'under a minute',
    timerDiscCaption: (name, duration) => `${name} · ${duration}`,
    timerUntil: (when) => `until ${when}`,
    countdownDays: (days, hours) => `${days} d ${hours} h`,
};
