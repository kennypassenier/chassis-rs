// The command block [kpadopt4-ideas, Kenny 2026-10-16].
//
// One command to run, with the terminal it runs in, whether it needs admin or
// sudo, a copy button that confirms, and where it runs:
//
//   <div class="kp-command" data-kp-command="wsl" data-kp-command-elevated data-kp-command-where="CT 109 (kyu)">
//       <pre class="kp-command__code"><code>sudo systemctl restart kyu</code></pre>
//   </div>
//
// attachCommands(root) writes the head (the terminal's name, the admin or
// sudo badge, the copy button) and the note under the code, and lays every
// line of the command out on a line of its own behind the terminal's prompt
// (`$`, `PS>`, `>`; `data-kp-command-shell` names it for the stylesheet,
// which draws it, so it is never copied). A line
// that ends in the terminal's continuation mark (`\` in a Linux shell, a
// backtick in PowerShell, `^` in cmd) carries on on the next, which is
// indented instead of prompted; so does a line that ends in a pipe (or `&&`,
// `||` in a Linux shell).
//
// The copy button is the package's own (`[data-kp-copy]`, js/patterns.js): it
// copies the command as written, says "Copied" on the button and announces it,
// and fires `kp-copy`; when the clipboard refuses it says so and fires
// `kp-copy-failed`. The button keeps one width for both words (two invisible
// copies of it stand in its cell), so nothing in the head moves.
//
// A long line wraps by default, under its own first character after the
// prompt; with `data-kp-command-wrap="scroll"` it stays one line and the code
// scrolls sideways inside its block (a focusable region, so a keyboard can
// scroll it too). Nothing is ever cut.
//
// Terminals the dictionary names: `wsl`, `powershell`, `cmd`, `garuda`,
// `bash`. Another value is shown as written, or as `data-kp-command-label`.
//
// Nothing runs on import; attachCommands(root) returns a detach.

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names, the lines, the head and the CommandBlock controller
// live in js/command/, listed in js/README.md.

import { wireCommands } from './command/attach.js';

export { COMMAND, COMMAND_SHELLS } from './command/values.js';
export { commandLines } from './command/lines.js';

/**
 * Wire every command block under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachCommands(root = document) {
    return wireCommands(root);
}
