// The chassis pattern: POST (or another method), then show the answer.

import { attr } from './read.js';
import { FLASH_RELOAD_EVENT, RELOAD_DELAY_MS } from './values.js';

/** @param {HTMLElement} button */
export async function post(button) {
    const url = button.getAttribute('data-kp-post') ?? '';
    const method = (button.getAttribute('data-kp-method') ?? 'POST').toUpperCase();
    const body = button.getAttribute('data-kp-post-body');
    const response = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        ...(body ? { body } : {}),
    });
    /** @type {any} */
    let json = null;
    try {
        json = await response.clone().json();
    } catch {
        // No JSON body: the status text is the answer.
    }
    if (!response.ok) return { error: json?.error ?? (response.statusText || `HTTP ${response.status}`), remedy: json?.remedy };
    const reload = attr(button, 'data-kp-reload', 'none');
    if (reload === 'page') window.setTimeout(() => location.reload(), RELOAD_DELAY_MS);
    else if (reload === 'region')
        button.dispatchEvent(
            new CustomEvent(FLASH_RELOAD_EVENT, { bubbles: true, detail: { target: button.getAttribute('data-kp-reload-target') } }),
        );
    return typeof json?.message === 'string' ? { line: json.message } : undefined;
}
