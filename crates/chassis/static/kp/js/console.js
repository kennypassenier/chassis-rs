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

import { getStrings } from './strings.js';
import { setCode } from './code.js';
import { statePlate } from './state-plate.js';
import { openBusyCard } from './busy-card.js';
import { registerShortcuts } from './shortcuts.js';
import { undoToast } from './undo-toast.js';
import { attachNewPills, newPill } from './newpill.js';
import { attachDisabledReasons } from './reason.js';
import { runFlashButton } from './flash.js';

/** The consoles this module looks after. */
export const CONSOLE = '[data-kp-console]';
/** Fired before a command goes to the app, cancelable: `{ command, context }`. */
export const CONSOLE_RUN_EVENT = 'kp-console-run';
/** Fired when a block is made or changes: `{ block }`. */
export const CONSOLE_BLOCK_EVENT = 'kp-console-block';
/** Fired by the Retry of a console that could not reach its host. */
export const CONSOLE_RETRY_EVENT = 'kp-console-retry';
/** The states a block can be in. */
export const CONSOLE_STATES = Object.freeze(['sending', 'queued', 'running', 'ok', 'failed', 'refused', 'cancelled', 'lost']);
/** The default number of recalled lines. */
export const CONSOLE_HISTORY = 50;
/** The most output bytes kept per block. */
export const CONSOLE_MAX_BYTES = 262144;

/**
 * @typedef {object} ConsoleChange
 * @property {'sending' | 'queued' | 'running' | 'ok' | 'failed' | 'refused' | 'cancelled' | 'lost'} [state]
 * @property {number} [code]  the exit code
 * @property {string} [output]  replaces the output
 * @property {string} [append]  adds to the output
 * @property {string} [error]  a refusal's what
 * @property {string} [remedy]  a refusal's what now
 */

/**
 * @typedef {object} ConsoleJob
 * @property {(handler: (change: ConsoleChange) => void) => void} update
 * @property {() => void} [cancel]
 */

/** @typedef {(command: string, context: string) => ConsoleJob | Promise<ConsoleJob>} ConsoleRun */

/**
 * @typedef {object} ConsoleBlock
 * @property {string} id
 * @property {string} command
 * @property {string} context
 * @property {ConsoleChange['state']} state
 * @property {number} [code]
 * @property {string} output
 * @property {string} [error]
 * @property {string} [remedy]
 * @property {number} startedAt
 * @property {number} [endedAt]
 * @property {boolean} collapsed
 * @property {boolean} [truncated]
 * @property {number} [total]
 */

/** @typedef {{ run: ConsoleRun | null, complete: ((prefix: string) => string[] | Promise<string[]>) | null, blocks: ConsoleBlock[], jobs: Map<string, ConsoleJob>, history: string[], at: number, draft: string, spec: { state?: string, message?: string }, context: { options: { value: string, label: string }[], value: string, state: string, label: string }, card: import('./busy-card.js').BusyCard | null, tick: number, pending: string | null, pendingTimer: number, off: (() => void)[], showAll: boolean, said: string }} ConsoleState */
/** @type {WeakMap<Element, ConsoleState>} */
const STATE = new WeakMap();
let serial = 0;

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
const attr = (root, name, fallback) => root.getAttribute(`data-kp-console-${name}`) ?? fallback;

/** @param {HTMLElement} root @returns {ConsoleState} */
function stateOf(root) {
    let st = STATE.get(root);
    if (!st) {
        st = {
            run: null,
            complete: null,
            blocks: [],
            jobs: new Map(),
            history: [],
            at: -1,
            draft: '',
            spec: {},
            context: { options: [], value: '', state: 'ready', label: '' },
            card: null,
            tick: 0,
            pending: null,
            pendingTimer: 0,
            off: [],
            showAll: false,
            said: '',
        };
        STATE.set(root, st);
    }
    return st;
}

/** Whether a line is one the app wants confirmed. @param {HTMLElement} root @param {string} command */
function needsConfirm(root, command) {
    const raw = attr(root, 'confirm', '');
    if (!raw) return false;
    const re = raw.startsWith('/') && raw.lastIndexOf('/') > 0 ? raw.slice(1, raw.lastIndexOf('/')) : null;
    if (re) {
        try {
            return new RegExp(re).test(command);
        } catch {
            return false;
        }
    }
    return raw
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean)
        .some((w) => command.includes(w));
}

/** @param {number} ms */
function elapsed(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    if (total < 60) return `${total} s`;
    const m = Math.floor(total / 60);
    return `${m} min ${total % 60} s`;
}

/** @param {HTMLElement} root @param {string} message */
function say(root, message) {
    if (root.getAttribute('data-kp-announce') === 'off') return;
    let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-console__live'));
    if (!region) {
        region = el('kp-sr-only kp-console__live', 'span');
        region.setAttribute('role', 'status');
        root.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

/** @param {HTMLElement} root @returns {string | null} the key history is kept under, when it is kept */
function storeKey(root) {
    const name = root.getAttribute('data-kp-remember') ?? root.getAttribute('data-kp-name');
    const mode = attr(root, 'remember', 'session');
    if (!name || mode === 'off') return null;
    return `kp-remember:console:${name}:history`;
}

/** @param {HTMLElement} root @returns {Storage | null} */
function storeOf(root) {
    try {
        return attr(root, 'remember', 'session') === 'device' ? localStorage : sessionStorage;
    } catch {
        return null;
    }
}

/** @param {HTMLElement} root */
function loadHistory(root) {
    const key = storeKey(root);
    const store = storeOf(root);
    if (!key || !store) return [];
    try {
        const raw = JSON.parse(store.getItem(key) ?? '[]');
        return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').slice(-(Number(attr(root, 'history', String(CONSOLE_HISTORY))) || CONSOLE_HISTORY)) : [];
    } catch {
        return [];
    }
}

/** @param {HTMLElement} root */
function saveHistory(root) {
    const key = storeKey(root);
    const store = storeOf(root);
    if (!key || !store) return;
    try {
        store.setItem(key, JSON.stringify(stateOf(root).history));
    } catch {
        // Storage full or refused: the recall lasts for this page.
    }
}

/** @param {HTMLElement} root */
function ensureParts(root) {
    if (root.querySelector(':scope > .kp-console__stage, :scope > .kp-console__bar')) return;
    root.classList.add('kp-console');
    serial += 1;
    const s = getStrings();
    const full = attr(root, 'mode', 'full') !== 'bar';
    const stage = el('kp-console__stage');
    const body = el('kp-console__body');
    body.setAttribute('data-kp-follow', attr(root, 'order', 'newest-last') === 'newest-first' ? 'head' : 'tail');
    body.setAttribute('data-kp-pill-unit', s.consoleUnit);
    body.setAttribute('tabindex', '0');
    body.setAttribute('role', 'log');
    body.setAttribute('aria-live', 'off');
    body.setAttribute('aria-label', s.consoleOutputLabel);
    stage.append(body);
    const bar = el('kp-console__bar');
    const form = /** @type {HTMLFormElement} */ (el('kp-console__form', 'form'));
    form.noValidate = true;
    const context = el('kp-console__context-wrap');
    const select = /** @type {HTMLSelectElement} */ (el('kp-field__input kp-console__context', 'select'));
    select.id = `kp-console-${serial}-context`;
    const contextLabel = el('kp-console__context-label', 'label');
    contextLabel.setAttribute('for', select.id);
    context.append(contextLabel, select);
    const line = el('kp-console__line');
    const prompt = el('kp-console__prompt', 'span');
    prompt.setAttribute('aria-hidden', 'true');
    const input = /** @type {HTMLInputElement} */ (el('kp-field__input kp-console__input', 'input'));
    input.type = 'text';
    input.id = `kp-console-${serial}-input`;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('enterkeyhint', 'send');
    const run = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--primary kp-console__run', 'button'));
    run.type = 'submit';
    line.append(prompt, input, run);
    const hint = el('kp-console__hint', 'p');
    hint.id = `kp-console-${serial}-hint`;
    const complete = el('kp-console__complete');
    complete.hidden = true;
    form.append(context, line, complete, hint);
    bar.append(form);
    if (full) {
        if (attr(root, 'order', 'newest-last') === 'newest-first') root.append(bar, stage);
        else root.append(stage, bar);
    } else root.append(bar);
    input.setAttribute('aria-describedby', hint.id);
}

/** Write the words and the state of the bar. @param {HTMLElement} root */
function drawBar(root) {
    const st = stateOf(root);
    const s = getStrings();
    const input = /** @type {HTMLInputElement} */ (root.querySelector('.kp-console__input'));
    const run = /** @type {HTMLButtonElement} */ (root.querySelector('.kp-console__run'));
    const prompt = /** @type {HTMLElement} */ (root.querySelector('.kp-console__prompt'));
    const hint = /** @type {HTMLElement} */ (root.querySelector('.kp-console__hint'));
    const contextWrap = /** @type {HTMLElement} */ (root.querySelector('.kp-console__context-wrap'));
    const select = /** @type {HTMLSelectElement} */ (root.querySelector('.kp-console__context'));
    const label = /** @type {HTMLElement} */ (root.querySelector('.kp-console__context-label'));
    prompt.textContent = attr(root, 'prompt', '#');
    input.setAttribute('aria-label', root.getAttribute('data-kp-label') ?? s.consoleCommand);
    const state = st.spec.state ?? root.getAttribute('data-kp-state') ?? 'ready';
    const reason = root.getAttribute('data-kp-disabled-reason');
    const off = root.hasAttribute('disabled') || root.hasAttribute('data-kp-disabled');
    const contextLoading = attr(root, 'context', 'none') === 'select' && st.context.state === 'loading';
    const blocked = off || state === 'loading' || state === 'error' || contextLoading;
    const why = state === 'error' ? s.consoleHostFailed : off ? (reason ?? s.consoleOff) : contextLoading ? s.consoleContextLoadingWhy : '';
    input.disabled = blocked;
    run.disabled = blocked;
    run.setAttribute('aria-disabled', String(blocked));
    if (blocked && why) {
        input.setAttribute('data-kp-disabled-reason', why);
        run.setAttribute('data-kp-disabled-reason', why);
    } else {
        input.removeAttribute('data-kp-disabled-reason');
        run.removeAttribute('data-kp-disabled-reason');
    }
    if (st.pending === null) run.textContent = s.consoleRun;
    else run.textContent = s.consoleRunAnyway;
    // The hint keeps its line: the app's sentence, or the reason while blocked.
    hint.textContent = blocked && why ? why : (attr(root, 'hint', '') || s.consoleHint);
    hint.toggleAttribute('data-kp-console-why', blocked && Boolean(why));
    // The context select.
    const wantsContext = attr(root, 'context', 'none') === 'select';
    contextWrap.hidden = !wantsContext;
    if (wantsContext) {
        label.textContent = st.context.label || s.consoleContext;
        select.replaceChildren();
        if (st.context.state === 'loading') {
            const o = document.createElement('option');
            o.textContent = s.consoleContextLoading;
            select.append(o);
            select.disabled = true;
        } else {
            for (const opt of st.context.options) {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                select.append(o);
            }
            select.value = st.context.value;
            select.disabled = blocked || st.context.options.length === 0;
        }
    }
}

/** The status words of a block. @param {HTMLElement} root @param {ConsoleBlock} b */
function statusOf(root, b) {
    const s = getStrings();
    const exit = attr(root, 'status', 'exit-code') === 'exit-code';
    switch (b.state) {
        case 'sending':
            return { glyph: 'wait', text: s.consoleSending };
        case 'queued':
            return { glyph: 'wait', text: s.consoleQueued };
        case 'running':
            return { glyph: 'run', text: attr(root, 'timer', 'true') === 'false' ? s.consoleRunning : s.consoleRunningFor(elapsed(Date.now() - b.startedAt)) };
        case 'ok':
            return { glyph: 'ok', text: exit ? s.consoleExit(b.code ?? 0) : s.consoleDone, extra: exit ? s.consoleDone : '' };
        case 'failed':
            return { glyph: 'fail', text: exit ? s.consoleExit(b.code ?? 1) : s.consoleFailed, extra: exit ? s.consoleFailed : '' };
        case 'refused':
            return { glyph: 'fail', text: s.consoleRefused };
        case 'cancelled':
            return { glyph: 'stop', text: s.consoleCancelled };
        default:
            return { glyph: 'lost', text: s.consoleLost };
    }
}

/** Build or update one block. @param {HTMLElement} root @param {ConsoleBlock} b @param {HTMLElement | null} node */
function blockNode(root, b, node) {
    const s = getStrings();
    const st = stateOf(root);
    const isNew = !node;
    if (!node) {
        node = el('kp-console__block', 'section');
        node.setAttribute('data-id', b.id);
        const head = el('kp-console__block-head');
        const status = el('kp-console__status');
        const glyph = el('kp-console__glyph', 'span');
        glyph.setAttribute('aria-hidden', 'true');
        const word = el('kp-console__status-word', 'span');
        status.append(glyph, word);
        const cmd = el('kp-console__command', 'code');
        const tools = el('kp-console__tools');
        head.append(cmd, status, tools);
        const out = el('kp-code kp-console__output', 'figure');
        const problem = el('kp-console__problem');
        problem.hidden = true;
        node.append(head, problem, out);
    }
    node.setAttribute('data-kp-state', b.state ?? 'sending');
    node.toggleAttribute('aria-busy', b.state === 'running' || b.state === 'sending' || b.state === 'queued');
    node.toggleAttribute('data-kp-console-collapsed', b.collapsed);
    const cmd = /** @type {HTMLElement} */ (node.querySelector('.kp-console__command'));
    const promptWord = attr(root, 'prompt', '#');
    const label = `${promptWord} ${b.command}`;
    if (cmd.getAttribute('data-for') !== label) {
        cmd.setAttribute('data-for', label);
        cmd.replaceChildren();
        const p = el('kp-console__command-prompt', 'span');
        p.textContent = promptWord;
        p.setAttribute('aria-hidden', 'true');
        p.setAttribute('data-kp-console-nocopy', '');
        const text = el('kp-console__command-text', 'span');
        text.textContent = b.command;
        cmd.append(p, text);
    }
    const info = statusOf(root, b);
    const status = /** @type {HTMLElement} */ (node.querySelector('.kp-console__status'));
    status.setAttribute('data-kp-status', info.glyph);
    const glyph = /** @type {HTMLElement} */ (status.querySelector('.kp-console__glyph'));
    if (info.glyph === 'run' || info.glyph === 'wait') {
        if (!glyph.querySelector('.kp-spinner')) glyph.replaceChildren(el('kp-spinner', 'span'));
    } else glyph.replaceChildren();
    /** @type {HTMLElement} */ (status.querySelector('.kp-console__status-word')).textContent = info.text;
    // The tools.
    const tools = /** @type {HTMLElement} */ (node.querySelector('.kp-console__tools'));
    /** @type {[string, string, boolean][]} */
    const wanted = [
        ['copy-command', s.consoleCopyCommand, true],
        ['copy-output', s.consoleCopyOutput, b.output !== ''],
        ['again', s.consoleAgain, b.state !== 'running' && b.state !== 'sending' && b.state !== 'queued'],
        ['recheck', s.consoleRecheck, b.state === 'lost'],
        ['cancel', s.consoleCancel, attr(root, 'cancel', 'false') !== 'false' && root.hasAttribute('data-kp-console-cancel') && (b.state === 'running' || b.state === 'queued') && typeof st.jobs.get(b.id)?.cancel === 'function'],
        ['collapse', b.collapsed ? s.consoleExpand : s.consoleCollapse, true],
    ];
    for (const [key, text, on] of wanted) {
        let b_ = /** @type {HTMLButtonElement | null} */ (tools.querySelector(`[data-kp-console-tool="${key}"]`));
        if (!b_) {
            b_ = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-console__tool', 'button'));
            b_.type = 'button';
            b_.setAttribute('data-kp-console-tool', key);
            if (key.startsWith('copy')) b_.setAttribute('data-kp-flash-words', `${s.consoleCopied},${s.consoleNotCopied}`);
            tools.append(b_);
        }
        if (b_.textContent !== text) b_.textContent = text;
        // The same tool stands in the same place in every block and every state: one that does not apply is kept, unseen and
        // out of reach, so nothing slides along when a block changes state.
        b_.toggleAttribute('data-kp-console-off', !on);
        b_.disabled = !on;
        b_.tabIndex = on ? 0 : -1;
        if (on) b_.removeAttribute('aria-hidden');
        else b_.setAttribute('aria-hidden', 'true');
        if (key === 'collapse') b_.setAttribute('aria-expanded', String(!b.collapsed));
    }
    // A refusal in what / why / what now.
    const problem = /** @type {HTMLElement} */ (node.querySelector('.kp-console__problem'));
    const showProblem = b.state === 'refused' || b.state === 'lost';
    problem.hidden = !showProblem;
    if (showProblem) {
        problem.className = `kp-console__problem kp-alert ${b.state === 'lost' ? 'kp-alert--warning' : 'kp-alert--destructive'}`;
        problem.setAttribute('role', 'alert');
        problem.replaceChildren();
        const what = el('kp-console__problem-what', 'strong');
        what.textContent = b.state === 'lost' ? s.consoleLostWhat : (b.error ?? s.consoleRefusedWhat);
        problem.append(what);
        const now = b.state === 'lost' ? s.consoleLostNow : b.remedy;
        if (now) {
            const p = el('kp-console__problem-now', 'span');
            p.textContent = now;
            problem.append(p);
        }
    }
    // The output.
    const out = /** @type {HTMLElement} */ (node.querySelector('.kp-console__output'));
    const wantsOutput = !b.collapsed && b.state !== 'sending' && b.state !== 'refused';
    out.hidden = !wantsOutput;
    if (wantsOutput) {
        const maxLines = Number(attr(root, 'max-lines', '12')) || 12;
        if (b.output === '' && b.state !== 'running' && b.state !== 'queued') {
            out.className = 'kp-console__output kp-console__nooutput';
            out.removeAttribute('data-kp-console-drawn');
            out.textContent = b.state === 'lost' || b.state === 'cancelled' ? '' : s.consoleNoOutput;
            out.hidden = out.textContent === '';
        } else if (b.output !== '') {
            if (out.classList.contains('kp-console__nooutput')) {
                out.className = 'kp-code kp-console__output';
                out.textContent = '';
            }
            const shown = b.output;
            if (out.getAttribute('data-kp-console-drawn') !== `${shown.length}:${b.truncated}:${maxLines}`) {
                out.setAttribute('data-kp-console-drawn', `${shown.length}:${b.truncated}:${maxLines}`);
                setCode(out, {
                    text: shown,
                    title: s.consoleOutput,
                    maxLines,
                    wrap: false,
                    ...(b.truncated ? { truncated: { shown: `${Math.round(shown.length / 1024)} KB`, total: `${Math.round((b.total ?? shown.length) / 1024)} KB` } } : {}),
                });
            }
        } else if (b.state === 'running' || b.state === 'queued') {
            out.className = 'kp-console__output kp-console__nooutput';
            out.textContent = b.state === 'queued' ? s.consoleQueued : s.consoleWaitingOutput;
        }
    }
    void isNew;
    return node;
}

/** Draw the body: the blocks, or the plate that stands in their place. @param {HTMLElement} root */
function drawBody(root) {
    const st = stateOf(root);
    const s = getStrings();
    const body = /** @type {HTMLElement | null} */ (root.querySelector('.kp-console__body'));
    if (!body) return;
    const state = st.spec.state ?? root.getAttribute('data-kp-state') ?? 'ready';
    root.setAttribute('data-kp-state', state);
    root.toggleAttribute('aria-busy', state === 'loading');
    if (st.card && state !== 'loading') {
        st.card.remove();
        st.card = null;
    }
    for (const stray of body.querySelectorAll(':scope > .kp-console__plate')) stray.remove();
    if (state === 'error') {
        for (const n of body.querySelectorAll(':scope > .kp-console__block, :scope > .kp-console__earlier')) n.remove();
        const plate = statePlate(document, {
            kind: 'error',
            title: st.spec.message ?? s.consoleHostFailed,
            text: s.consoleHostFailedText,
            actionLabel: s.consoleRetry,
            actionAttribute: 'data-kp-console-retry',
        });
        plate.classList.add('kp-console__plate');
        body.append(plate);
        return;
    }
    if (state === 'loading') {
        if (!st.card) st.card = openBusyCard(body, { words: s.consoleLoading, area: () => [body], className: 'kp-console__busy', arrive: false });
        return;
    }
    const blocks = st.blocks;
    const max = Math.max(1, Number(attr(root, 'max-blocks', '200')) || 200);
    const folded = st.showAll ? 0 : Math.max(0, blocks.length - max);
    const visible = blocks.slice(folded);
    // The "N earlier commands" line.
    let earlier = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-console__earlier'));
    if (folded > 0) {
        if (!earlier) {
            earlier = el('kp-console__earlier');
            const b = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm', 'button'));
            b.type = 'button';
            b.setAttribute('data-kp-console-earlier', '');
            earlier.append(b);
        }
        /** @type {HTMLElement} */ (earlier.firstElementChild).textContent = s.consoleEarlier(folded);
        if (earlier.parentElement !== body || body.firstElementChild !== earlier) body.prepend(earlier);
    } else earlier?.remove();
    /** @type {Map<string, HTMLElement>} */
    const nodes = new Map();
    for (const n of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll(':scope > .kp-console__block'))) nodes.set(n.getAttribute('data-id') ?? '', n);
    const newestFirst = attr(root, 'order', 'newest-last') === 'newest-first';
    const ordered = newestFirst ? [...visible].reverse() : visible;
    let anchor = /** @type {Element | null} */ (folded > 0 && !newestFirst ? earlier : null);
    for (const b of ordered) {
        const node = blockNode(root, b, nodes.get(b.id) ?? null);
        nodes.delete(b.id);
        if (node.parentElement !== body || (anchor ? anchor.nextElementSibling : body.firstElementChild) !== node) {
            if (anchor) anchor.after(node);
            else body.prepend(node);
        }
        anchor = node;
    }
    for (const gone of nodes.values()) gone.remove();
    // Nothing yet: the empty plate fills the body.
    if (blocks.length === 0) {
        const plate = statePlate(document, { kind: 'empty', title: s.consoleEmptyTitle, text: attr(root, 'hint', '') || s.consoleEmptyText });
        plate.classList.add('kp-console__plate');
        body.append(plate);
    }
    root.toggleAttribute('data-kp-console-empty', blocks.length === 0);
}

/** @param {HTMLElement} root */
function drawAll(root) {
    ensureParts(root);
    drawBar(root);
    drawBody(root);
}

/** Keep the clock of running blocks ticking and the status words fresh. @param {HTMLElement} root */
function startTicker(root) {
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
function follow(root, force = false) {
    const body = /** @type {HTMLElement | null} */ (root.querySelector('.kp-console__body'));
    if (!body || attr(root, 'follow', 'stick') === 'off') return;
    const handle = newPill(body);
    const head = body.getAttribute('data-kp-follow') === 'head';
    if (force || !handle || handle.following()) body.scrollTop = head ? 0 : body.scrollHeight;
}

/** @param {HTMLElement} root @param {string} id @param {ConsoleChange} change */
function applyChange(root, id, change) {
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
            say(root, b.state === 'ok' ? s.consoleFinishedOk(b.code ?? 0) : b.state === 'failed' ? s.consoleFinishedFailed(b.code ?? 1) : b.state === 'refused' ? s.consoleFinishedRefused : b.state === 'cancelled' ? s.consoleCancelled : s.consoleLost);
        }
    }
}

/** Run one command through the app's `run`. @param {HTMLElement} root @param {string} command @param {{ again?: boolean }} [options] @returns {Promise<boolean>} */
async function runCommand(root, command, { again = false } = {}) {
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
async function submit(root) {
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
async function useTool(root, tool, b, button) {
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

/**
 * Wire every console under `root`.
 * @param {ParentNode} [root]
 * @param {{ run?: ConsoleRun, complete?: (prefix: string) => string[] | Promise<string[]> }} [options]
 * @returns {() => void} detach
 */
export function attachConsoles(root = document, options = {}) {
    const roots = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(CONSOLE) ? [root] : []), ...root.querySelectorAll(CONSOLE)]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el_ of roots) {
        const st = stateOf(el_);
        if (st.off.length) continue;
        if (options.run) st.run = options.run;
        if (options.complete) st.complete = options.complete;
        st.history = loadHistory(el_);
        drawAll(el_);
        const body = /** @type {HTMLElement} */ (el_.querySelector('.kp-console__body'));
        const stopPill = body ? attachNewPills(body.parentElement ?? el_) : () => {};
        const stopReasons = attachDisabledReasons(el_);
        const form = /** @type {HTMLFormElement} */ (el_.querySelector('.kp-console__form'));
        const input = /** @type {HTMLInputElement} */ (el_.querySelector('.kp-console__input'));
        const select = /** @type {HTMLSelectElement} */ (el_.querySelector('.kp-console__context'));
        const complete = /** @type {HTMLElement} */ (el_.querySelector('.kp-console__complete'));
        /** @param {SubmitEvent} event */
        const onSubmit = (event) => {
            event.preventDefault();
            void submit(el_);
        };
        /** @param {KeyboardEvent} event */
        const onKey = async (event) => {
            if (event.isComposing) return;
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                if (st.history.length === 0) return;
                event.preventDefault();
                if (st.at === -1) st.draft = input.value;
                if (event.key === 'ArrowUp') st.at = st.at === -1 ? st.history.length - 1 : Math.max(0, st.at - 1);
                else st.at = st.at === -1 ? -1 : st.at + 1 >= st.history.length ? -1 : st.at + 1;
                input.value = st.at === -1 ? st.draft : st.history[st.at];
                input.setSelectionRange(input.value.length, input.value.length);
            } else if (event.key === 'Escape') {
                if (!complete.hidden) {
                    complete.hidden = true;
                    return;
                }
                if (input.value !== '') {
                    event.preventDefault();
                    input.value = '';
                    st.at = -1;
                    st.pending = null;
                    drawBar(el_);
                }
            } else if (event.key === 'Tab' && attr(el_, 'tab', 'none') === 'complete' && st.complete && input.value.trim() !== '' && !event.shiftKey) {
                event.preventDefault();
                const found = await st.complete(input.value);
                if (found.length === 1) {
                    input.value = found[0];
                    complete.hidden = true;
                } else if (found.length > 1) {
                    complete.replaceChildren();
                    complete.setAttribute('role', 'group');
                    complete.setAttribute('aria-label', getStrings().consoleCompletions);
                    for (const f of found.slice(0, 12)) {
                        const b = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm', 'button'));
                        b.type = 'button';
                        b.setAttribute('data-kp-console-complete', f);
                        b.textContent = f;
                        complete.append(b);
                    }
                    complete.hidden = false;
                    say(el_, getStrings().consoleMatches(found.length));
                }
            } else if (st.pending !== null && event.key.length === 1) {
                st.pending = null;
                drawBar(el_);
            }
        };
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const t = event.target instanceof Element ? event.target : null;
            if (!t) return;
            const tool = /** @type {HTMLButtonElement | null} */ (t.closest('[data-kp-console-tool]'));
            if (tool) {
                const block = t.closest('.kp-console__block');
                const b = st.blocks.find((x) => x.id === block?.getAttribute('data-id'));
                if (b) void useTool(el_, tool.getAttribute('data-kp-console-tool') ?? '', b, tool);
                return;
            }
            const pickC = t.closest('[data-kp-console-complete]');
            if (pickC) {
                input.value = pickC.getAttribute('data-kp-console-complete') ?? '';
                complete.hidden = true;
                input.focus();
                return;
            }
            if (t.closest('[data-kp-console-retry]')) return void el_.dispatchEvent(new CustomEvent(CONSOLE_RETRY_EVENT, { bubbles: true }));
            if (t.closest('[data-kp-console-earlier]')) {
                st.showAll = true;
                drawBody(el_);
            }
        };
        const onContext = () => {
            st.context.value = select.value;
        };
        form.addEventListener('submit', onSubmit);
        input.addEventListener('keydown', onKey);
        el_.addEventListener('click', onClick);
        select.addEventListener('change', onContext);
        let order = attr(el_, 'order', 'newest-last');
        let stopPillNow = stopPill;
        const observer = new MutationObserver(() => {
            // Every option is live: change the attribute and the console is drawn again.
            const now = attr(el_, 'order', 'newest-last');
            if (now !== order) {
                order = now;
                const stage = /** @type {HTMLElement} */ (el_.querySelector(':scope > .kp-console__stage'));
                const barEl = /** @type {HTMLElement} */ (el_.querySelector(':scope > .kp-console__bar'));
                if (stage && barEl) {
                    if (now === 'newest-first') el_.prepend(barEl);
                    else el_.append(barEl);
                }
                stopPillNow();
                body.setAttribute('data-kp-follow', now === 'newest-first' ? 'head' : 'tail');
                stopPillNow = attachNewPills(body.parentElement ?? el_);
            }
            drawBar(el_);
            drawBody(el_);
            for (const b of st.blocks) {
                const node = el_.querySelector(`.kp-console__block[data-id="${CSS.escape(b.id)}"]`);
                if (node instanceof HTMLElement) blockNode(el_, b, node);
            }
        });
        observer.observe(el_, {
            attributes: true,
            attributeFilter: ['disabled', 'data-kp-disabled', 'data-kp-disabled-reason', ...['hint', 'prompt', 'order', 'status', 'timer', 'cancel', 'max-lines', 'max-blocks', 'context', 'confirm'].map((n) => `data-kp-console-${n}`)],
        });
        // The keys, through the engine: the clear key, and the one that jumps to the prompt from anywhere.
        const s = getStrings();
        /** @type {import('./shortcuts.js').Shortcut[]} */
        const keys = [{ keys: 'Mod L', what: s.consoleKeyClear, group: s.consoleKeyGroup, run: () => clearConsole(el_) }];
        const focusKey = attr(el_, 'focus-key', ':');
        if (focusKey !== 'false' && focusKey !== '') {
            keys.push({ keys: focusKey, what: s.consoleKeyFocus, group: s.consoleKeyGroup, when: () => !input.disabled, reason: s.consoleKeyFocusReason, run: () => input.focus() });
        }
        const stopKeys = registerShortcuts(el_, keys, { layoutGuard: 'off' });
        startTicker(el_);
        st.off = [
            () => form.removeEventListener('submit', onSubmit),
            () => input.removeEventListener('keydown', onKey),
            () => el_.removeEventListener('click', onClick),
            () => select.removeEventListener('change', onContext),
            () => observer.disconnect(),
            stopKeys,
            () => stopPillNow(),
            stopReasons,
            () => window.clearInterval(st.tick),
        ];
        undo.push(() => {
            for (const stop of st.off) stop();
            st.off = [];
        });
    }
    return () => undo.forEach((u) => u());
}
