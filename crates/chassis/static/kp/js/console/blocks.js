// The blocks of output: one block, the body and the whole redraw.
import { getStrings } from '../strings.js';
import { setCode } from '../code.js';
import { statePlate } from '../state-plate.js';
import { openBusyCard } from '../busy-card.js';
import { drawBar, ensureParts, statusOf } from './bar.js';
import { attr, el, stateOf } from './model.js';
/** @typedef {import('./types.js').ConsoleBlock} ConsoleBlock */

/** Build or update one block. @param {HTMLElement} root @param {ConsoleBlock} b @param {HTMLElement | null} node */
export function blockNode(root, b, node) {
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
        [
            'cancel',
            s.consoleCancel,
            attr(root, 'cancel', 'false') !== 'false' &&
                root.hasAttribute('data-kp-console-cancel') &&
                (b.state === 'running' || b.state === 'queued') &&
                typeof st.jobs.get(b.id)?.cancel === 'function',
        ],
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
                    ...(b.truncated
                        ? {
                              truncated: {
                                  shown: `${Math.round(shown.length / 1024)} KB`,
                                  total: `${Math.round((b.total ?? shown.length) / 1024)} KB`,
                              },
                          }
                        : {}),
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
export function drawBody(root) {
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
    for (const n of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll(':scope > .kp-console__block')))
        nodes.set(n.getAttribute('data-id') ?? '', n);
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
export function drawAll(root) {
    ensureParts(root);
    drawBar(root);
    drawBody(root);
}
