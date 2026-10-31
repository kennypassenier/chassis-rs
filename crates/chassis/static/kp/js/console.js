// An interactive console: a prompt and, per command, a block that says whether it still runs, succeeded or failed
// [kpadopt6; homelab's Shell page, `shell.js` and `.con-*`].
//
//   <div class="kp-console" data-kp-console data-kp-console-prompt="#" aria-label="Host console"></div>
//
//   setConsoleRun(el, (command, context) => ({
//       update(handler) { poll(command, (s) => handler({ state: 'running', output: s.output })); },   // then { state: 'ok', code: 0 }
//       cancel() { stop(); },                                                                           // optional
//   }));
//
// The split with the app: this part owns the shell of the interaction (the prompt, the recall of earlier lines, the
// blocks and their states, the output folded and copyable, the keys). The app supplies `run(command, context)` and
// everything about what a command may do (whether it is allowed, the queue, the audit log, masking, the list of
// containers) stays with the app. A block's states, which the job reports through `handler(change)`:
//
//   sending   before the app answered          queued    waiting its turn            running   still going (a timer shows)
//   ok        exit 0                           failed    exit n, with `code`         refused   the app said no (`error`, `remedy`)
//   cancelled stopped on request               lost      the connection dropped: "Not sure it finished" and a re-check
//
// A change is `{ state, code?, output?, append?, error?, remedy?, truncated? }`: `output` replaces, `append` adds. A refusal
// keeps what was typed in the prompt, nothing a person wrote is lost.
//
// Options (attributes on the root, each also a key of `attachConsoles` / `setConsole`):
//   data-kp-console-prompt     the prompt glyph (`#`, the app's word)
//   data-kp-console-context    `select`: a labelled select before the prompt whose value goes to `run` (`setConsoleContext`)
//   data-kp-console-history    how many lines the Up key recalls (50)
//   data-kp-console-remember   `session` (default, only while the tab is open: a line can hold a secret), `device` or `off`
//   data-kp-console-dedupe     the same line twice in a row is recalled once (on; `false` turns it off)
//   data-kp-console-order      `newest-last` (default, a terminal that grows downward) or `newest-first`
//   data-kp-console-follow     `stick` (default) follows the newest block unless the reader scrolled up (then a pill with an exact count)
//   data-kp-console-max-blocks blocks kept (200); older ones fold into "N earlier commands"
//   data-kp-console-max-lines  lines of output shown before the fold (12)
//   data-kp-console-max-bytes  bytes of output kept per block (262144)
//   data-kp-console-status     `exit-code` (default) or `word`
//   data-kp-console-timer      on; `false` hides the elapsed time of a running block
//   data-kp-console-cancel     present: a running block offers Cancel when the job can
//   data-kp-console-tab        `none` (default) or `complete` (Tab asks `complete(prefix)`)
//   data-kp-console-focus-key  the key that jumps to the prompt from anywhere (`:`; `false` for none)
//   data-kp-console-confirm    a list of words or a regular expression: a matching line needs a second press ("Run it anyway?")
//   data-kp-console-hint       the line under the prompt, its height reserved
//   data-kp-console-mode       `full` (default) or `bar` (prompt, select and Run only; blocks go out as `kp-console-block`)
//   data-kp-disabled-reason    with `disabled`: why nothing can be run
//   data-kp-state              `loading`, `error`, `ready`
//
// Events (bubbling, on the root): `kp-console-run` `{ command, context }` (cancelable), `kp-console-block` `{ block }`,
// `kp-console-retry`. Every word is in js/strings.js; nothing runs on import.

export {
    CONSOLE,
    CONSOLE_RUN_EVENT,
    CONSOLE_BLOCK_EVENT,
    CONSOLE_RETRY_EVENT,
    CONSOLE_STATES,
    CONSOLE_HISTORY,
    CONSOLE_MAX_BYTES,
} from './console/constants.js';
export { setConsoleRun, setConsoleComplete, setConsoleContext, setConsole, consoleBlocks, runConsoleCommand, clearConsole } from './console/api.js';
export { attachConsoles } from './console/attach.js';

/** @typedef {import('./console/types.js').ConsoleChange} ConsoleChange */
/** @typedef {import('./console/types.js').ConsoleJob} ConsoleJob */
/** @typedef {import('./console/types.js').ConsoleRun} ConsoleRun */
/** @typedef {import('./console/types.js').ConsoleBlock} ConsoleBlock */
/** @typedef {import('./console/types.js').ConsoleState} ConsoleState */
