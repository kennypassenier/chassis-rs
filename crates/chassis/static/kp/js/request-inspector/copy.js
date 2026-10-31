// Copying one request as curl, as JSON or its body, with the secrets masked unless the reader asked for them, and the
// word on the button and the voice saying so.

import { getStrings } from '../strings.js';
import { ITEM_REQUEST, REQUESTS_COPIED_MS, REQUESTS_COPY_EVENT, SECRET_HEADERS, toCurl, toJson } from './format.js';

/** @typedef {import('./format.js').Memory} Memory */

/** @param {HTMLElement} el @param {Memory} memory @param {HTMLButtonElement} button */
export async function copy(el, memory, button) {
    const strings = getStrings();
    const item = button.closest('.kp-inspector__item');
    const request = item ? ITEM_REQUEST.get(item) : undefined;
    if (!request) return;
    const options = memory.options;
    const real = button.hasAttribute('data-kp-requests-real') || options.secretsInCopy === 'real';
    const mask = !real;
    const which = button.dataset.kpRequestsCopy;
    const secretHeaders = options.secretHeaders ?? SECRET_HEADERS;
    const text =
        which === 'curl'
            ? toCurl(request, { mask, secretHeaders, origin: options.origin ?? '' })
            : which === 'json'
              ? toJson(request, { mask, secretHeaders })
              : (request.body ?? '');
    const word = /** @type {HTMLElement} */ (button.querySelector('.kp-code__word'));
    const idle = word.getAttribute('data-kp-code-words')?.split('\n')[0] ?? '';
    const view = el.ownerDocument.defaultView;
    try {
        await navigator.clipboard.writeText(text);
        word.textContent = strings.copied;
        const live = el.querySelector('.kp-inspector__live');
        if (live) {
            const named = which === 'curl' ? 'curl' : which === 'json' ? 'JSON' : strings.reqBody;
            live.textContent = [strings.reqCopyDone(named), mask && which !== 'body' ? strings.reqMaskedNote : ''].filter(Boolean).join(', ');
        }
        el.dispatchEvent(new CustomEvent(REQUESTS_COPY_EVENT, { bubbles: true, detail: { what: which, masked: mask && which !== 'body', text } }));
    } catch {
        word.textContent = strings.copyBlocked;
    }
    view?.setTimeout(() => (word.textContent = idle), REQUESTS_COPIED_MS);
}

