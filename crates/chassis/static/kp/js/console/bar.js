// The parts of a console, its bar and its status line.
import { getStrings } from '../strings.js';
import { attr, el, elapsed, stateOf } from './model.js';
import { consoleState } from './state.js';
/** @typedef {import('./types.js').ConsoleBlock} ConsoleBlock */

/** @param {HTMLElement} root */
export function ensureParts(root) {
    if (root.querySelector(':scope > .kp-console__stage, :scope > .kp-console__bar')) return;
    root.classList.add('kp-console');
    consoleState.serial += 1;
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
    select.id = `kp-console-${consoleState.serial}-context`;
    const contextLabel = el('kp-console__context-label', 'label');
    contextLabel.setAttribute('for', select.id);
    context.append(contextLabel, select);
    const line = el('kp-console__line');
    const prompt = el('kp-console__prompt', 'span');
    prompt.setAttribute('aria-hidden', 'true');
    const input = /** @type {HTMLInputElement} */ (el('kp-field__input kp-console__input', 'input'));
    input.type = 'text';
    input.id = `kp-console-${consoleState.serial}-input`;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('enterkeyhint', 'send');
    const run = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--primary kp-console__run', 'button'));
    run.type = 'submit';
    line.append(prompt, input, run);
    const hint = el('kp-console__hint', 'p');
    hint.id = `kp-console-${consoleState.serial}-hint`;
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
export function drawBar(root) {
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
    // And it keeps the height it had when ready: the app's sentence may wrap to two lines on a phone where the reason is one, and
    // a failed or loading console is as high as the loaded one [laststates-1019].
    if (st.barState === 'ready') st.hintHeight = hint.offsetHeight;
    hint.textContent = blocked && why ? why : attr(root, 'hint', '') || s.consoleHint;
    hint.toggleAttribute('data-kp-console-why', blocked && Boolean(why));
    hint.style.minBlockSize = state !== 'ready' && st.hintHeight > 0 ? `${st.hintHeight}px` : '';
    st.barState = state;
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
export function statusOf(root, b) {
    const s = getStrings();
    const exit = attr(root, 'status', 'exit-code') === 'exit-code';
    switch (b.state) {
        case 'sending':
            return { glyph: 'wait', text: s.consoleSending };
        case 'queued':
            return { glyph: 'wait', text: s.consoleQueued };
        case 'running':
            return {
                glyph: 'run',
                text: attr(root, 'timer', 'true') === 'false' ? s.consoleRunning : s.consoleRunningFor(elapsed(Date.now() - b.startedAt)),
            };
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
