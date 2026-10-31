// What the head's tools do: a layout choice, Wrap, the fold (in place or in a dialog) and Copy.

import { getStrings } from '../strings.js';
import { CODE_COPIED_MS } from './constants.js';
import { drawBody, markBeyond } from './body.js';
import { openInDialog } from './dialog.js';
import { drawHead } from './head.js';

/** @typedef {import('./controller.js').CodeBlock} CodeBlock */

/** The segmented control chose Pretty or Raw. @param {CodeBlock} ctl @param {Event} event */
export function onLayoutChange(ctl, event) {
    const detail = /** @type {CustomEvent<{ value: string | null }>} */ (event).detail;
    const layout = detail?.value === 'raw' ? 'raw' : 'pretty';
    if (layout === ctl.layout) return;
    ctl.layout = layout;
    drawHead(ctl);
    drawBody(ctl);
    ctl.host.dispatchEvent(new CustomEvent('kp-code-layout', { bubbles: true, detail: { layout } }));
}

/** @param {CodeBlock} ctl @param {HTMLButtonElement} button */
function toggleWrap(ctl, button) {
    ctl.wrap = !ctl.wrap;
    button.setAttribute('aria-pressed', String(ctl.wrap));
    ctl.host.toggleAttribute('data-kp-code-wrap', ctl.wrap);
    ctl.host.dispatchEvent(new CustomEvent('kp-code-wrap', { bubbles: true, detail: { wrap: ctl.wrap } }));
}

/** @param {CodeBlock} ctl @param {HTMLButtonElement} button */
function toggleFold(ctl, button) {
    const strings = getStrings();
    ctl.folded = !ctl.folded;
    ctl.host.toggleAttribute('data-kp-code-folded', ctl.folded);
    button.setAttribute('aria-expanded', String(!ctl.folded));
    markBeyond(ctl);
    /** @type {HTMLElement} */ (button.firstElementChild).textContent = ctl.folded ? strings.codeShowAll(ctl.lines) : strings.codeShowLess;
    ctl.host.dispatchEvent(new CustomEvent('kp-code-fold', { bubbles: true, detail: { folded: ctl.folded } }));
}

/** Copy the text as shown, say so in the button and the status region, and put the word back after a moment. @param {CodeBlock} ctl @param {HTMLButtonElement} button */
async function copyText(ctl, button) {
    const strings = getStrings();
    const el = ctl.host;
    const word = /** @type {HTMLElement} */ (button.firstElementChild);
    const status = /** @type {HTMLElement | null} */ (ctl.head?.querySelector('[role="status"]') ?? null);
    const view = el.ownerDocument.defaultView;
    view?.clearTimeout(ctl.revert);
    try {
        await navigator.clipboard.writeText(ctl.shown);
        word.textContent = strings.copied;
        button.setAttribute('data-kp-code-copied', '');
        if (status) status.textContent = strings.codeCopiedAnnouncement(ctl.spec.title ?? ctl.spec.language ?? strings.codeLabel);
        el.dispatchEvent(new CustomEvent('kp-code-copy', { bubbles: true, detail: { text: ctl.shown } }));
    } catch (error) {
        word.textContent = strings.copyBlocked;
        button.setAttribute('data-kp-code-copied', '');
        if (status) status.textContent = strings.copyBlockedAnnouncement;
        el.dispatchEvent(new CustomEvent('kp-code-copy-failed', { bubbles: true, detail: { error } }));
    }
    ctl.revert =
        view?.setTimeout(() => {
            word.textContent = getStrings().copy;
            button.removeAttribute('data-kp-code-copied');
            if (status) status.textContent = '';
        }, CODE_COPIED_MS) ?? 0;
}

/** A click on one of the head's tools or the fold. @param {CodeBlock} ctl @param {MouseEvent} event */
export async function onToolClick(ctl, event) {
    const button = event.target instanceof Element ? /** @type {HTMLButtonElement | null} */ (event.target.closest('[data-kp-code-tool]')) : null;
    if (!button || button.disabled) return;
    const tool = button.dataset.kpCodeTool;
    if (tool === 'wrap') toggleWrap(ctl, button);
    else if (tool === 'fold' && button.dataset.kpCodeOpen === 'dialog') openInDialog(ctl);
    else if (tool === 'fold') toggleFold(ctl, button);
    else if (tool === 'copy') await copyText(ctl, button);
}
