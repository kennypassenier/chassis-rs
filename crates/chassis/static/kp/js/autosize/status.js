// The states of a box: `loading` lays the busy card over it inside a frame, `error` writes the sentence in the field's error line.

import { openBusyCard } from '../busy-card.js';
import { nextErrorNumber } from './state.js';

/** Make the frame that a busy card needs, around the box. @param {import('./controller.js').AutosizeController} c */
function framed(c) {
    if (c.frame) return c.frame;
    const frame = c.area.ownerDocument.createElement('div');
    frame.className = 'kp-autosize__frame';
    c.area.before(frame);
    frame.append(c.area);
    c.frame = frame;
    return frame;
}

/** Take the busy card's frame away again. @param {import('./controller.js').AutosizeController} c */
export function unframe(c) {
    if (!c.frame) return;
    c.frame.replaceWith(c.area);
    c.frame = null;
}

/** The field's error line, made after the counter, the frame or the box when there is none yet. @param {import('./controller.js').AutosizeController} c @param {Element | null} field */
function errorLine(c, field) {
    let holder = /** @type {HTMLElement | null} */ (field?.querySelector('[data-kp-field-error]') ?? null);
    if (!holder) {
        holder = c.area.ownerDocument.createElement('p');
        holder.className = 'kp-field__error';
        holder.setAttribute('data-kp-field-error', '');
        holder.id = `kp-autosize-${nextErrorNumber()}-error`;
        (c.counter.counter ?? c.frame ?? c.area).after(holder);
    }
    return holder;
}

/** Leave `loading`: the box takes its read-only back, and the card closes before the frame goes. @param {import('./controller.js').AutosizeController} c */
function leaveLoading(c) {
    c.area.readOnly = c.wasReadOnly;
    c.area.removeAttribute('aria-busy');
    const closing = c.card;
    c.card = null;
    void closing?.close().then(() => {
        if (c.state !== 'loading') unframe(c);
    });
}

/** Enter `loading`: the box is read-only and the busy card lies over it. @param {import('./controller.js').AutosizeController} c */
function enterLoading(c) {
    c.wasReadOnly = c.area.readOnly;
    c.area.readOnly = true;
    c.area.setAttribute('aria-busy', 'true');
    c.card ??= openBusyCard(framed(c), { words: c.strings.autosizeLoading, area: () => [c.area], className: 'kp-autosize__busy' });
}

/** Show the failure: the sentence in the error line, the box invalid and described by it. @param {import('./controller.js').AutosizeController} c @param {Element | null} field @param {string | undefined} message */
function showError(c, field, message) {
    const holder = errorLine(c, field);
    holder.textContent = message ?? c.strings.autosizeFailed;
    holder.hidden = false;
    c.area.setAttribute('aria-invalid', 'true');
    const described = (c.area.getAttribute('aria-describedby') ?? '').split(/\s+/);
    c.area.setAttribute('aria-describedby', [...new Set([...described, holder.id].filter(Boolean))].join(' '));
    field?.classList.add('kp-field--invalid');
}

/** Take the failure away when the box was in `error`. @param {import('./controller.js').AutosizeController} c @param {Element | null} field */
function clearError(c, field) {
    const holder = /** @type {HTMLElement | null} */ (field?.querySelector('[data-kp-field-error]') ?? null);
    if (holder && c.state === 'error') {
        holder.hidden = true;
        holder.textContent = '';
        c.area.removeAttribute('aria-invalid');
        field?.classList.remove('kp-field--invalid');
    }
}

/**
 * Put a box in a state.
 * @param {import('./controller.js').AutosizeController} c
 * @param {'ready' | 'loading' | 'error'} next
 * @param {string} [message]
 */
export function applyState(c, next, message) {
    if (next === c.state && next !== 'error') return;
    const field = c.area.closest('.kp-field');
    if (c.state === 'loading' && next !== 'loading') leaveLoading(c);
    if (next === 'loading') enterLoading(c);
    if (next === 'error') showError(c, field, message);
    else clearError(c, field);
    c.state = next;
    c.area.setAttribute('data-kp-state', next);
    c.measure();
}
