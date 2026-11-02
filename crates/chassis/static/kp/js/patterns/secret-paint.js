// Draws a secret display field's state: Reveal's words and marks, Copy, the mask, and the line under the buttons.
import { make } from './secret-parts.js';
/** @typedef {import('./secret-display.js').SecretControl} SecretControl */

/** Reveal's words for the state: Hide, Retry, Hold to show or Reveal. @param {SecretControl} c */
function label(c) {
    const s = c.s;
    return c.state === 'shown' ? s.secretHide : c.state === 'error' ? s.secretRetry : c.hold ? s.secretHold : s.secretReveal;
}

/** Draw the field's state; a value that is not shown is taken out of the page, not only covered. @param {SecretControl} c */
export function paintState(c) {
    const { host: field, parts, state } = c;
    const { reveal, copy, value } = parts;
    field.dataset.kpSecretState = state;
    const why = c.disabledWhy();
    reveal.textContent = label(c);
    reveal.disabled = why !== undefined || state === 'loading';
    reveal.setAttribute('aria-expanded', String(state === 'shown'));
    if (c.hold) reveal.setAttribute('aria-pressed', String(state === 'shown'));
    else reveal.removeAttribute('aria-pressed');
    if (copy) copy.disabled = why !== undefined;
    value.setAttribute('aria-busy', String(state === 'loading'));
    if (state === 'shown') return;
    field.removeAttribute('data-kp-secret-overflow');
    value.textContent = c.mask;
    value.classList.add('kp-masked');
    value.removeAttribute('tabindex');
}

/**
 * The words: why the field is off on the line under the buttons; reading and the countdown in the clock inside the value's box
 * [uxtouch1101], which keeps the field one height whatever it says. The room the clock takes is held free at the value's end
 * (`--kp-secret-clock`), so the value never runs under it.
 * @param {SecretControl} c
 */
export function writeLine(c) {
    const { s, parts } = c;
    const why = c.disabledWhy();
    if (why !== undefined) {
        c.host.dataset.kpSecretState = 'disabled';
        parts.words.textContent = why;
    } else if (c.state !== 'error') parts.words.textContent = '';
    if (why === undefined && c.state === 'loading') {
        const spinner = make(c.doc, 'span', 'kp-spinner kp-secret__spinner');
        spinner.setAttribute('aria-hidden', 'true');
        parts.clock.replaceChildren(spinner, c.doc.createTextNode(s.secretReading));
    } else if (why === undefined && c.state === 'shown') parts.clock.textContent = c.seconds === 0 ? s.secretStaysShown : c.paused ? s.secretPaused : s.secretHidesIn(c.left);
    else parts.clock.textContent = '';
    c.host.style.setProperty('--kp-secret-clock', `${parts.clock.textContent ? parts.clock.offsetWidth : 0}px`);
}
