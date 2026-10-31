// Checking the text: set the field's state (message, validity, event) and run the check with the page's `kp-json-validate` say.

import { clearError, showError } from '../forms.js';
import { JSON_STATE_EVENT, JSON_VALIDATE_EVENT } from './constants.js';
import { explainJson } from './explain.js';
import { drawGutter } from './layout.js';

/**
 * Put the field in a state: the line, the field's validity, the error slot, the marks, and the event when something changed.
 * @param {import('./controller.js').JsonFieldController} c
 * @param {'empty' | 'valid' | 'invalid' | 'text'} next
 * @param {string} message
 * @param {{ line?: number | null, column?: number | null, keys?: number | null }} [where]
 */
export function setState(c, next, message, where = {}) {
    const { area, strings, holder, field } = c;
    const { root, status } = c.parts;
    const changed = next !== c.state || status.textContent !== message;
    c.state = next;
    root.setAttribute('data-kp-json-state', next);
    c.errorLine = next === 'invalid' ? (where.line ?? 0) : 0;
    const broken = next === 'invalid';
    // The form is held back while the JSON is broken (a field that allows plain text is never broken).
    area.setCustomValidity(broken ? strings.jsonBlocked : '');
    if (holder) {
        status.textContent = broken ? '' : message;
        if (broken) showError(area, message);
        else clearError(area);
    } else {
        status.textContent = message;
        if (broken) area.setAttribute('aria-invalid', 'true');
        else area.removeAttribute('aria-invalid');
    }
    field?.classList.toggle('kp-field--invalid', broken);
    if (changed) {
        const detail = { state: next, line: where.line ?? null, column: where.column ?? null, message, keys: where.keys ?? null };
        area.dispatchEvent(new CustomEvent(JSON_STATE_EVENT, { bubbles: true, detail }));
    }
}

/** How many keys or items a valid value holds, in words. @param {import('./controller.js').JsonFieldController} c @param {unknown} value */
function countWords(c, value) {
    if (Array.isArray(value)) return c.strings.jsonValidItems(value.length);
    if (value && typeof value === 'object') return c.strings.jsonValidKeys(Object.keys(value).length);
    return c.strings.jsonValidValue;
}

/** The text parses: ask the page, and set valid or invalid. @param {import('./controller.js').JsonFieldController} c @param {unknown} value @param {string} text */
function acceptParsed(c, value, text) {
    const count = countWords(c, value);
    let refused = '';
    c.area.dispatchEvent(
        new CustomEvent(JSON_VALIDATE_EVENT, {
            bubbles: true,
            detail: { value, text, schema: c.schema, refuse: (/** @type {string} */ why) => (refused = why) },
        }),
    );
    if (refused) setState(c, 'invalid', c.strings.jsonSchemaFailed(refused), { line: null, column: null });
    else setState(c, 'valid', count, { keys: value && typeof value === 'object' ? Object.keys(value).length : null });
}

/** Check the text now, and draw the gutter. @param {import('./controller.js').JsonFieldController} c */
export function runCheck(c) {
    const strings = c.strings;
    const text = c.area.value;
    c.parsed = undefined;
    if (text.trim() === '') {
        if (c.area.required) setState(c, 'invalid', strings.jsonInvalidPlain(strings.jsonEmpty), { line: 1, column: 1 });
        else setState(c, 'empty', strings.jsonEmpty);
        drawGutter(c);
        return;
    }
    const result = explainJson(text);
    if (result.ok) {
        c.parsed = result.value;
        acceptParsed(c, result.value, text);
    } else if (c.modeOption() === 'allow-text') {
        setState(c, 'text', strings.jsonPlainText);
    } else {
        const message =
            result.line !== null && result.column !== null ? strings.jsonInvalid(result.line, result.column, result.why) : strings.jsonInvalidPlain(result.why);
        setState(c, 'invalid', message, { line: result.line, column: result.column });
    }
    drawGutter(c);
}
