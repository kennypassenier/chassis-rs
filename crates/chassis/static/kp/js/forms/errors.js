// Showing and clearing a field's message, and naming a field: showError, clearError and nameOf.

import { getStrings } from '../strings.js';
import { FIELD_ERROR } from './constants.js';
import { nextHolderNumber } from './state.js';

/** What the browser's own message becomes when the field says nothing better. */
export const fallback = () => getStrings().formInvalid;

/**
 * The name a summary line uses for a field: its label, its
 * `aria-label`, or as a last resort its name attribute.
 *
 * @param {HTMLElement} field
 */
export function nameOf(field) {
    // A radio's own label names one option; the legend names the
    // question, which is what somebody left unanswered.
    if (field.getAttribute('type') === 'radio') {
        const legend = field.closest('fieldset')?.querySelector('legend')?.textContent?.trim();
        if (legend !== undefined && legend !== '') return legend;
    }
    const id = field.getAttribute('id');
    const label = id === null ? null : field.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    const text = label?.textContent?.trim();
    if (text !== undefined && text !== '') return text;
    return field.getAttribute('aria-label') ?? field.getAttribute('name') ?? getStrings().fieldFallbackName;
}

/**
 * What carries the state for this control.
 *
 * For everything except a radio that is the control itself. A radio
 * belongs to a group, and `aria-invalid` on one button says the wrong
 * thing about the other three, so the group carries it.
 *
 * @param {HTMLElement} field
 * @returns {HTMLElement}
 */
export function stateHolder(field) {
    if (field.getAttribute('type') !== 'radio') return field;
    return /** @type {HTMLElement | null} */ (field.closest('[role="radiogroup"], fieldset')) ?? field;
}

/**
 * Show a message on a field — the browser's, or one the server found.
 *
 * @param {HTMLElement} field
 * @param {string} message
 * @param {{ wrapper?: string, invalidClass?: string }} [options]
 */
export function showError(field, message, { wrapper = '.kp-field', invalidClass = 'kp-field--invalid' } = {}) {
    const box = field.closest(wrapper);
    const holder = /** @type {HTMLElement | null} */ (box?.querySelector(FIELD_ERROR) ?? null);
    const marked = stateHolder(field);
    marked.setAttribute('aria-invalid', 'true');
    box?.classList.add(invalidClass);
    if (holder === null) return;
    if (holder.id === '') holder.id = `${field.getAttribute('id') ?? `kp-field-${nextHolderNumber()}`}-error`;
    holder.textContent = message;
    holder.hidden = false;
    // Appended rather than replaced: a field with help text keeps
    // it, and overwriting describedby is how help disappears the
    // first time someone gets something wrong.
    const described = (marked.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    if (!described.includes(holder.id)) marked.setAttribute('aria-describedby', [...described, holder.id].join(' '));
}

/**
 * Clear what showError put there.
 *
 * @param {HTMLElement} field
 * @param {{ wrapper?: string, invalidClass?: string }} [options]
 */
export function clearError(field, { wrapper = '.kp-field', invalidClass = 'kp-field--invalid' } = {}) {
    const box = field.closest(wrapper);
    const holder = /** @type {HTMLElement | null} */ (box?.querySelector(FIELD_ERROR) ?? null);
    const marked = stateHolder(field);
    marked.removeAttribute('aria-invalid');
    box?.classList.remove(invalidClass);
    if (holder === null) return;
    holder.hidden = true;
    holder.textContent = '';
    const described = (marked.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== holder.id);
    if (described.length > 0) marked.setAttribute('aria-describedby', described.join(' '));
    else marked.removeAttribute('aria-describedby');
}
