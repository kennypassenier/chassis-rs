// Builds the parts of a secret field where the markup has none: the value or the input, the buttons, and the line under them.
/** @typedef {import('../strings.js').Strings} Strings */

/** @param {Document} doc @param {string} tag @param {string} className */
export const make = (doc, tag, className) => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
};

/** A short random id suffix for a part the page gave none. */
const randomId = () => Math.random().toString(36).slice(2, 9);

/**
 * The line under the buttons (the countdown, the reason a field is off, or why it could not be read) with its words and drain,
 * and the polite region a screen reader hears. The line always has its height, so nothing moves when it fills.
 * @param {HTMLElement} field
 * @param {Element[]} built collects the parts made here, for detach
 */
export function buildLine(field, built) {
    const doc = field.ownerDocument;
    let line = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__line'));
    if (!line) {
        line = make(doc, 'p', 'kp-secret__line');
        field.append(line);
        built.push(line);
    }
    const words = make(doc, 'span', 'kp-secret__words');
    const drain = make(doc, 'span', 'kp-secret__drain');
    drain.setAttribute('aria-hidden', 'true');
    line.replaceChildren(words, drain);
    const spoken = make(doc, 'span', 'kp-sr-only kp-secret__live');
    spoken.setAttribute('role', 'status');
    spoken.setAttribute('aria-live', 'polite');
    field.append(spoken);
    built.push(spoken);
    return { line, words, drain, spoken };
}

/**
 * The actions box, after `before` when the markup has none.
 * @param {HTMLElement} field @param {Element} before @param {Element[]} built
 */
function actionsOf(field, before, built) {
    let actions = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__actions'));
    if (!actions) {
        actions = make(field.ownerDocument, 'div', 'kp-secret__actions');
        before.after(actions);
        built.push(actions);
    }
    return actions;
}

/**
 * A display field's parts: the value box with the mask, Reveal, Copy (unless `data-kp-secret-copy="false"`) and the line.
 * @param {HTMLElement} field @param {Strings} s @param {Element[]} built
 */
export function buildDisplay(field, s, built) {
    const doc = field.ownerDocument;
    let value = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__value'));
    if (!value) {
        value = make(doc, 'code', 'kp-secret__value');
        field.prepend(value);
        built.push(value);
    }
    const actions = actionsOf(field, value, built);
    let reveal = /** @type {HTMLButtonElement | null} */ (actions.querySelector('[data-kp-secret-reveal]'));
    if (!reveal) {
        reveal = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-secret__reveal'));
        reveal.type = 'button';
        reveal.setAttribute('data-kp-secret-reveal', '');
        actions.append(reveal);
        built.push(reveal);
    }
    let copy = /** @type {HTMLButtonElement | null} */ (actions.querySelector('[data-kp-secret-copy]'));
    if (!copy && field.dataset.kpSecretCopy !== 'false') {
        copy = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-copyable__button kp-secret__copy'));
        copy.type = 'button';
        copy.setAttribute('data-kp-secret-copy', '');
        copy.textContent = s.secretCopy;
        actions.append(copy);
        built.push(copy);
    }
    const parts = { value, reveal, copy, ...buildLine(field, built) };
    value.id ||= `kp-secret-${randomId()}`;
    reveal.setAttribute('aria-controls', value.id);
    return parts;
}

/**
 * The input's entry box and its input (an authored one is kept, and only given the package's look and type).
 * @param {HTMLElement} field @param {string} name the field's name, for an input with no label of its own @param {Element[]} built
 */
function buildEntry(field, name, built) {
    const doc = field.ownerDocument;
    let entry = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__entry'));
    if (!entry) {
        entry = make(doc, 'div', 'kp-secret__entry');
        field.prepend(entry);
        built.push(entry);
    }
    let input = /** @type {HTMLInputElement | null} */ (entry.querySelector('input'));
    const authored = input !== null;
    if (!input) {
        input = /** @type {HTMLInputElement} */ (make(doc, 'input', 'kp-field__input kp-secret__input'));
        entry.append(input);
    }
    input.classList.add('kp-secret__input');
    input.type = 'password';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    if (!input.hasAttribute('autocomplete')) input.setAttribute('autocomplete', field.dataset.kpSecretAutocomplete ?? 'off');
    if (!input.name && field.dataset.kpSecretName) input.name = field.dataset.kpSecretName;
    if (!input.placeholder && field.dataset.kpSecretPlaceholder) input.placeholder = field.dataset.kpSecretPlaceholder;
    if (!input.hasAttribute('aria-label') && !input.id) input.setAttribute('aria-label', name);
    return { entry, input, authored };
}

/**
 * An input field's parts: the entry and its input, Reveal, Paste and Copy (each off with `="false"`), and the line the input is
 * described by.
 * @param {HTMLElement} field @param {string} name @param {Element[]} built
 */
export function buildInput(field, name, built) {
    const { entry, input, authored } = buildEntry(field, name, built);
    const actions = actionsOf(field, entry, built);
    const button = (/** @type {string} */ className, /** @type {string} */ marker) => {
        const el = /** @type {HTMLButtonElement} */ (make(field.ownerDocument, 'button', className));
        el.type = 'button';
        el.setAttribute(marker, '');
        actions.append(el);
        return el;
    };
    const reveal = button('kp-button kp-secret__reveal', 'data-kp-secret-reveal');
    const paste = field.dataset.kpSecretPaste === 'false' ? null : button('kp-button kp-secret__paste', 'data-kp-secret-paste-button');
    const copy = field.dataset.kpSecretCopy === 'false' ? null : button('kp-button kp-copyable__button kp-secret__copy', 'data-kp-secret-copy');
    for (const part of [reveal, paste, copy]) if (part) built.push(part);
    const parts = { input, authored, reveal, paste, copy, ...buildLine(field, built) };
    parts.line.id ||= `kp-secret-line-${randomId()}`;
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), parts.line.id].filter(Boolean).join(' '));
    input.id ||= `kp-secret-input-${randomId()}`;
    reveal.setAttribute('aria-controls', input.id);
    return parts;
}
