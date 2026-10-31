// The tool buttons: Format, Minify, Wrap and Copy, and the lock that stills them while the field is disabled or read-only.

import { JSON_COPIED_MS } from './constants.js';
import { drawGutter, grow } from './layout.js';

/** Copy the text to the clipboard and say so on the button for a moment. @param {import('./controller.js').JsonFieldController} c */
async function copyText(c) {
    const { word } = c.parts;
    c.view?.clearTimeout(c.copyTimer);
    try {
        await navigator.clipboard.writeText(c.area.value);
        word.textContent = c.strings.copied;
    } catch {
        word.textContent = c.strings.copyBlocked;
    }
    c.copyTimer = c.view?.setTimeout(() => (word.textContent = c.strings.jsonCopy), JSON_COPIED_MS);
}

/** Flip the wrap and redraw. @param {import('./controller.js').JsonFieldController} c @param {HTMLButtonElement} button */
function toggleWrap(c, button) {
    c.wrap = !c.wrap;
    c.parts.root.setAttribute('data-kp-json-wrap', String(c.wrap));
    button.setAttribute('aria-pressed', String(c.wrap));
    drawGutter(c);
    grow(c);
}

/**
 * A press inside the tools.
 * @param {import('./controller.js').JsonFieldController} c
 * @param {MouseEvent} event
 */
export async function handleTool(c, event) {
    const button = event.target instanceof Element ? /** @type {HTMLButtonElement | null} */ (event.target.closest('[data-kp-json-tool]')) : null;
    if (!button || button.disabled) return;
    const which = button.dataset.kpJsonTool;
    if (which === 'format') c.format();
    else if (which === 'minify') c.minify();
    else if (which === 'wrap') toggleWrap(c, button);
    else if (which === 'copy') await copyText(c);
}

/** Still the tools while the field is disabled or read-only; Copy stays. @param {import('./controller.js').JsonFieldController} c */
export function lockTools(c) {
    const area = c.area;
    const { tools, root } = c.parts;
    const off = area.disabled || area.readOnly;
    for (const b of tools.querySelectorAll('button')) b.disabled = off && b.dataset.kpJsonTool !== 'copy';
    root.toggleAttribute('data-kp-json-off', off);
}
