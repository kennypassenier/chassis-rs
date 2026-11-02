// The markup of a question: its answers (text box, choices, "same as" buttons, skip) and the summary after the last one.
import { getStrings } from '../strings.js';
import { focusState } from './state.js';
import { el, stateOf } from './dom.js';
import { currentValue, opt, wordsOf } from './resume.js';
import { paintAnswerState } from './flow.js';
/** @typedef {import('./constants.js').FocusAnswer} FocusAnswer */
/** @typedef {import('./constants.js').FocusChoice} FocusChoice */
/** @typedef {import('./constants.js').FocusStep} FocusStep */

/**
 * Draw one question's answers under its text.
 * @param {HTMLElement} root @param {HTMLElement} holder @param {FocusStep} step @param {HTMLElement} text
 */
export function buildAnswer(root, holder, step, text) {
    const strings = getStrings();
    const answer = /** @type {FocusAnswer} */ (step.answer);
    const state = stateOf(root);
    const wrap = el('kp-focus-steps__answer');
    focusState.serial += 1;
    text.id = `kp-focus-steps-${focusState.serial}-question`;
    if (answer.kind === 'text') {
        const label = el('kp-sr-only', 'label');
        label.textContent = strings.focusTextLabel;
        const box = /** @type {HTMLTextAreaElement} */ (el('kp-field__input kp-focus-steps__input', 'textarea'));
        box.rows = 4;
        box.id = `kp-focus-steps-${focusState.serial}-input`;
        label.setAttribute('for', box.id);
        box.setAttribute('aria-labelledby', text.id);
        box.setAttribute('autocomplete', 'off');
        box.setAttribute('inputmode', 'text');
        if (answer.placeholder) box.placeholder = answer.placeholder;
        box.value = String(currentValue(root, answer) ?? '');
        box.addEventListener('input', () => {
            state.draft[answer.id] = box.value;
            if (state.answers[answer.id]) delete state.answers[answer.id];
            paintAnswerState(root);
        });
        wrap.append(label, box);
    } else {
        const pinned = (() => {
            try {
                const raw = JSON.parse(opt(root, 'pinned-first', '[]') ?? '[]');
                return Array.isArray(raw) ? /** @type {FocusChoice[]} */ (raw) : [];
            } catch {
                return /** @type {FocusChoice[]} */ ([]);
            }
        })();
        const choices = [...pinned.map((c) => ({ ...c, pinned: true })), ...(answer.choices ?? [])];
        const group = el('kp-focus-steps__choices');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', text.id);
        const wanted = opt(root, 'choice-layout', 'auto');
        const short = choices.length <= 3 && choices.every((c) => c.label.length <= 14);
        group.setAttribute('data-kp-layout', wanted === 'row' || wanted === 'stack' ? wanted : short ? 'row' : 'stack');
        if (answer.kind === 'multi') {
            const hint = el('kp-focus-steps__hint', 'p');
            hint.textContent = strings.focusMultiHint;
            wrap.append(hint);
        }
        for (const choice of choices) {
            const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--lg kp-focus-steps__choice', 'button'));
            button.type = 'button';
            button.dataset.kpValue = choice.value;
            button.setAttribute('aria-pressed', 'false');
            if ('pinned' in choice) button.setAttribute('data-kp-pinned', '');
            const mark = el('kp-focus-steps__mark', 'span');
            mark.setAttribute('aria-hidden', 'true');
            const label = el('kp-focus-steps__choice-label', 'span');
            label.textContent = choice.label;
            const said = el('kp-sr-only', 'span');
            said.textContent = `, ${strings.focusPickedMark}`;
            said.hidden = true;
            button.append(mark, label);
            if (choice.disabled) {
                button.setAttribute('aria-disabled', 'true');
                if (choice.reason) {
                    const reason = el('kp-focus-steps__reason', 'span');
                    reason.id = `kp-focus-steps-${focusState.serial}-${group.childElementCount}-why`;
                    reason.textContent = choice.reason;
                    button.setAttribute('aria-describedby', reason.id);
                    button.append(reason);
                }
            }
            group.append(button);
        }
        wrap.append(group);
        const sameMode = opt(root, 'same', 'both');
        if (sameMode !== 'off') {
            const same = el('kp-focus-steps__sames');
            /** @type {['yesterday' | 'usual', string | string[] | undefined][]} */
            const kinds = [
                ['yesterday', sameMode === 'usual' ? undefined : answer.previous],
                ['usual', sameMode === 'yesterday' ? undefined : answer.usual],
            ];
            for (const [which, value] of kinds) {
                if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
                const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-focus-steps__same', 'button'));
                button.type = 'button';
                button.dataset.kpSame = which;
                const words = wordsOf(answer, value);
                button.textContent = which === 'usual' ? strings.focusSameUsual(words) : strings.focusSameYesterday(words);
                same.append(button);
            }
            if (same.childElementCount > 0) wrap.append(same);
        }
    }
    if (opt(root, 'skip') !== 'off') {
        const skip = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-focus-steps__skip', 'button'));
        skip.type = 'button';
        skip.setAttribute('aria-pressed', 'false');
        skip.textContent = strings.focusSkip;
        wrap.append(skip);
    }
    holder.append(wrap);
}
/** The summary after the last question: each question and what was answered. @param {HTMLElement} root @param {HTMLElement} holder */
export function buildSummary(root, holder) {
    const strings = getStrings();
    const state = stateOf(root);
    const title = el('kp-focus-steps__text', 'p');
    title.textContent = strings.focusSummaryTitle;
    const list = el('kp-focus-steps__summary', 'dl');
    for (const step of state.steps) {
        if (!step.answer) continue;
        const given = state.answers[step.answer.id];
        const term = el('kp-focus-steps__summary-q', 'dt');
        term.textContent = step.text;
        const value = el('kp-focus-steps__summary-a', 'dd');
        value.textContent = !given ? '–' : given.source === 'skip' ? strings.focusSkipped : wordsOf(step.answer, given.value);
        list.append(term, value);
    }
    holder.append(title, list);
}
