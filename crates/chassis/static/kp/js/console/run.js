// Running a command: the ticker, following the output, applying a change and submitting.
import { getStrings } from '../strings.js';
import { newPill } from '../newpill.js';
import { drawBar, statusOf } from './bar.js';
import { drawBody } from './blocks.js';
import { CONSOLE_BLOCK_EVENT, CONSOLE_HISTORY, CONSOLE_MAX_BYTES, CONSOLE_RUN_EVENT } from './constants.js';
import { saveHistory } from './history.js';
import { attr, needsConfirm, say, stateOf } from './model.js';
/** @typedef {import('./types.js').ConsoleBlock} ConsoleBlock */
/** @typedef {import('./types.js').ConsoleChange} ConsoleChange */

/** Keep the clock of running blocks ticking and the status words fresh. @param {HTMLElement} root */
export function startTicker(root) {
    const st = stateOf(root);
    window.clearInterval(st.tick);
    st.tick = window.setInterval(() => {
        if (!root.isConnected) return window.clearInterval(st.tick);
        for (const b of st.blocks) {
            if (b.state !== 'running') continue;
            const node = root.querySelector(`.kp-console__block[data-id="${CSS.escape(b.id)}"] .kp-console__status-word`);
            if (node) node.textContent = statusOf(root, b).text;
        }
    }, 1000);
}

/** After a change in the body: stay with the newest block when the reader is following. @param {HTMLElement} root @param {boolean} [force] */
export function follow(root, force = false) {
    const body = /** @type {HTMLElement | null} */ (root.querySelector('.kp-console__body'));
    if (!body || attr(root, 'follow', 'stick') === 'off') return;
    const handle = newPill(body);
    const head = body.getAttribute('data-kp-follow') === 'head';
    if (force || !handle || handle.following()) body.scrollTop = head ? 0 : body.scrollHeight;
}

/** @param {HTMLElement} root @param {string} id @param {ConsoleChange} change */
export function applyChange(root, id, change) {
    const st = stateOf(root);
    const b = st.blocks.find((x) => x.id === id);
    if (!b) return;
    const max = Number(attr(root, 'max-bytes', String(CONSOLE_MAX_BYTES))) || CONSOLE_MAX_BYTES;
    const was = b.state;
    if (change.state) b.state = change.state;
    if (change.code !== undefined) b.code = change.code;
    if (change.error !== undefined) b.error = change.error;
    if (change.remedy !== undefined) b.remedy = change.remedy;
    if (change.output !== undefined) b.output = change.output;
    if (change.append !== undefined) b.output += change.append;
    if (b.output.length > max) {
        b.total = b.output.length;
        b.output = b.output.slice(0, max);
        b.truncated = true;
    }
    const finished = !['sending', 'queued', 'running'].includes(b.state ?? '');
    if (finished && b.endedAt === undefined) b.endedAt = Date.now();
    drawBody(root);
    follow(root);
    root.dispatchEvent(new CustomEvent(CONSOLE_BLOCK_EVENT, { bubbles: true, detail: { block: { ...b } } }));
    if (finished && was !== b.state) {
        st.jobs.delete(id);
        const last = st.blocks[st.blocks.length - 1];
        // Only the last command is announced; its output never is.
        if (last && last.id === id) {
            const s = getStrings();
            say(
                root,
                b.state === 'ok'
                    ? s.consoleFinishedOk(b.code ?? 0)
                    : b.state === 'failed'
                      ? s.consoleFinishedFailed(b.code ?? 1)
                      : b.state === 'refused'
                        ? s.consoleFinishedRefused
                        : b.state === 'cancelled'
                          ? s.consoleCancelled
                          : s.consoleLost,
            );
        }
    }
}

/** Run one command through the app's `run`. @param {HTMLElement} root @param {string} command @param {{ again?: boolean }} [options] @returns {Promise<boolean>} */
export async function runCommand(root, command, { again = false } = {}) {
    const st = stateOf(root);
    const s = getStrings();
    const context = attr(root, 'context', 'none') === 'select' ? st.context.value : '';
    const go = root.dispatchEvent(new CustomEvent(CONSOLE_RUN_EVENT, { bubbles: true, cancelable: true, detail: { command, context } }));
    if (!go) return false;
    if (!st.run) return false;
    /** @type {ConsoleBlock} */
    const block = { id: crypto.randomUUID(), command, context, state: 'sending', output: '', startedAt: Date.now(), collapsed: false };
    st.blocks.push(block);
    drawBody(root);
    follow(root, true);
    root.dispatchEvent(new CustomEvent(CONSOLE_BLOCK_EVENT, { bubbles: true, detail: { block: { ...block } } }));
    try {
        const job = await st.run(command, context);
        st.jobs.set(block.id, job);
        applyChange(root, block.id, { state: 'queued' });
        job.update((change) => applyChange(root, block.id, change));
    } catch (error) {
        applyChange(root, block.id, { state: 'refused', error: error instanceof Error && error.message ? error.message : s.consoleRefusedWhat });
        return false;
    }
    void again;
    return true;
}

/** The line was submitted. @param {HTMLElement} root */
export async function submit(root) {
    const st = stateOf(root);
    const input = /** @type {HTMLInputElement} */ (root.querySelector('.kp-console__input'));
    const command = input.value.trim();
    if (command === '' || input.disabled) return;
    if (needsConfirm(root, command) && st.pending !== command) {
        st.pending = command;
        window.clearTimeout(st.pendingTimer);
        st.pendingTimer = window.setTimeout(() => {
            st.pending = null;
            drawBar(root);
        }, 6000);
        drawBar(root);
        say(root, getStrings().consoleConfirmSaid(command));
        return;
    }
    window.clearTimeout(st.pendingTimer);
    st.pending = null;
    // The history first: a refusal never loses what was typed, and the line is recalled either way.
    if (!(attr(root, 'dedupe', 'true') !== 'false' && st.history[st.history.length - 1] === command)) st.history.push(command);
    const limit = Number(attr(root, 'history', String(CONSOLE_HISTORY))) || CONSOLE_HISTORY;
    while (st.history.length > limit) st.history.shift();
    saveHistory(root);
    st.at = -1;
    st.draft = '';
    const ok = await runCommand(root, command);
    drawBar(root);
    // A command that went out clears the line; one the app refused outright keeps it.
    if (ok) {
        input.value = '';
    }
    input.focus();
}
