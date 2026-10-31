// The words of a sentence form: names, the computed fields, the summary, the invalid marks, the line under it and a
// field's loading state, plus reading what a named control holds. Pure DOM helpers; the wiring is in controller.js.

import { getStrings } from '../strings.js';
import { weekdays } from '../weekdays.js';

/** A sentence form. */
export const SENTENCE = '[data-kp-sentence]';
/** Fired on the sentence, bubbling, after a change, once things have settled: `{ summary }`. */
export const SENTENCE_EVENT = 'kp-sentence-change';

/** The line under each attached sentence; the setters below write it only while the sentence is attached. @type {WeakMap<Element, HTMLElement>} */
export const LINES = new WeakMap();

/** The controls a hidden phrase takes out of reach. */
export const CONTROLS = 'input, select, textarea, button, [role="combobox"]';

/** @param {string} text */
const tidy = (text) =>
    text
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        .trim();

/** @param {Element} control @returns {string} */
export function nameOf(control) {
    const label = control.getAttribute('aria-label');
    if (label) return label;
    const by = control.getAttribute('aria-labelledby');
    if (by)
        return tidy(
            by
                .split(/\s+/)
                .map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '')
                .join(' '),
        );
    return '';
}

/**
 * What a computed field shows, in words: its text, or "(Ready at)" while it has none.
 * @param {Element} output a `[data-kp-sentence-computed]` element
 * @returns {string}
 */
function computedText(output) {
    return output.hasAttribute('data-kp-sentence-empty') ? getStrings().sentenceEmpty(nameOf(output)) : (output.textContent?.trim() ?? '');
}

/** What a computed field draws when it has nothing to say. */
const COMPUTED_NONE = '\u2014';

/**
 * Write the text of a computed field (`[data-kp-sentence-computed="<name>"]`); null, undefined or '' draws a dash.
 * @param {Element} element a `.kp-sentence`
 * @param {string} name the field's `data-kp-sentence-computed`
 * @param {string | number | null | undefined} text
 */
export function setSentenceComputed(element, name, text) {
    const value = text === null || text === undefined ? '' : String(text).trim();
    for (const output of element.querySelectorAll('[data-kp-sentence-computed]')) {
        if (output.getAttribute('data-kp-sentence-computed') !== name) continue;
        output.toggleAttribute('data-kp-sentence-empty', value === '');
        const shown = value === '' ? COMPUTED_NONE : value;
        if (output.textContent !== shown) output.textContent = shown;
        output.setAttribute('aria-live', 'off');
    }
}

/**
 * What a field shows, in words.
 * @param {Element} field a `.kp-sentence__field`
 * @returns {string}
 */
function fieldText(field) {
    const s = getStrings();
    const computed = field.querySelector('[data-kp-sentence-computed]');
    if (computed) return computedText(computed);
    const picker = field.querySelector('.kp-weekdays');
    if (picker) return weekdays(picker)?.summary() ?? '';
    const select = field.querySelector('select');
    if (select instanceof HTMLSelectElement) return select.selectedOptions[0]?.textContent?.trim() || s.sentenceEmpty(nameOf(select));
    const input = field.querySelector('input:not([type="hidden"]), textarea');
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        if (input instanceof HTMLInputElement && (input.type === 'checkbox' || input.type === 'radio')) return input.checked ? nameOf(input) : '';
        return input.value.trim() || s.sentenceEmpty(nameOf(input));
    }
    return field.textContent?.trim() ?? '';
}

/**
 * The sentence in words as it stands now: the text, with each field replaced by what it shows and each hidden phrase left out.
 * @param {Element} element a `.kp-sentence`
 * @returns {string}
 */
export function sentenceSummary(element) {
    /** @param {Node} node @returns {string} */
    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
        if (!(node instanceof HTMLElement) || node.hidden) return '';
        if (node.classList.contains('kp-sentence__field')) return ` ${fieldText(node)} `;
        if (node.hasAttribute('data-kp-sentence-computed')) return ` ${computedText(node)} `;
        if (node.classList.contains('kp-sr-only') || node.matches('script, style, [data-kp-sentence-skip]')) return '';
        return [...node.childNodes].map(walk).join('');
    };
    const text = element.querySelector('.kp-sentence__text') ?? element;
    return tidy(walk(text));
}

/**
 * Mark a control invalid and write the line under the sentence that names it; `why` null clears the mark.
 * @param {Element} element a `.kp-sentence`
 * @param {string} name the control's `name`
 * @param {string | null} why
 */
export function setSentenceInvalid(element, name, why) {
    const control = [...element.querySelectorAll('[name]')].find((c) => c.getAttribute('name') === name);
    if (!control) return;
    const field = control.closest('.kp-sentence__field');
    const line = LINES.get(element);
    if (why === null) {
        control.removeAttribute('aria-invalid');
        control.removeAttribute('aria-describedby');
        field?.removeAttribute('data-kp-invalid');
        if (line && !element.querySelector('[aria-invalid="true"]')) setSentenceWhy(element, null);
        return;
    }
    control.setAttribute('aria-invalid', 'true');
    field?.setAttribute('data-kp-invalid', '');
    if (line) {
        control.setAttribute('aria-describedby', line.id);
        setSentenceWhy(element, getStrings().sentenceWhy(nameOf(control), why));
    }
}

/**
 * Write (or clear, with null) the line under the sentence.
 * @param {Element} element a `.kp-sentence` @param {string | null} text
 */
export function setSentenceWhy(element, text) {
    const line = LINES.get(element);
    if (!line) return;
    line.textContent = text ?? '';
    line.hidden = !text;
}

/**
 * Put a field in a state: `loading` shows its own skeleton at the width it had and switches its control off; `ready` brings it back.
 * @param {Element} field a `.kp-sentence__field`
 * @param {'loading' | 'ready'} state
 */
export function setSentenceFieldState(field, state) {
    if (!(field instanceof HTMLElement)) return;
    const doc = field.ownerDocument;
    const old = field.querySelector(':scope > .kp-sentence__skeleton');
    if (state === 'loading') {
        if (old) return;
        field.style.minInlineSize = `${field.getBoundingClientRect().width}px`;
        field.dataset.kpState = 'loading';
        field.setAttribute('aria-busy', 'true');
        const skeleton = doc.createElement('span');
        skeleton.className = 'kp-sentence__skeleton';
        skeleton.setAttribute('aria-hidden', 'true');
        const bar = doc.createElement('span');
        bar.className = 'kp-skeleton kp-skeleton--block kp-sentence__bar';
        skeleton.append(bar);
        field.append(skeleton);
        for (const c of field.querySelectorAll(CONTROLS)) {
            if (c instanceof HTMLElement && !c.hasAttribute('disabled')) {
                c.setAttribute('disabled', '');
                c.setAttribute('data-kp-was-enabled', '');
            }
        }
    } else {
        old?.remove();
        field.style.minInlineSize = '';
        delete field.dataset.kpState;
        field.removeAttribute('aria-busy');
        for (const c of field.querySelectorAll('[data-kp-was-enabled]')) {
            c.removeAttribute('disabled');
            c.removeAttribute('data-kp-was-enabled');
        }
    }
}

/** @param {Element} root @param {string} name @returns {string | null} what the control of that name holds */
export function valueOfControl(root, name) {
    const controls = [...root.querySelectorAll('[name]')].filter((c) => c.getAttribute('name') === name);
    const radios = controls.filter((c) => c instanceof HTMLInputElement && c.type === 'radio');
    if (radios.length)
        return /** @type {HTMLInputElement | undefined} */ (radios.find((r) => /** @type {HTMLInputElement} */ (r).checked))?.value ?? null;
    const c = controls[0];
    if (c instanceof HTMLInputElement && c.type === 'checkbox') return c.checked ? c.value || 'on' : null;
    if (c instanceof HTMLInputElement || c instanceof HTMLSelectElement || c instanceof HTMLTextAreaElement) return c.value;
    return null;
}

/** How many words before a field name it when the page gave it no name. */
const NAME_WORDS = 3;

/** @param {Element} c */
export const isButton = (c) => c instanceof HTMLInputElement && (c.type === 'button' || c.type === 'submit');

/** Disable a control a hidden phrase takes out of reach, and give it back when the phrase shows. @param {HTMLElement} c @param {boolean} show */
export function reach(c, show) {
    if (!show && !c.hasAttribute('disabled')) {
        c.setAttribute('disabled', '');
        c.setAttribute('data-kp-hidden-off', '');
    } else if (show && c.hasAttribute('data-kp-hidden-off')) {
        c.removeAttribute('disabled');
        c.removeAttribute('data-kp-hidden-off');
    }
}

/** The last few words of the text right before a field. @param {Element} field @returns {string[]} */
export function wordsBefore(field) {
    /** @type {string[]} */
    const before = [];
    for (let n = field.previousSibling; n && before.length < NAME_WORDS; n = n.previousSibling) {
        if (n.nodeType !== Node.TEXT_NODE) break;
        const words = (n.textContent ?? '').trim().split(/\s+/).filter(Boolean);
        before.unshift(...words.reverse().slice(0, NAME_WORDS - before.length).reverse());
    }
    return before;
}
