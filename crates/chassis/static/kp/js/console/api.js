// The functions a page calls to feed, read and clear a console, and the tool hook.
import { getStrings } from '../strings.js';
import { undoToast } from '../undo-toast.js';
import { runFlashButton } from '../flash.js';
import { drawBar, ensureParts } from './bar.js';
import { drawAll, drawBody } from './blocks.js';
import { STATE, say, stateOf } from './model.js';
import { applyChange, follow, runCommand } from './run.js';
/** @typedef {import('./types.js').ConsoleBlock} ConsoleBlock */
/** @typedef {import('./types.js').ConsoleRun} ConsoleRun */

/**
 * Give a console its `run`.
 * @param {HTMLElement} root @param {ConsoleRun} run
 */
export function setConsoleRun(root, run) {
    ensureParts(root);
    stateOf(root).run = run;
}

/**
 * Give the Tab key its completions.
 * @param {HTMLElement} root @param {(prefix: string) => string[] | Promise<string[]>} complete
 */
export function setConsoleComplete(root, complete) {
    stateOf(root).complete = complete;
}

/**
 * Fill the context select (the container to run in).
 * @param {HTMLElement} root @param {{ options?: { value: string, label: string }[], value?: string, state?: 'loading' | 'ready', label?: string }} context
 */
export function setConsoleContext(root, context) {
    ensureParts(root);
    const st = stateOf(root);
    st.context = { ...st.context, ...context, options: context.options ?? st.context.options };
    if (!st.context.value && st.context.options[0]) st.context.value = st.context.options[0].value;
    drawBar(root);
}

/**
 * The console's state: `loading`, `error` (the host could not be reached) or `ready`.
 * @param {HTMLElement} root @param {{ state?: 'ready' | 'loading' | 'error', message?: string, hint?: string }} spec
 */
export function setConsole(root, spec) {
    ensureParts(root);
    const st = stateOf(root);
    st.spec = { ...st.spec, ...spec };
    if (spec.hint !== undefined) root.setAttribute('data-kp-console-hint', spec.hint);
    drawAll(root);
}

/** The blocks as they stand. @param {HTMLElement} root @returns {ConsoleBlock[]} */
export function consoleBlocks(root) {
    return (STATE.get(root)?.blocks ?? []).map((b) => ({ ...b }));
}

/** Run a line as if it was typed (a "Run again" or a page's own button). @param {HTMLElement} root @param {string} command */
export function runConsoleCommand(root, command) {
    return runCommand(root, command);
}

/** Clear the screen; the blocks come back for a while (Undo). @param {HTMLElement} root @param {{ undo?: boolean }} [options] */
export function clearConsole(root, { undo = true } = {}) {
    const st = stateOf(root);
    if (st.blocks.length === 0) return;
    const gone = st.blocks;
    const s = getStrings();
    st.blocks = [];
    drawBody(root);
    say(root, s.consoleCleared);
    if (undo)
        undoToast(s.consoleCleared, {
            mode: 'revert',
            ms: 6000,
            undo: () => {
                st.blocks = [...gone, ...st.blocks];
                drawBody(root);
                follow(root, true);
            },
        });
}

/** Whether a block's tool was pressed. @param {HTMLElement} root @param {string} tool @param {ConsoleBlock} b @param {HTMLElement} button */
export async function useTool(root, tool, b, button) {
    const st = stateOf(root);
    const s = getStrings();
    if (tool === 'collapse') {
        b.collapsed = !b.collapsed;
        drawBody(root);
        return;
    }
    if (tool === 'again' || tool === 'recheck') {
        const input = /** @type {HTMLInputElement} */ (root.querySelector('.kp-console__input'));
        input.value = b.command;
        await runCommand(root, b.command, { again: true });
        input.value = '';
        return;
    }
    if (tool === 'cancel') {
        st.jobs.get(b.id)?.cancel?.();
        applyChange(root, b.id, { state: 'cancelled' });
        return;
    }
    const text = tool === 'copy-command' ? b.command : b.output;
    await runFlashButton(button, async () => {
        try {
            await navigator.clipboard.writeText(text);
            return s.consoleCopied;
        } catch {
            return { error: s.consoleNotCopied, word: s.consoleNotCopied };
        }
    });
}
