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

import { getStrings } from './strings.js';
import { attachPatterns } from './patterns.js';

/** A command block. */
export const COMMAND = '[data-kp-command]';
/** The terminals the package knows, with their prompt and the line ends that carry a command on to the next line. */
export const COMMAND_SHELLS = /** @type {const} */ ({
    wsl: { prompt: '$', continues: ['\\', '|', '&&', '||'], windows: false },
    garuda: { prompt: '$', continues: ['\\', '|', '&&', '||'], windows: false },
    bash: { prompt: '$', continues: ['\\', '|', '&&', '||'], windows: false },
    powershell: { prompt: 'PS>', continues: ['`', '|'], windows: true },
    cmd: { prompt: '>', continues: ['^'], windows: true },
});

let seq = 0;

/**
 * The lines of a command, each with whether it carries on from the line before.
 * @param {string} text the command as written
 * @param {readonly string[]} continues the line ends that carry the command on (a continuation mark, a pipe)
 * @returns {{ text: string, continued: boolean }[]}
 */
export function commandLines(text, continues) {
    const lines = text
        .replace(/\r\n?/g, '\n')
        .replace(/^\n+|\s+$/g, '')
        .split('\n');
    let carry = false;
    return lines.map((line) => {
        const row = { text: line, continued: carry };
        const end = line.trimEnd();
        carry = continues.some((mark) => end.endsWith(mark));
        return row;
    });
}

/**
 * Wire every command block under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachCommands(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const blocks = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(COMMAND) ? [root] : []),
        ...root.querySelectorAll(COMMAND),
    ]);
    for (const el of blocks) {
        if (el.dataset.kpCommandReady !== undefined) continue;
        const pre = /** @type {HTMLElement | null} */ (el.querySelector(':scope > pre, :scope > .kp-command__code'));
        if (!pre) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const id = `kp-command-${++seq}`;
        const key = (el.dataset.kpCommand ?? '').toLowerCase();
        const shell = COMMAND_SHELLS[/** @type {keyof typeof COMMAND_SHELLS} */ (key)] ?? {
            prompt: '$',
            continues: /** @type {readonly string[]} */ ([]),
            windows: false,
        };
        // The prompt itself is the stylesheet's (`--kp-command-prompt`, by `data-kp-command-shell`); `prompt` above is
        // what it draws, kept here for a page that draws its own.
        const code = pre.querySelector('code') ?? pre;
        const before = { pre: pre.className, code: code.innerHTML, tabIndex: pre.getAttribute('tabindex'), role: pre.getAttribute('role') };

        el.classList.add('kp-command');
        el.dataset.kpCommandShell = key in COMMAND_SHELLS ? key : 'other';
        pre.classList.add('kp-command__code');
        code.id ||= `${id}-code`;

        // Every line on a line of its own, behind the prompt the stylesheet draws; the newlines stay in the text (in
        // hidden spans), so a copy is the command as written.
        const lines = commandLines(code.textContent ?? '', shell.continues);
        code.replaceChildren();
        lines.forEach((line, i) => {
            const row = doc.createElement('span');
            row.className = 'kp-command__line';
            if (line.continued) row.dataset.kpContinued = '';
            row.textContent = line.text;
            code.append(row);
            // The newline is kept for the copy but not drawn: each line is already a block of its own.
            if (i < lines.length - 1) {
                const gap = doc.createElement('span');
                gap.hidden = true;
                gap.textContent = '\n';
                code.append(gap);
            }
        });

        // The head: the terminal, the admin or sudo badge, the copy button.
        const head = doc.createElement('div');
        head.className = 'kp-command__head';
        const name = doc.createElement('span');
        name.className = 'kp-command__shell';
        name.id = `${id}-shell`;
        name.textContent = el.dataset.kpCommandLabel ?? s.commandShell(key);
        head.append(name);
        if (el.dataset.kpCommandElevated !== undefined) {
            const badge = doc.createElement('span');
            badge.className = 'kp-badge kp-badge--warning kp-command__elevated';
            badge.textContent = shell.windows ? s.commandAdmin : s.commandSudo;
            badge.title = shell.windows ? s.commandAdminTitle : s.commandSudoTitle;
            head.append(badge);
        }
        const slot = doc.createElement('span');
        slot.className = 'kp-command__copy-slot';
        const copy = doc.createElement('button');
        copy.type = 'button';
        copy.className = 'kp-button kp-button--sm kp-copyable__button kp-command__copy';
        copy.dataset.kpCopy = code.id;
        copy.dataset.kpCopiedText = s.copied;
        copy.textContent = s.copy;
        copy.setAttribute('aria-describedby', name.id);
        // Two invisible copies hold the cell as wide as the wider word.
        for (const [word, copied] of [
            [s.copy, false],
            [s.copied, true],
        ]) {
            const ghost = doc.createElement('span');
            ghost.className = 'kp-button kp-button--sm kp-copyable__button kp-command__copy kp-command__ghost';
            ghost.setAttribute('aria-hidden', 'true');
            if (copied) ghost.dataset.kpCopied = '';
            ghost.textContent = /** @type {string} */ (word);
            slot.append(ghost);
        }
        slot.append(copy);
        head.append(slot);

        // The note under the code: where it runs.
        /** @type {HTMLElement | null} */
        let where = null;
        if (el.dataset.kpCommandWhere) {
            where = doc.createElement('p');
            where.className = 'kp-command__where';
            where.textContent = s.commandRunsOn(el.dataset.kpCommandWhere);
        }

        /** @type {(() => void) | null} */
        let unscroll = null;
        if (el.dataset.kpCommandWrap === 'scroll') {
            pre.tabIndex = 0;
            pre.setAttribute('role', 'region');
            pre.setAttribute('aria-labelledby', name.id);
            // The side the code has more on fades, so a cut-off line reads as one that goes on.
            const edges = () => {
                const max = pre.scrollWidth - pre.clientWidth;
                pre.toggleAttribute('data-kp-command-before', pre.scrollLeft > 1);
                pre.toggleAttribute('data-kp-command-after', pre.scrollLeft < max - 1);
            };
            const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(edges) : null;
            watcher?.observe(pre);
            pre.addEventListener('scroll', edges, { passive: true });
            edges();
            unscroll = () => {
                watcher?.disconnect();
                pre.removeEventListener('scroll', edges);
                pre.removeAttribute('data-kp-command-before');
                pre.removeAttribute('data-kp-command-after');
            };
        }
        el.setAttribute('role', 'group');
        el.setAttribute('aria-labelledby', name.id);
        el.prepend(head);
        if (where) el.append(where);
        el.dataset.kpCommandReady = '';
        const unpattern = attachPatterns(head);

        cleanups.push(() => {
            unpattern();
            unscroll?.();
            head.remove();
            where?.remove();
            pre.className = before.pre;
            code.innerHTML = before.code;
            if (before.tabIndex === null) pre.removeAttribute('tabindex');
            if (before.role === null) pre.removeAttribute('role');
            pre.removeAttribute('aria-labelledby');
            el.removeAttribute('role');
            el.removeAttribute('aria-labelledby');
            delete el.dataset.kpCommandShell;
            delete el.dataset.kpCommandReady;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
