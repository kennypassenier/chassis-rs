// The problem a code field shows: the page's error marked in the gutter, said under the field and held against the form, and the check that asks the page for it.

import { clearError, showError } from '../forms.js';
import { CodeFieldCore } from './core.js';
import { CODE_FIELD_CHECK_EVENT, CODE_FIELD_STATE_EVENT } from './values.js';

/** @typedef {{ line: number | null, column: number | null, message: string }} CodeFieldProblem */

export class CodeFieldProblems extends CodeFieldCore {
    /** @param {HTMLElement} host a `textarea[data-kp-code-field]` */
    constructor(host) {
        super(host);
        /** @type {CodeFieldProblem | null} */
        this.problem = null;
        const field = this.area.closest('.kp-field');
        this.field = field;
        /** The slot of a `.kp-field` that takes the sentence, when it has one. @type {HTMLElement | null} */
        this.holder = /** @type {HTMLElement | null} */ (field?.querySelector('[data-kp-field-error]') ?? null);
    }

    /** The sentence that names the problem, with the line and column it has. */
    sentence() {
        const { problem, strings } = this;
        if (!problem) return '';
        if (problem.line !== null && problem.column !== null) return strings.codeFieldError(problem.line, problem.column, problem.message);
        if (problem.line !== null) return strings.codeFieldErrorLine(problem.line, problem.message);
        return strings.codeFieldErrorPlain(problem.message);
    }

    /** Whether the problem is another than `before`. @param {CodeFieldProblem | null} before */
    changed(before) {
        const now = this.problem;
        return before?.message !== now?.message || before?.line !== now?.line || before?.column !== now?.column || (before === null) !== (now === null);
    }

    /** Mark the problem the page found; `null` takes it back. @param {number | null} line @param {number | null} [column] @param {string} [message] */
    setError(line, column = null, message = '') {
        const { area, ui } = this;
        const before = this.problem;
        if (line === null && !message) this.problem = null;
        else this.problem = { line, column: column ?? null, message };
        this.errorLine = this.problem?.line ?? 0;
        const broken = this.problem !== null;
        const sentence = this.sentence();
        ui.root.setAttribute('data-kp-json-state', broken ? 'invalid' : 'valid');
        area.setCustomValidity(broken && this.blocks() ? this.strings.codeFieldBlocked : '');
        if (this.holder) {
            ui.status.textContent = '';
            if (broken) showError(area, sentence);
            else clearError(area);
        } else {
            ui.status.textContent = sentence;
            if (broken) area.setAttribute('aria-invalid', 'true');
            else area.removeAttribute('aria-invalid');
        }
        this.field?.classList.toggle('kp-field--invalid', broken);
        this.drawGutter();
        if (this.changed(before)) {
            const { problem } = this;
            area.dispatchEvent(
                new CustomEvent(CODE_FIELD_STATE_EVENT, {
                    bubbles: true,
                    detail: { state: broken ? 'invalid' : 'ready', line: problem?.line ?? null, column: problem?.column ?? null, message: sentence },
                }),
            );
        }
    }

    /** Ask the page to check the text; it answers through `event.detail.error`. */
    check() {
        // The error of the text before is taken back; the handler, or a server answering later, says it again if it still holds.
        if (this.problem !== null) this.setError(null);
        this.area.dispatchEvent(
            new CustomEvent(CODE_FIELD_CHECK_EVENT, {
                bubbles: true,
                detail: {
                    value: this.area.value,
                    language: this.language(),
                    error: (/** @type {number} */ line, /** @type {number} */ column, /** @type {string} */ message) => this.setError(line, column, message),
                },
            }),
        );
    }
}
