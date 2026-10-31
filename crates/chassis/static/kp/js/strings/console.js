// The words of the console.

/**
 * @typedef {object} ConsoleStrings
 * @property {string} consoleUnit  The pill's word for a block, singular and plural (js/console.js) [kpadopt6]
 * @property {string} consoleOutputLabel  The body's name for a screen reader (js/console.js) [kpadopt6]
 * @property {string} consoleCommand  The prompt's name when the console has none (js/console.js) [kpadopt6]
 * @property {string} consoleHostFailed  The failed plate's heading and the reason the prompt is off then (js/console.js) [kpadopt6]
 * @property {string} consoleHostFailedText  The failed plate's sentence (js/console.js) [kpadopt6]
 * @property {string} consoleOff  Why the prompt is off when the page gives no reason (js/console.js) [kpadopt6]
 * @property {string} consoleContextLoadingWhy  Why the prompt is off while the context list loads (js/console.js) [kpadopt6]
 * @property {string} consoleRun  The Run button (js/console.js) [kpadopt6]
 * @property {string} consoleRunAnyway  The Run button after a line the app wants confirmed (js/console.js) [kpadopt6]
 * @property {string} consoleHint  The line under the prompt when the page gives none (js/console.js) [kpadopt6]
 * @property {string} consoleContext  The context select's label when the page gives none (js/console.js) [kpadopt6]
 * @property {string} consoleContextLoading  The select while its options load (js/console.js) [kpadopt6]
 * @property {string} consoleSending  A block before the app answered (js/console.js) [kpadopt6]
 * @property {string} consoleQueued  A queued block (js/console.js) [kpadopt6]
 * @property {string} consoleRunning  A running block with its timer off (js/console.js) [kpadopt6]
 * @property {(time: string) => string} consoleRunningFor  A running block's status with its elapsed time (js/console.js) [kpadopt6]
 * @property {(code: number) => string} consoleExit  A finished block's exit code (js/console.js) [kpadopt6]
 * @property {string} consoleDone  The word beside exit 0 (js/console.js) [kpadopt6]
 * @property {string} consoleFailed  The word beside a non-zero exit (js/console.js) [kpadopt6]
 * @property {string} consoleRefused  A block the app refused (js/console.js) [kpadopt6]
 * @property {string} consoleCancelled  A block that was stopped (js/console.js) [kpadopt6]
 * @property {string} consoleLost  A block whose connection dropped (js/console.js) [kpadopt6]
 * @property {string} consoleCopyCommand  The block's button that copies its command (js/console.js) [kpadopt6]
 * @property {string} consoleCopyOutput  The block's button that copies its output (js/console.js) [kpadopt6]
 * @property {string} consoleAgain  The block's button that runs its command again (js/console.js) [kpadopt6]
 * @property {string} consoleRecheck  The lost block's button that runs it again to see (js/console.js) [kpadopt6]
 * @property {string} consoleCancel  The running block's button that stops it (js/console.js) [kpadopt6]
 * @property {string} consoleCollapse  The block's button that folds it (js/console.js) [kpadopt6]
 * @property {string} consoleExpand  The block's button that opens it again (js/console.js) [kpadopt6]
 * @property {string} consoleCopied  A copy button's result word (js/console.js) [kpadopt6]
 * @property {string} consoleNotCopied  A copy button's refusal word (js/console.js) [kpadopt6]
 * @property {string} consoleLostWhat  A lost block's what (js/console.js) [kpadopt6]
 * @property {string} consoleLostNow  A lost block's what now (js/console.js) [kpadopt6]
 * @property {string} consoleRefusedWhat  A refusal's what when the app gave none (js/console.js) [kpadopt6]
 * @property {string} consoleNoOutput  A finished block with nothing written (js/console.js) [kpadopt6]
 * @property {string} consoleOutput  The output block's title (js/console.js) [kpadopt6]
 * @property {string} consoleWaitingOutput  A running block that has written nothing yet (js/console.js) [kpadopt6]
 * @property {string} consoleRetry  The failed plate's button (js/console.js) [kpadopt6]
 * @property {string} consoleLoading  The words under the busy card while the console loads (js/console.js) [kpadopt6]
 * @property {(n: number) => string} consoleEarlier  The line that stands for blocks folded away (js/console.js) [kpadopt6]
 * @property {string} consoleEmptyTitle  The empty plate's heading (js/console.js) [kpadopt6]
 * @property {string} consoleEmptyText  Its sentence (js/console.js) [kpadopt6]
 * @property {(code: number) => string} consoleFinishedOk  Said when the last command succeeded (js/console.js) [kpadopt6]
 * @property {(code: number) => string} consoleFinishedFailed  Said when the last command failed (js/console.js) [kpadopt6]
 * @property {string} consoleFinishedRefused  Said when the last command was refused (js/console.js) [kpadopt6]
 * @property {(command: string) => string} consoleConfirmSaid  Said when a line needs a second press (js/console.js) [kpadopt6]
 * @property {string} consoleCleared  The toast and the line after Clear (js/console.js) [kpadopt6]
 * @property {string} consoleCompletions  The completion list's name (js/console.js) [kpadopt6]
 * @property {(n: number) => string} consoleMatches  Said after Tab found several (js/console.js) [kpadopt6]
 * @property {string} consoleKeyClear  The shortcut sheet's line for Ctrl L (js/console.js) [kpadopt6]
 * @property {string} consoleKeyGroup  The sheet's heading (js/console.js) [kpadopt6]
 * @property {string} consoleKeyFocus  The sheet's line for the focus key (js/console.js) [kpadopt6]
 * @property {string} consoleKeyFocusReason  Why the focus key does nothing now (js/console.js) [kpadopt6]
 * @property {(n: number) => string} qrShowAllChars  The button that unfolds a long link under the code (js/qr.js) [kpadopt6]
 * @property {string} qrShowLess  The button that folds it again (js/qr.js) [kpadopt6]
 */

/** @type {ConsoleStrings} */
export const CONSOLE_STRINGS = {
    // Console (js/console.js) [kpadopt6].
    consoleUnit: 'command,commands',
    consoleOutputLabel: 'Commands and their output',
    consoleCommand: 'Command',
    consoleHostFailed: 'Could not reach the host',
    consoleHostFailedText: 'Nothing can be run until the host answers again.',
    consoleOff: 'Running commands is off here.',
    consoleContextLoadingWhy: 'Waiting for the list to choose from.',
    consoleRun: 'Run',
    consoleRunAnyway: 'Run it anyway?',
    consoleHint: 'Up and Down walk your earlier lines.',
    consoleContext: 'Run in',
    consoleContextLoading: 'Reading the list…',
    consoleSending: 'Sending…',
    consoleQueued: 'Waiting its turn',
    consoleRunning: 'Running',
    consoleRunningFor: (time) => `Running for ${time}`,
    consoleExit: (code) => `exit ${code}`,
    consoleDone: 'Done',
    consoleFailed: 'Failed',
    consoleRefused: 'Refused',
    consoleCancelled: 'Cancelled',
    consoleLost: 'Not sure it finished',
    consoleCopyCommand: 'Copy command',
    consoleCopyOutput: 'Copy output',
    consoleAgain: 'Run again',
    consoleRecheck: 'Check again',
    consoleCancel: 'Cancel',
    consoleCollapse: 'Collapse',
    consoleExpand: 'Expand',
    consoleCopied: 'Copied',
    consoleNotCopied: 'Not copied',
    consoleLostWhat: 'The connection dropped while this was running.',
    consoleLostNow: 'It may have finished. Check again to find out.',
    consoleRefusedWhat: 'The command was refused.',
    consoleNoOutput: '(no output)',
    consoleOutput: 'Output',
    consoleWaitingOutput: 'Waiting for output…',
    consoleRetry: 'Retry',
    consoleLoading: 'Reading the host…',
    consoleEarlier: (n) => `Show ${n} earlier ${n === 1 ? 'command' : 'commands'}`,
    consoleEmptyTitle: 'Run a command below',
    consoleEmptyText: 'What it prints shows up here, one block per command.',
    consoleFinishedOk: (code) => `Command finished, exit ${code}`,
    consoleFinishedFailed: (code) => `Command failed, exit ${code}`,
    consoleFinishedRefused: 'Command refused',
    consoleConfirmSaid: (command) => `${command}: press Run again to confirm`,
    consoleCleared: 'Screen cleared',
    consoleCompletions: 'Completions',
    consoleMatches: (n) => `${n} matches`,
    consoleKeyClear: 'Clear the screen',
    consoleKeyGroup: 'In the console',
    consoleKeyFocus: 'Go to the console prompt',
    consoleKeyFocusReason: 'The prompt is off now.',
    // Qr (js/qr.js) [kpadopt6].
    qrShowAllChars: (n) => `Show all ${n} characters`,
    qrShowLess: 'Show less',
};
